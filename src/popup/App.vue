<template>
  <div class="app">
    <header class="app__header">
      <div class="brand">
        <svg class="brand__logo" viewBox="0 0 128 128" aria-hidden="true">
          <g fill="none" stroke="#fff" stroke-width="13" stroke-linecap="round" stroke-linejoin="round">
            <path d="M44 38 V90" />
            <path d="M84 38 V90" />
            <path d="M44 64 H84" />
          </g>
        </svg>
        <div class="brand__text">
          <h1 class="brand__title">HHeader</h1>
          <p class="brand__sub">Request &amp; response </p>
        </div>
      </div>
      <div class="head-actions">
        <!-- <button
          class="icon-btn stealth-btn"
          :class="{ 'stealth-btn--on': state.settings.stealth }"
          :title="state.settings.stealth ? '隐私防护：开' : '隐私防护：关'"
          @click="toggleStealth"
        >🛡</button> -->
        <button
          class="icon-btn"
          :title="'Theme: ' + state.settings.theme"
          @click="cycleTheme"
        >
          {{ themeIcon }}
        </button>
        <div class="mode" title="Activation mode">
          <button
            class="mode__btn"
            :class="{ active: state.settings.activation === 'multiple' }"
            @click="setActivation('multiple')"
          >
            Multi
          </button>
          <button
            class="mode__btn"
            :class="{ active: state.settings.activation === 'single' }"
            @click="setActivation('single')"
          >
            Single
          </button>
        </div>
      </div>
    </header>

    <nav class="tabs">
      <button
        v-for="t in tabs"
        :key="t.id"
        class="tabs__btn"
        :class="{ active: tab === t.id }"
        @click="tab = t.id"
      >
        {{ t.label }}
      </button>
    </nav>

    <main class="app__body">
      <p v-if="!ready" class="loading">Loading…</p>
      <template v-else>
        <ProfileList v-show="tab === 'rules'" />
        <VariablesPanel v-if="tab === 'vars'" />
        <PresetPicker v-if="tab === 'presets'" />
        <LogView v-if="tab === 'log'" />
        <GistSync v-if="tab === 'sync'" />
        <StatsView v-if="tab === 'stats'" />
      </template>
    </main>

    <footer v-if="tab === 'rules'" class="app__footer">
      <button class="btn btn--primary btn--block" @click="addProfile">+ New Profile</button>
      <span class="hint">{{ activeRules }} active rules</span>
    </footer>
  </div>
</template>

<script setup>
import { onMounted, ref, computed, watch, defineAsyncComponent } from 'vue';
import { useProfiles } from './composables/useProfiles.js';
import { THEME } from '../core/constants.js';
import { mountSandbox } from './scriptEval.js';
import ProfileList from './components/ProfileList.vue';
import VariablesPanel from './components/VariablesPanel.vue';
import PresetPicker from './components/PresetPicker.vue';
import LogView from './components/LogView.vue';
import GistSync from './components/GistSync.vue';

// Load ECharts (heavy) only when the Stats tab is actually opened.
const StatsView = defineAsyncComponent(() => import('./components/StatsView.vue'));

const {
  state,
  ready,
  activeRules,
  init,
  setActivation,
  addProfile,
  setTheme,
  setStealth,
} = useProfiles();

const tab = ref('rules');
const tabs = [
  { id: 'rules', label: 'Rules' },
  { id: 'vars', label: 'Vars' },
  { id: 'presets', label: 'Presets' },
  { id: 'log', label: 'Log' },
  { id: 'sync', label: 'Sync' },
  { id: 'stats', label: 'Stats' },
];

function toggleStealth() {
  setStealth(!state.settings.stealth);
}

const themeIcon = computed(() => {
  if (state.settings.theme === THEME.DARK) return '🌙';
  if (state.settings.theme === THEME.LIGHT) return '☀';
  return '◐';
});

const media = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = state.settings.theme || 'auto';
  const effective = t === 'auto' ? (media.matches ? 'dark' : 'light') : t;
  document.documentElement.dataset.theme = effective;
}
function cycleTheme() {
  const order = [THEME.AUTO, THEME.LIGHT, THEME.DARK];
  const idx = order.indexOf(state.settings.theme);
  setTheme(order[(idx + 1) % order.length]);
}

watch(() => state.settings.theme, applyTheme);
media.addEventListener('change', applyTheme);

onMounted(async () => {
  await init();
  applyTheme();
  mountSandbox(); // spin up the sandboxed script evaluator once
});
</script>
