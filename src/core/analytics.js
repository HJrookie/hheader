// Persistent analytics counters for the Stats dashboard.
// Stored under a single key in chrome.storage.local; updated incrementally by
// the background service worker on every matched rule.

export const STATS_KEY = 'hheader:stats';

export function emptyStats() {
  return {
    total: 0, // total matched rules
    corsFixed: 0, // matches that touched a CORS / CSP header
    headerCounts: {}, // { headerName: count } — most-modified headers
    byDir: { request: 0, response: 0 }, // request vs response traffic
    hours: {}, // { "2026-07-13T14": count } — last-24h bucket
  };
}

export async function loadStats() {
  try {
    const res = await chrome.storage.local.get(STATS_KEY);
    return res[STATS_KEY] || emptyStats();
  } catch {
    return emptyStats();
  }
}

export async function saveStats(stats) {
  try {
    await chrome.storage.local.set({ [STATS_KEY]: stats });
  } catch {
    /* best-effort */
  }
}

export async function resetStats() {
  await saveStats(emptyStats());
}

// A header name that, when modified/removed, is effectively "fixing" a CORS or
// CSP problem the developer was debugging.
export function isCorsRelated(name) {
  const n = (name || '').toLowerCase();
  return (
    n === 'access-control-allow-origin' ||
    n.startsWith('access-control-') ||
    n === 'content-security-policy'
  );
}

// Hour bucket key, e.g. "2026-07-13T14".
function hourKey(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}`;
}

// Mutate a stats object in place for one matched rule.
export function bumpStats(stats, { header, direction, isCors }) {
  stats.total += 1;
  const dir = direction === 'response' ? 'response' : 'request';
  stats.byDir[dir] = (stats.byDir[dir] || 0) + 1;
  if (header) {
    stats.headerCounts[header] = (stats.headerCounts[header] || 0) + 1;
  }
  if (isCors) stats.corsFixed += 1;
  const k = hourKey(Date.now());
  stats.hours[k] = (stats.hours[k] || 0) + 1;
  return stats;
}

// Keep only the last 24 hour buckets (so storage doesn't grow forever).
export function pruneHours(stats) {
  const keys = Object.keys(stats.hours);
  if (keys.length <= 24) return stats;
  const now = Date.now();
  for (const k of keys) {
    const t = new Date(k.replace('T', ' ') + ':00').getTime();
    if (now - t > 25 * 3600 * 1000) delete stats.hours[k];
  }
  return stats;
}
