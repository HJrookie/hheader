// Converts the persisted HHeader state into declarativeNetRequest dynamic rules.
import {
  OP,
  MATCH_TYPE,
  DIRECTION,
  toDnrOperation,
  RESOURCE_TYPES,
  APPEND_ALLOWED_HEADERS,
} from './constants.js';
import { buildVarContext, resolveTemplate } from './templating.js';
import { STEALTH_HEADERS } from './presets.js';

// Parse the domains text field into an array of trimmed, non-empty patterns.
export function parseDomains(text) {
  if (!text) return [];
  return text
    .split(/[\n,]/)
    .map((d) => d.trim())
    .filter(Boolean);
}

// Build a DNR urlFilter from a wildcard-style domain pattern.
// Returns null when the pattern means "match everything" (no filter needed).
function wildcardToUrlFilter(domain) {
  let d = domain.trim();
  if (!d) return null;
  // Already an adblock-style filter (||host) or a path-anchored filter (/...): keep as-is.
  if (d.startsWith('||') || d.startsWith('/')) return d;
  // Strip scheme (http://, https://, //).
  d = d.replace(/^[a-z]+:\/\//i, '');
  // Keep only the host part.
  const host = d.split('/')[0].split('?')[0];
  if (!host || host === '*') return null;
  // Both "*.example.com" and "example.com" match the domain + its subdomains via ||host
  const bare = host.replace(/^\*\./, '');
  if (!bare) return null;
  return `||${bare}`;
}

// Wrapper around chrome.declarativeNetRequest.isRegexSupported.
function regexSupported(regex) {
  return new Promise((resolve) => {
    try {
      chrome.declarativeNetRequest.isRegexSupported(
        { regex, isCaseSensitive: false },
        (res) => resolve(!!(res && res.isSupported))
      );
    } catch {
      resolve(false);
    }
  });
}

// Build the DNR `condition` shared by header / redirect rules.
function buildCondition({ domain, matchType, resourceTypes, methods }) {
  const resTypes =
    Array.isArray(resourceTypes) && resourceTypes.length ? resourceTypes : RESOURCE_TYPES;
  const condition = { resourceTypes: resTypes };
  if (Array.isArray(methods) && methods.length) {
    condition.requestMethods = methods.map((m) => m.toLowerCase());
  }
  if (domain) {
    if (matchType === MATCH_TYPE.REGEX) {
      condition.regexFilter = domain;
    } else {
      const uf = wildcardToUrlFilter(domain);
      if (uf) condition.urlFilter = uf;
    }
  }
  return condition;
}

// Build a single modifyHeaders rule (request or response) for one header.
function buildModifyRule({ name, value, operation, direction, condition, priority, allocId, varContext }) {
  const lowerName = (name || '').toLowerCase().trim();
  // Chrome only allows the `append` operation on a small allowlist of protected
  // headers; for any other header, `append` would throw, so fall back to `set`.
  let op = operation;
  if (op === 'append' && !APPEND_ALLOWED_HEADERS.has(lowerName)) op = 'set';

  const headerObj = { header: name.trim(), operation: op };
  if (op !== 'remove') {
    // Resolve {{TIMESTAMP}} / {{UUID}} / custom variables at build time.
    headerObj.value = resolveTemplate(value ?? '', varContext);
  }
  const key = direction === DIRECTION.RESPONSE ? 'responseHeaders' : 'requestHeaders';
  return {
    id: allocId(),
    priority,
    action: { type: 'modifyHeaders', [key]: [headerObj] },
    condition,
  };
}

// Build a redirect rule (request direction only).
function buildRedirectRule({ url, condition, priority, allocId }) {
  if (!url || !/^https?:\/\//i.test(url.trim())) return null;
  return {
    id: allocId(),
    priority,
    action: { type: 'redirect', redirect: { url: url.trim() } },
    condition,
  };
}

// Build a rule for one (header-spec, domain) pair. Returns null when the spec
// cannot produce a valid rule (e.g. empty redirect URL). Script specs are
// expanded by the caller (buildDynamicRules) since they map to many headers.
function buildRule(spec, domain, matchType, priority, allocId, varContext) {
  const direction = spec.direction === DIRECTION.RESPONSE ? DIRECTION.RESPONSE : DIRECTION.REQUEST;
  const condition = buildCondition({
    domain,
    matchType,
    resourceTypes: spec.resourceTypes,
    methods: spec.methods,
  });

  if (spec.op === OP.REDIRECT) {
    return buildRedirectRule({ url: spec.redirect, condition, priority, allocId });
  }

  const operation = toDnrOperation(spec.op); // add->append, modify->set, filter->remove
  return buildModifyRule({
    name: spec.name,
    value: spec.value,
    operation,
    direction,
    condition,
    priority,
    allocId,
    varContext,
  });
}

// Priority base for user profile rules. Kept well above the stealth base (1)
// so user rules always win over the injected stealth rules.
const USER_PRIORITY_BASE = 100;

// Convert state -> { rules, warnings }.
// Async because regex domains are validated via isRegexSupported and skipped if unsupported.
export async function buildDynamicRules(state) {
  const rules = [];
  const warnings = [];
  let idCounter = 0;
  const allocId = () => ++idCounter;

  const profiles = (state && state.profiles) || [];
  const varContext = buildVarContext((state && state.variables) || []);

  // Plain name->value map for script evaluation context.
  const variables = (state && state.variables) || [];
  const varMap = {};
  variables.forEach((v) => {
    if (v.name) varMap[v.name] = resolveTemplate(v.value ?? '', varContext);
  });

  // 1. Collect candidate (spec, domain) pairs from enabled profiles.
  const candidates = [];
  profiles.forEach((profile, pIndex) => {
    if (!profile.enabled) return;
    (profile.headers || []).forEach((header, hIndex) => {
      const isRedirect = header.op === OP.REDIRECT;
      const isScript = header.op === OP.SCRIPT;
      // Skip unnamed static headers; redirect needs a URL, script needs source.
      if (!isRedirect && !isScript && !(header.name && header.name.trim())) return;

      // Script rules are evaluated (in the popup) into a static `resolved`
      // header list; expand them here. No per-request logic is possible in DNR.
      let resolved = [header];
      if (isScript) {
        const out = Array.isArray(header.resolved) ? header.resolved : [];
        if (!out.length) {
          warnings.push(`Script rule "${header.name || '(script)'}" has no computed headers yet.`);
          return;
        }
        resolved = out.map((h) => ({
          ...header,
          op: OP.MODIFY,
          name: h.name,
          value: h.value,
        }));
      }

      const domains = parseDomains(header.domains);
      const matchType = header.matchType || MATCH_TYPE.WILDCARD;
      const priority = USER_PRIORITY_BASE + pIndex * 1000 + hIndex; // later rules win
      if (domains.length === 0) {
        candidates.push({ spec: resolved, domain: '', matchType, priority, isScript });
      } else {
        domains.forEach((domain) =>
          candidates.push({ spec: resolved, domain, matchType, priority, isScript })
        );
      }
    });
  });

  // 2. Global Stealth Mode: fold in privacy rules at a low priority.
  if (state && state.settings && state.settings.stealth) {
    STEALTH_HEADERS.forEach((sh, i) => {
      candidates.push({ spec: [sh], domain: '', matchType: MATCH_TYPE.WILDCARD, priority: 1 + i, isScript: false });
    });
  }

  // 3. Validate regex domains, then materialize rules.
  for (const c of candidates) {
    if (c.matchType === MATCH_TYPE.REGEX && c.domain) {
      const ok = await regexSupported(c.domain);
      if (!ok) {
        warnings.push(`Regex not supported by Chrome, skipped: ${c.domain}`);
        continue;
      }
    }
    // A script expansion may yield several headers (each its own rule).
    const specs = Array.isArray(c.spec) ? c.spec : [c.spec];
    for (const spec of specs) {
      const rule = buildRule(spec, c.domain, c.matchType, c.priority, allocId, varContext);
      if (rule) rules.push(rule);
    }
  }

  return { rules, warnings };
}
