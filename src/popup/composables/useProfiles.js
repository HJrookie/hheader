// Reactive store for the popup. The single source of truth is chrome.storage.local;
// the background service worker rebuilds DNR rules on every HH_SYNC message.
import { reactive, ref, watch } from 'vue';
import { loadState, saveState } from '../../core/storage.js';
import {
  defaultState,
  newProfile,
  newHeader,
  newVariable,
  ACTIVATION,
  PROFILE_COLORS,
  normalizeState,
  uid,
} from '../../core/constants.js';
import { buildDynamicRules } from '../../core/ruleEngine.js';
import { getPresetHeaders } from '../../core/presets.js';
import { loadStats, resetStats as resetStatsStore } from '../../core/analytics.js';

const LOG_KEY = 'hheader:log';

const state = reactive(defaultState());
const ready = ref(false);

// Live count of rules actually pushed to declarativeNetRequest. Mirrors the
// badge on the toolbar icon so the popup can show the same number.
const activeRules = ref(0);
async function refreshActiveRules() {
  try {
    const { rules } = await buildDynamicRules(JSON.parse(JSON.stringify(state)));
    activeRules.value = rules.length;
  } catch {
    activeRules.value = 0;
  }
}
watch(state, refreshActiveRules, { deep: true });
refreshActiveRules();

let persistTimer = null;
function persist(immediate = false) {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  const run = async () => {
    const plain = JSON.parse(JSON.stringify(state));
    await saveState(plain);
    try {
      await chrome.runtime.sendMessage({ type: 'HH_SYNC' });
    } catch {
      /* SW may be restarting; it will resync on next wake/install */
    }
  };
  if (immediate) {
    run();
    return;
  }
  persistTimer = setTimeout(run, 250);
}

async function init() {
  const loaded = await loadState();
  Object.assign(state, loaded);
  if (!state.settings) state.settings = { activation: ACTIVATION.MULTIPLE };
  ready.value = true;
}

function setActivation(mode) {
  state.settings.activation = mode;
  if (mode === ACTIVATION.SINGLE) {
    let first = true;
    state.profiles.forEach((p) => {
      if (p.enabled) {
        if (first) first = false;
        else p.enabled = false;
      }
    });
  }
  persist(true);
}

function addProfile() {
  const color = PROFILE_COLORS[state.profiles.length % PROFILE_COLORS.length].hex;
  state.profiles.push(newProfile(`Profile ${state.profiles.length + 1}`, color));
  persist(true);
}

function removeProfile(id) {
  const i = state.profiles.findIndex((p) => p.id === id);
  if (i >= 0) state.profiles.splice(i, 1);
  persist(true);
}

// One-click clone: deep-copy a profile (fresh ids) right after the original.
function cloneProfile(id) {
  const i = state.profiles.findIndex((p) => p.id === id);
  if (i < 0) return;
  const src = state.profiles[i];
  const copy = {
    ...JSON.parse(JSON.stringify(src)),
    id: uid('p'),
    name: `${src.name} (copy)`,
    headers: src.headers.map((h) => ({ ...h, id: uid('h') })),
  };
  state.profiles.splice(i + 1, 0, copy);
  persist(true);
}

function setProfileColor(id, color) {
  const p = state.profiles.find((x) => x.id === id);
  if (p) p.color = color;
  persist();
}

function toggleProfile(id) {
  const p = state.profiles.find((x) => x.id === id);
  if (!p) return;
  const turningOn = !p.enabled;
  p.enabled = turningOn;
  if (turningOn && state.settings.activation === ACTIVATION.SINGLE) {
    state.profiles.forEach((other) => {
      if (other.id !== id) other.enabled = false;
    });
  }
  persist(true);
}

function renameProfile(id, name) {
  const p = state.profiles.find((x) => x.id === id);
  if (p) p.name = name;
  persist();
}

function addHeader(profileId) {
  const p = state.profiles.find((x) => x.id === profileId);
  if (p) p.headers.push(newHeader());
  persist(true);
}

function updateHeader(profileId, headerId, patch) {
  const p = state.profiles.find((x) => x.id === profileId);
  if (!p) return;
  const h = p.headers.find((x) => x.id === headerId);
  if (h) Object.assign(h, patch);
  persist();
}

function removeHeader(profileId, headerId) {
  const p = state.profiles.find((x) => x.id === profileId);
  if (!p) return;
  const i = p.headers.findIndex((x) => x.id === headerId);
  if (i >= 0) p.headers.splice(i, 1);
  persist(true);
}

function enabledCount() {
  return state.profiles.filter((p) => p.enabled).length;
}

// ---------- Variables ----------
function addVariable() {
  if (!state.variables) state.variables = [];
  state.variables.push(newVariable('', ''));
  persist(true);
}
function updateVariable(id, patch) {
  const v = state.variables.find((x) => x.id === id);
  if (v) Object.assign(v, patch);
  persist();
}
function removeVariable(id) {
  const i = state.variables.findIndex((x) => x.id === id);
  if (i >= 0) state.variables.splice(i, 1);
  persist(true);
}

// ---------- Presets ----------
function applyPreset(profileId, presetId) {
  const p = state.profiles.find((x) => x.id === profileId);
  if (!p) return;
  getPresetHeaders(presetId).forEach((seed) => p.headers.push(newHeader(seed)));
  persist(true);
}
// Create a brand-new profile seeded from a preset.
function addProfileFromPreset(presetId, name) {
  const color = PROFILE_COLORS[state.profiles.length % PROFILE_COLORS.length].hex;
  const p = newProfile(name || 'Preset', color);
  getPresetHeaders(presetId).forEach((seed) => p.headers.push(newHeader(seed)));
  state.profiles.push(p);
  persist(true);
}

// ---------- Reordering (drag & drop) ----------
function moveProfile(from, to) {
  if (from === to || from < 0 || to < 0) return;
  const arr = state.profiles;
  if (from >= arr.length || to >= arr.length) return;
  arr.splice(to, 0, arr.splice(from, 1)[0]);
  persist(true);
}
function moveHeader(profileId, from, to) {
  const p = state.profiles.find((x) => x.id === profileId);
  if (!p || from === to) return;
  const arr = p.headers;
  if (from < 0 || to < 0 || from >= arr.length || to >= arr.length) return;
  arr.splice(to, 0, arr.splice(from, 1)[0]);
  persist(true);
}

// ---------- Theme / settings ----------
function setTheme(theme) {
  state.settings.theme = theme;
  persist(true);
}
function setIconColorSync(on) {
  state.settings.iconColorSync = !!on;
  persist(true);
}
function setStealth(on) {
  state.settings.stealth = !!on;
  persist(true);
}

// ---------- WebDAV sync ----------
function setWebdav(patch) {
  if (!state.settings.webdav) state.settings.webdav = { url: '', user: '', pass: '' };
  Object.assign(state.settings.webdav, patch);
  persist();
}
async function pushToWebdav() {
  const { url, user, pass } = state.settings.webdav || {};
  if (!url) return { ok: false, message: '请先填写 WebDAV 文件 URL' };
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (user) headers.Authorization = 'Basic ' + btoa(`${user}:${pass}`);
    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(getStatePlain(), null, 2),
    });
    if (!res.ok) return { ok: false, message: `WebDAV 推送失败：HTTP ${res.status}` };
    return { ok: true, message: '已推送到 WebDAV' };
  } catch (e) {
    return { ok: false, message: '推送出错：' + (e && e.message ? e.message : e) };
  }
}
async function pullFromWebdav() {
  const { url, user, pass } = state.settings.webdav || {};
  if (!url) return { ok: false, message: '请先填写 WebDAV 文件 URL' };
  try {
    const headers = {};
    if (user) headers.Authorization = 'Basic ' + btoa(`${user}:${pass}`);
    const res = await fetch(url, { headers });
    if (!res.ok) return { ok: false, message: `WebDAV 拉取失败：HTTP ${res.status}` };
    const parsed = await res.json();
    replaceState(parsed);
    return { ok: true, message: '已从 WebDAV 拉取并应用' };
  } catch (e) {
    return { ok: false, message: '拉取出错：' + (e && e.message ? e.message : e) };
  }
}

// ---------- Private GitHub repo sync (contents API) ----------
function setRepo(patch) {
  if (!state.settings.repo) state.settings.repo = { repo: '', path: 'hheader-config.json', token: '' };
  Object.assign(state.settings.repo, patch);
  persist();
}
function b64encodeUnicode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function b64decodeUnicode(str) {
  return decodeURIComponent(escape(atob(str)));
}
async function pushToRepo() {
  const { repo, path, token } = state.settings.repo || {};
  if (!repo) return { ok: false, message: '请先填写仓库 (owner/repo)' };
  if (!token) return { ok: false, message: '推送需要带 repo 权限的 Token' };
  try {
    const apiPath = encodeURIComponent(path);
    const base = `https://api.github.com/repos/${repo}/contents/${apiPath}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    };
    let sha;
    try {
      const g = await fetch(base, {
        headers: { Authorization: headers.Authorization, Accept: headers.Accept },
      });
      if (g.ok) sha = (await g.json()).sha;
    } catch {
      /* file may not exist yet */
    }
    const res = await fetch(base, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: 'HHeader config sync',
        content: b64encodeUnicode(JSON.stringify(getStatePlain(), null, 2)),
        sha,
      }),
    });
    if (!res.ok) return { ok: false, message: `仓库推送失败：HTTP ${res.status}` };
    return { ok: true, message: '已推送到 GitHub 仓库' };
  } catch (e) {
    return { ok: false, message: '推送出错：' + (e && e.message ? e.message : e) };
  }
}
async function pullFromRepo() {
  const { repo, path, token } = state.settings.repo || {};
  if (!repo) return { ok: false, message: '请先填写仓库 (owner/repo)' };
  try {
    const apiPath = encodeURIComponent(path);
    const base = `https://api.github.com/repos/${repo}/contents/${apiPath}`;
    const headers = { Accept: 'application/vnd.github+json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(base, { headers });
    if (!res.ok) return { ok: false, message: `仓库拉取失败：HTTP ${res.status}` };
    const j = await res.json();
    const parsed = JSON.parse(b64decodeUnicode(j.content));
    replaceState(parsed);
    return { ok: true, message: '已从 GitHub 仓库拉取并应用' };
  } catch (e) {
    return { ok: false, message: '拉取出错：' + (e && e.message ? e.message : e) };
  }
}

// ---------- Analytics ----------
async function fetchStats() {
  return loadStats();
}
async function resetStats() {
  await resetStatsStore();
}

// ---------- GitHub Gist sync ----------
function setGist(patch) {
  if (!state.settings.gist) state.settings.gist = { id: '', token: '' };
  Object.assign(state.settings.gist, patch);
  persist();
}
async function pushToGist() {
  const { id, token } = state.settings.gist || {};
  if (!id) return { ok: false, message: '请先填写 Gist ID' };
  if (!token) return { ok: false, message: '推送需要带 gist 权限的 Token' };
  try {
    const res = await fetch(`https://api.github.com/gists/${id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
      body: JSON.stringify({
        files: { 'hheader-config.json': { content: JSON.stringify(getStatePlain(), null, 2) } },
      }),
    });
    if (!res.ok) return { ok: false, message: `推送失败：HTTP ${res.status}` };
    return { ok: true, message: '已推送到 Gist' };
  } catch (e) {
    return { ok: false, message: '推送出错：' + (e && e.message ? e.message : e) };
  }
}
async function pullFromGist() {
  const { id, token } = state.settings.gist || {};
  if (!id) return { ok: false, message: '请先填写 Gist ID' };
  try {
    const headers = { Accept: 'application/vnd.github+json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`https://api.github.com/gists/${id}`, { headers });
    if (!res.ok) return { ok: false, message: `拉取失败：HTTP ${res.status}` };
    const data = await res.json();
    const file = data.files && data.files['hheader-config.json'];
    if (!file || !file.content) return { ok: false, message: 'Gist 中未找到 hheader-config.json' };
    const parsed = JSON.parse(file.content);
    // Preserve the current gist credentials after replacing state.
    const gist = { ...(state.settings.gist || {}) };
    replaceState(parsed);
    state.settings.gist = gist;
    persist(true);
    return { ok: true, message: '已从 Gist 拉取并应用' };
  } catch (e) {
    return { ok: false, message: '拉取出错：' + (e && e.message ? e.message : e) };
  }
}

// ---------- Debug log ----------
async function fetchLogs() {
  try {
    const res = await chrome.storage.session.get(LOG_KEY);
    return Array.isArray(res[LOG_KEY]) ? res[LOG_KEY] : [];
  } catch {
    return [];
  }
}
async function clearLogs() {
  try {
    await chrome.storage.session.set({ [LOG_KEY]: [] });
  } catch {
    /* ignore */
  }
}

// Serialize the current config to a plain object (for JSON export).
function getStatePlain() {
  return JSON.parse(JSON.stringify(state));
}

// Replace the entire config with an imported/normalized object.
function replaceState(plain) {
  const next = normalizeState(plain);
  state.profiles = next.profiles;
  state.settings = next.settings;
  persist(true);
}

export function useProfiles() {
  return {
    state,
    ready,
    activeRules,
    init,
    persist,
    setActivation,
    addProfile,
    cloneProfile,
    removeProfile,
    setProfileColor,
    toggleProfile,
    renameProfile,
    addHeader,
    updateHeader,
    removeHeader,
    enabledCount,
    getStatePlain,
    replaceState,
    // variables
    addVariable,
    updateVariable,
    removeVariable,
    // presets
    applyPreset,
    addProfileFromPreset,
    // reordering
    moveProfile,
    moveHeader,
    // theme / settings
    setTheme,
    setIconColorSync,
    setStealth,
    // gist
    setGist,
    pushToGist,
    pullFromGist,
    // webdav + repo
    setWebdav,
    pushToWebdav,
    pullFromWebdav,
    setRepo,
    pushToRepo,
    pullFromRepo,
    // logs
    fetchLogs,
    clearLogs,
    // analytics
    fetchStats,
    resetStats,
  };
}
