// Thin wrapper around chrome.storage.local for the HHeader state object.
import { STORAGE_KEY, defaultState, normalizeState } from './constants.js';

// Load the persisted state, merging in defaults so older/partial data still works.
export async function loadState() {
  const res = await chrome.storage.local.get(STORAGE_KEY);
  const stored = res[STORAGE_KEY];
  if (!stored) return defaultState();
  return normalizeState(stored);
}

// Persist a (plain) state object.
export async function saveState(state) {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

// Subscribe to external changes of the HHeader state (e.g. made by another view).
export function onStateChanged(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY]) {
      callback(changes[STORAGE_KEY].newValue);
    }
  });
}
