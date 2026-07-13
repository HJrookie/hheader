// Shared constants and factory helpers for HHeader.

export const STORAGE_KEY = 'hheader:state';

// Rule operation types (user-facing)
export const OP = {
  ADD: 'add', // append a header value (create if absent)
  MODIFY: 'modify', // set / replace a header value
  FILTER: 'filter', // delete a header
  REDIRECT: 'redirect', // (request only) send the matching request to another URL
  SCRIPT: 'script', // evaluate a JS function to produce static headers (snapshot)
};

// Operations offered in the per-rule "op" select.
export const OP_OPTIONS = [
  { value: OP.ADD, label: 'Add' },
  { value: OP.MODIFY, label: 'Modify' },
  { value: OP.FILTER, label: 'Filter' },
  { value: OP.REDIRECT, label: 'Redirect' },
  { value: OP.SCRIPT, label: 'Script' },
];

// Which header the rule touches: the outgoing request, or the incoming response.
export const DIRECTION = {
  REQUEST: 'request',
  RESPONSE: 'response',
};

// Domain matching strategies
export const MATCH_TYPE = {
  WILDCARD: 'wildcard', // glob-style domain filter (supports *)
  REGEX: 'regex', // JS-style regex matched against the full request URL
};

// Activation strategy for profiles
export const ACTIVATION = {
  MULTIPLE: 'multiple', // several profiles may be active at once
  SINGLE: 'single', // only one profile active at a time
};

// Preset color palette for profiles. Users tag environments (dev=blue,
// prod=red, ...) so a misconfigured environment is visually obvious.
export const PROFILE_COLORS = [
  { id: 'blue', hex: '#3b82f6', label: 'Blue' },
  { id: 'red', hex: '#ef4444', label: 'Red' },
  { id: 'green', hex: '#22c55e', label: 'Green' },
  { id: 'amber', hex: '#f59e0b', label: 'Amber' },
  { id: 'purple', hex: '#a855f7', label: 'Purple' },
  { id: 'teal', hex: '#14b8a6', label: 'Teal' },
  { id: 'pink', hex: '#ec4899', label: 'Pink' },
  { id: 'slate', hex: '#64748b', label: 'Slate' },
];
export const DEFAULT_PROFILE_COLOR = PROFILE_COLORS[0].hex;

// Map a user operation to a declarativeNetRequest header operation.
// NOTE: `append` is restricted by Chrome to a small set of headers
// (user-agent, cookie, accept-*, etc.). `set`/`remove` are unrestricted.
// "Add" => append (ModHeader-style add), "Modify" => set, "Filter" => remove.
export function toDnrOperation(op) {
  switch (op) {
    case OP.ADD:
      return 'append';
    case OP.MODIFY:
      return 'set';
    case OP.FILTER:
      return 'remove';
    default:
      return 'set';
  }
}

// Resource types we want header rules to apply to (broad coverage).
export const RESOURCE_TYPES = [
  'main_frame',
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'csp_report',
  'media',
  'websocket',
  'other',
];

// Resource types offered in the per-rule "advanced filter" UI, with friendly
// labels. A rule with an empty resourceTypes[] applies to ALL types above.
export const RESOURCE_TYPE_OPTIONS = [
  { id: 'main_frame', label: 'Document' },
  { id: 'sub_frame', label: 'Frame' },
  { id: 'xmlhttprequest', label: 'Fetch / XHR' },
  { id: 'script', label: 'Script' },
  { id: 'stylesheet', label: 'CSS' },
  { id: 'image', label: 'Image' },
  { id: 'font', label: 'Font' },
  { id: 'media', label: 'Media' },
  { id: 'websocket', label: 'WebSocket' },
  { id: 'ping', label: 'Ping' },
  { id: 'other', label: 'Other' },
];

// HTTP methods offered in the per-rule filter. Empty methods[] = all methods.
export const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];

// Headers that Chrome ALLOWS the `append` operation on (case-sensitive allowlist).
// For any other header, `append` would throw when the rule is added, so we
// fall back to `set`. Source: chrome.declarativeNetRequest docs.
export const APPEND_ALLOWED_HEADERS = new Set([
  'accept',
  'accept-encoding',
  'accept-language',
  'access-control-request-headers',
  'cache-control',
  'connection',
  'content-language',
  'cookie',
  'forwarded',
  'if-match',
  'if-none-match',
  'keep-alive',
  'range',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'user-agent',
  'via',
  'want-digest',
  'x-forwarded-for',
]);

// UI theme options.
export const THEME = { AUTO: 'auto', LIGHT: 'light', DARK: 'dark' };

export function defaultSettings() {
  return {
    activation: ACTIVATION.MULTIPLE,
    theme: THEME.AUTO,
    iconColorSync: true, // tint the toolbar icon with the active profile color
    stealth: false, // global "anti-tracking" switch (injects stealth rules)
    gist: { id: '', token: '' }, // GitHub Gist sync
    webdav: { url: '', user: '', pass: '' }, // WebDAV sync (坚果云 / 群晖)
    repo: { repo: '', path: 'hheader-config.json', token: '' }, // private GitHub repo sync
  };
}

export function defaultState() {
  return {
    settings: defaultSettings(),
    profiles: [],
    variables: [], // [{ id, name, value }]
  };
}

export function newVariable(name, value) {
  return { id: uid('v'), name: name || '', value: value || '' };
}

let _seq = 0;
export function uid(prefix) {
  _seq += 1;
  return `${prefix}_${Date.now().toString(36)}${_seq.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export function newProfile(name, color) {
  return {
    id: uid('p'),
    name: name || 'New Profile',
    enabled: true,
    color: color || DEFAULT_PROFILE_COLOR,
    headers: [],
  };
}

export function newHeader(seed) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const op =
    s.op === OP.MODIFY ||
    s.op === OP.FILTER ||
    s.op === OP.REDIRECT ||
    s.op === OP.SCRIPT
      ? s.op
      : OP.ADD;
  return {
    id: uid('h'),
    op,
    name: typeof s.name === 'string' ? s.name : '',
    value: typeof s.value === 'string' ? s.value : '',
    direction: s.direction === DIRECTION.RESPONSE ? DIRECTION.RESPONSE : DIRECTION.REQUEST,
    domains: typeof s.domains === 'string' ? s.domains : '', // comma / newline separated
    matchType: s.matchType === MATCH_TYPE.REGEX ? MATCH_TYPE.REGEX : MATCH_TYPE.WILDCARD,
    resourceTypes: Array.isArray(s.resourceTypes) ? s.resourceTypes : [], // [] = all
    methods: Array.isArray(s.methods) ? s.methods : [], // [] = all methods
    // redirect target URL (op === 'redirect'); script source (op === 'script')
    redirect: typeof s.redirect === 'string' ? s.redirect : '',
    script: typeof s.script === 'string' ? s.script : '',
    // headers computed from `script` at edit/sync time (op === 'script'); snapshot
    resolved: Array.isArray(s.resolved) ? s.resolved : [],
  };
}

// Coerce arbitrary (possibly imported or legacy) data into a valid profile.
// Guarantees every profile has the fields the UI relies on, assigns a default
// color when missing, and regenerates ids so imports never collide.
export function normalizeProfile(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const headers = Array.isArray(p.headers) ? p.headers : [];
  return {
    id: uid('p'),
    name: typeof p.name === 'string' && p.name ? p.name : 'Imported Profile',
    enabled: p.enabled !== false,
    color: typeof p.color === 'string' && p.color ? p.color : DEFAULT_PROFILE_COLOR,
    headers: headers.map((h) => {
      const hh = h && typeof h === 'object' ? h : {};
      const op =
        hh.op === OP.MODIFY ||
        hh.op === OP.FILTER ||
        hh.op === OP.REDIRECT ||
        hh.op === OP.SCRIPT
          ? hh.op
          : OP.ADD;
      return {
        id: uid('h'),
        op,
        name: typeof hh.name === 'string' ? hh.name : '',
        value: typeof hh.value === 'string' ? hh.value : '',
        direction: hh.direction === DIRECTION.RESPONSE ? DIRECTION.RESPONSE : DIRECTION.REQUEST,
        domains: typeof hh.domains === 'string' ? hh.domains : '',
        matchType: hh.matchType === MATCH_TYPE.REGEX ? MATCH_TYPE.REGEX : MATCH_TYPE.WILDCARD,
        resourceTypes: Array.isArray(hh.resourceTypes) ? hh.resourceTypes : [],
        methods: Array.isArray(hh.methods) ? hh.methods : [],
        redirect: typeof hh.redirect === 'string' ? hh.redirect : '',
        script: typeof hh.script === 'string' ? hh.script : '',
        resolved: Array.isArray(hh.resolved) ? hh.resolved : [],
      };
    }),
  };
}

// Coerce arbitrary data into a valid top-level state object.
export function normalizeState(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const profiles = Array.isArray(s.profiles) ? s.profiles : [];
  const settings = s.settings && typeof s.settings === 'object' ? s.settings : {};
  const gist = settings.gist && typeof settings.gist === 'object' ? settings.gist : {};
  const webdav = settings.webdav && typeof settings.webdav === 'object' ? settings.webdav : {};
  const repo = settings.repo && typeof settings.repo === 'object' ? settings.repo : {};
  const variables = Array.isArray(s.variables) ? s.variables : [];
  const validThemes = [THEME.AUTO, THEME.LIGHT, THEME.DARK];
  return {
    settings: {
      activation: settings.activation === ACTIVATION.SINGLE ? ACTIVATION.SINGLE : ACTIVATION.MULTIPLE,
      theme: validThemes.includes(settings.theme) ? settings.theme : THEME.AUTO,
      iconColorSync: settings.iconColorSync !== false,
      stealth: settings.stealth === true,
      gist: {
        id: typeof gist.id === 'string' ? gist.id : '',
        token: typeof gist.token === 'string' ? gist.token : '',
      },
      webdav: {
        url: typeof webdav.url === 'string' ? webdav.url : '',
        user: typeof webdav.user === 'string' ? webdav.user : '',
        pass: typeof webdav.pass === 'string' ? webdav.pass : '',
      },
      repo: {
        repo: typeof repo.repo === 'string' ? repo.repo : '',
        path: typeof repo.path === 'string' && repo.path ? repo.path : 'hheader-config.json',
        token: typeof repo.token === 'string' ? repo.token : '',
      },
    },
    profiles: profiles.map(normalizeProfile),
    variables: variables.map((v) => {
      const vv = v && typeof v === 'object' ? v : {};
      return {
        id: uid('v'),
        name: typeof vv.name === 'string' ? vv.name : '',
        value: typeof vv.value === 'string' ? vv.value : '',
      };
    }),
  };
}
