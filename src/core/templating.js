// Variable / dynamic-placeholder substitution for header values.
//
// IMPORTANT (Manifest V3 limitation): declarativeNetRequest is *declarative* —
// a header value is fixed at the moment the rule is registered. Chrome does not
// run our code per outgoing request, so {{TIMESTAMP}} / {{UUID}} are evaluated
// when rules are (re)built, NOT for every single request. The service worker
// re-syncs periodically (chrome.alarms) so {{TIMESTAMP}} stays roughly current.
// Custom variables (e.g. {{Token}}) are static and therefore fully accurate.

// A tiny UUID v4 generator that works in both the popup and the service worker.
function uuidv4() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback (should rarely be needed in modern Chrome).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Names reserved for built-in dynamic values (documented in the UI).
export const BUILTIN_VARS = [
  { name: 'TIMESTAMP', desc: 'Unix time in seconds (evaluated at rule-sync time)' },
  { name: 'TIMESTAMP_MS', desc: 'Unix time in milliseconds' },
  { name: 'ISODATE', desc: 'ISO-8601 datetime, e.g. 2026-07-13T04:45:00.000Z' },
  { name: 'DATE', desc: 'Calendar date, e.g. 2026-07-13' },
  { name: 'UUID', desc: 'Random UUID v4 (fresh per occurrence)' },
  { name: 'RANDOM', desc: 'Random integer 0–999999' },
];

// Build the substitution context from user-defined variables. Built-ins are
// resolved lazily (functions) so {{UUID}} differs on each occurrence while
// {{TIMESTAMP}} stays consistent within a single rule build.
export function buildVarContext(variables = []) {
  const now = new Date();
  const ctx = {
    TIMESTAMP: () => String(Math.floor(now.getTime() / 1000)),
    TIMESTAMP_MS: () => String(now.getTime()),
    ISODATE: () => now.toISOString(),
    DATE: () => now.toISOString().slice(0, 10),
    UUID: () => uuidv4(),
    RANDOM: () => String(Math.floor(Math.random() * 1000000)),
  };
  // User variables override nothing built-in but add their own names.
  (variables || []).forEach((v) => {
    if (v && typeof v.name === 'string' && v.name.trim()) {
      const val = typeof v.value === 'string' ? v.value : '';
      ctx[v.name.trim()] = val; // static string
    }
  });
  return ctx;
}

// Replace every {{NAME}} token in `value` using the given context.
// Unknown tokens are left untouched (so a stray {{X}} is visible, not silently
// blanked). Functions in the context are called per occurrence.
export function resolveTemplate(value, context) {
  if (typeof value !== 'string' || value.indexOf('{{') === -1) return value;
  return value.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (match, name) => {
    if (!Object.prototype.hasOwnProperty.call(context, name)) return match;
    const entry = context[name];
    return typeof entry === 'function' ? entry() : String(entry);
  });
}

// Does the value reference any placeholder at all? (used for UI hints)
export function hasPlaceholder(value) {
  return typeof value === 'string' && /\{\{\s*[A-Za-z0-9_.-]+\s*\}\}/.test(value);
}
