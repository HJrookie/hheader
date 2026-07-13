<template>
  <div class="panel">
    <p class="panel__intro">一键把常用配置加入某个 Profile，或直接新建一个 Profile。</p>

    <div class="preset-target">
      <label>加入到：</label>
      <select v-model="targetId">
        <option value="__new__">＋ 新建 Profile</option>
        <option v-for="p in state.profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
    </div>

    <div class="preset-grid">
      <div v-for="p in presets" :key="p.id" class="preset-card">
        <div class="preset-card__top">
          <span class="preset-card__name">{{ p.name }}</span>
          <span class="preset-card__tag">{{ p.category }}</span>
        </div>
        <p class="preset-card__desc">{{ p.desc }}</p>
        <button class="btn btn--ghost btn--sm" @click="apply(p)">应用</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useProfiles } from '../composables/useProfiles.js';
import { PRESETS } from '../../core/presets.js';

const { state, applyPreset, addProfileFromPreset } = useProfiles();
const presets = PRESETS;
const targetId = ref('__new__');

function apply(preset) {
  if (targetId.value === '__new__') {
    addProfileFromPreset(preset.id, preset.name);
  } else {
    applyPreset(targetId.value, preset.id);
  }
}
</script>
