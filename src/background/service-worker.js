// HHeader background service worker.
// Rebuilds declarativeNetRequest dynamic rules whenever the stored config
// changes, and powers the debug log, dynamic-icon, alarm refresh and context menu.
import { loadState, saveState, onStateChanged } from '../core/storage.js';
import { buildDynamicRules } from '../core/ruleEngine.js';
import { newHeader, newProfile, DEFAULT_PROFILE_COLOR } from '../core/constants.js';
import { loadStats, saveStats, bumpStats, pruneHours, isCorsRelated } from '../core/analytics.js';

const MSG_SYNC = 'HH_SYNC';
const LOG_KEY = 'hheader:log';
const META_KEY = 'hheader:rulemeta';
const REFRESH_ALARM = 'hh-refresh';
const CTX_ADD_DOMAIN = 'hh-add-domain';
const MAX_LOG = 10;

let currentRuleIds = [];

// Placeholders whose values change over time -> require periodic re-sync.
const DYNAMIC_TOKENS = /\{\{\s*(TIMESTAMP|TIMESTAMP_MS|ISODATE|DATE|UUID|RANDOM)\s*\}\}/;
function hasDynamicPlaceholders(state) {
  return (state.profiles || []).some((p) =>
    p.enabled && (p.headers || []).some((h) => DYNAMIC_TOKENS.test(h.value || ''))
  );
}

async function syncRules() {
  const state = await loadState();
  const { rules, warnings } = await buildDynamicRules(state);

  try {
    // Chrome requires removeRuleIds and addRules to be disjoint in a single
    // updateDynamicRules call. We therefore clear all existing dynamic rules,
    // then add the new set. We fetch getDynamicRules() rather than relying on
    // currentRuleIds, because the service worker may have restarted and the
    // in-memory variable would be stale.
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existing.map((r) => r.id),
      addRules: [],
    });
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [],
      addRules: rules,
    });
    currentRuleIds = rules.map((r) => r.id);
  } catch (err) {
    console.error('[HHeader] failed to update dynamic rules:', err);
    try {
      const existing = await chrome.declarativeNetRequest.getDynamicRules();
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existing.map((r) => r.id),
        addRules: [],
      });
      currentRuleIds = [];
    } catch (e2) {
      console.error('[HHeader] recovery failed:', e2);
    }
  }

  // Persist a ruleId -> header-change map so the debug log can be enriched even
  // after the service worker restarts. Covers request, response and redirect rules.
  const meta = {};
  rules.forEach((r) => {
    if (r.action.type === 'redirect') {
      meta[r.id] = { direction: 'request', redirect: true, operation: 'redirect', header: '', value: '' };
      return;
    }
    const req = r.action.requestHeaders && r.action.requestHeaders[0];
    const res = r.action.responseHeaders && r.action.responseHeaders[0];
    const h = req || res;
    if (h) {
      meta[r.id] = {
        direction: req ? 'request' : 'response',
        operation: h.operation,
        header: h.header,
        value: h.value || '',
      };
    }
  });
  try {
    await chrome.storage.session.set({ [META_KEY]: meta });
  } catch {
    /* session storage may be unavailable in some contexts */
  }

  // Badge = number of rules actually loaded.
  const ruleCount = rules.length;
  try {
    await chrome.action.setBadgeText({ text: ruleCount ? String(ruleCount) : '' });
    await chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' });
  } catch {
    /* badge not critical */
  }

  // Sync the toolbar icon color with the active profile.
  await updateIcon(state);

  // Schedule / cancel periodic refresh depending on dynamic placeholders.
  try {
    if (hasDynamicPlaceholders(state)) {
      await chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: 1 });
    } else {
      await chrome.alarms.clear(REFRESH_ALARM);
    }
  } catch {
    /* alarms optional */
  }

  if (warnings.length) console.warn('[HHeader] rule warnings:', warnings);
}

// ---------- Dynamic toolbar icon (tinted with active profile color) ----------
function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return { r: 59, g: 130, b: 246 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function drawIcon(size, color, dimmed) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const { r, g, b } = hexToRgb(color);
  const a = dimmed ? 0.4 : 1;
  const x = size * 0.05;
  const w = size * 0.9;
  const radius = size * 0.2;

  // Rounded square with subtle gradient (color -> slightly darker)
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, `rgba(${r},${g},${b},${a})`);
  grad.addColorStop(1, `rgba(${Math.round(r * 0.8)},${Math.round(g * 0.8)},${Math.round(b * 0.8)},${a})`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(x + radius, x);
  ctx.arcTo(x + w, x, x + w, x + w, radius);
  ctx.arcTo(x + w, x + w, x, x + w, radius);
  ctx.arcTo(x, x + w, x, x, radius);
  ctx.arcTo(x, x, x + w, x, radius);
  ctx.closePath();
  ctx.fill();

  // White "H" (stroked, rounded caps) — matches icon.svg proportions
  const sw = size * 0.1;
  ctx.strokeStyle = `rgba(255,255,255,${a})`;
  ctx.lineWidth = sw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const cx0 = size * 0.36, cx1 = size * 0.64;
  const cy0 = size * 0.3, cy1 = size * 0.7, cyMid = size * 0.5;
  ctx.beginPath();
  ctx.moveTo(cx0, cy0); ctx.lineTo(cx0, cy1);
  ctx.moveTo(cx1, cy0); ctx.lineTo(cx1, cy1);
  ctx.moveTo(cx0, cyMid); ctx.lineTo(cx1, cyMid);
  ctx.stroke();

  // Crisp inner border
  const bw = Math.max(1, size * 0.01);
  ctx.strokeStyle = `rgba(255,255,255,${a * 0.18})`;
  ctx.lineWidth = bw;
  ctx.strokeRect(x + bw / 2, x + bw / 2, w - bw, w - bw);

  return ctx.getImageData(0, 0, size, size);
}

async function updateIcon(state) {
  try {
    const enabled = (state.profiles || []).filter((p) => p.enabled);
    const sync = state.settings && state.settings.iconColorSync !== false;
    const color = sync && enabled.length ? enabled[0].color || DEFAULT_PROFILE_COLOR : '#64748b';
    const dimmed = enabled.length === 0;
    await chrome.action.setIcon({
      imageData: {
        16: drawIcon(16, color, dimmed),
        32: drawIcon(32, color, dimmed),
        48: drawIcon(48, color, dimmed),
        128: drawIcon(128, color, dimmed),
      },
    });
  } catch (e) {
    /* setIcon may fail if OffscreenCanvas unavailable; non-critical */
  }
}

// ---------- Analytics recorder (throttled write to storage.local) ----------
let statsBuffer = { total: 0, corsFixed: 0, headerCounts: {}, byDir: { request: 0, response: 0 }, hours: {} };
let statsFlushTimer = null;
// Hydrate from storage at startup so counters accumulate across SW restarts.
loadStats()
  .then((s) => {
    statsBuffer = s;
  })
  .catch(() => {});
async function flushStats() {
  if (!statsBuffer) return;
  statsFlushTimer = null;
  await saveStats(pruneHours(statsBuffer));
}
function recordStat({ header, direction, isCors }) {
  bumpStats(statsBuffer, { header, direction, isCors });
  if (!statsFlushTimer) statsFlushTimer = setTimeout(flushStats, 1500);
}

// ---------- Debug log via onRuleMatchedDebug (unpacked/dev only) ----------
async function recordMatch(info) {
  try {
    const rule = info.rule || {};
    const req = info.request || {};
    const sess = await chrome.storage.session.get([LOG_KEY, META_KEY]);
    const meta = (sess[META_KEY] || {})[rule.ruleId] || {};
    const entry = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ts: Date.now(),
      url: req.url || '',
      method: (req.method || 'get').toUpperCase(),
      type: req.type || '',
      requestId: (req.requestId || '') + '',
      ruleId: rule.ruleId,
      direction: meta.direction || 'request',
      header: meta.header || '',
      operation: meta.operation || '',
      value: meta.value || '',
    };
    const log = Array.isArray(sess[LOG_KEY]) ? sess[LOG_KEY] : [];
    log.unshift(entry);
    if (log.length > MAX_LOG) log.length = MAX_LOG;
    await chrome.storage.session.set({ [LOG_KEY]: log });

    // Analytics: count the match (skip redirects — they have no header name).
    if (!meta.redirect) {
      recordStat({
        header: meta.header || '',
        direction: meta.direction || 'request',
        isCors: isCorsRelated(meta.header),
      });
    }
  } catch {
    /* logging is best-effort */
  }
}

if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(recordMatch);
}

// ---------- Context menu: add current domain to HHeader ----------
function setupContextMenu() {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: CTX_ADD_DOMAIN,
        title: '将当前域名加入 HHeader',
        contexts: ['page', 'selection', 'link'],
      });
    });
  } catch {
    /* contextMenus optional */
  }
}

async function addDomainToConfig(domain) {
  if (!domain) return;
  const state = await loadState();
  let profile = state.profiles.find((p) => p.enabled) || state.profiles[0];
  if (!profile) {
    profile = newProfile('Quick', DEFAULT_PROFILE_COLOR);
    state.profiles.push(profile);
  }
  profile.headers.push(newHeader({ domains: domain }));
  await saveState(state);
  await syncRules();
}

chrome.contextMenus &&
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== CTX_ADD_DOMAIN) return;
    let url = info.linkUrl || (tab && tab.url) || '';
    try {
      const host = new URL(url).hostname;
      if (host) addDomainToConfig(host);
    } catch {
      /* not a valid URL */
    }
  });

// ---------- Wiring ----------
chrome.runtime.onInstalled.addListener(() => {
  setupContextMenu();
  syncRules();
});
chrome.runtime.onStartup.addListener(() => {
  setupContextMenu();
  syncRules();
});

chrome.alarms &&
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === REFRESH_ALARM) syncRules();
  });

// The popup sends this message after persisting changes; messages wake the SW,
// unlike storage.onChanged which does not.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === MSG_SYNC) syncRules();
});

// Backup path: react to storage edits while the SW happens to be alive.
onStateChanged(() => syncRules());

// Apply rules whenever the SW wakes.
syncRules();
