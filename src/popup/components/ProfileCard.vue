<template>
  <section
    class="card"
    :class="{ 'card--on': profile.enabled, 'card--open': open }"
    :style="accentStyle"
  >
    <div class="card__head">
      <button
        class="grip"
        title="拖动排序 Profile"
        @mousedown="$emit('gripdown')"
        @mouseup="$emit('gripup')"
      >⠿</button>
      <BaseToggle :model-value="profile.enabled" @update:model-value="onToggle" />

      <div class="color-wrap">
        <button
          class="color-dot"
          :style="{ background: safeColor }"
          :title="'Color: ' + safeColor"
          @click="showPalette = !showPalette"
        ></button>
        <template v-if="showPalette">
          <div class="palette-backdrop" @click="showPalette = false"></div>
          <div class="palette">
            <button
              v-for="c in colors"
              :key="c.id"
              class="palette__swatch"
              :class="{ 'palette__swatch--on': c.hex.toLowerCase() === safeColor.toLowerCase() }"
              :style="{ background: c.hex }"
              :title="c.label"
              @click="onPickColor(c.hex)"
            ></button>
          </div>
        </template>
      </div>

      <input
        class="card__name"
        :value="profile.name"
        @input="onRename"
        placeholder="Profile name"
        spellcheck="false"
      />
      <span class="card__count" :title="profile.headers.length + ' rules'">{{
        profile.headers.length
      }}</span>
      <button
        class="icon-btn"
        :title="open ? 'Collapse' : 'Expand'"
        @click="open = !open"
      >
        {{ open ? '▾' : '▸' }}
      </button>
      <button class="icon-btn" title="Clone profile" @click="onClone">⧉</button>
      <button
        class="icon-btn icon-btn--danger"
        title="Delete profile"
        @click="onDelete"
      >
        ✕
      </button>
    </div>

    <div v-if="open" class="card__body">
      <p v-if="profile.headers.length === 0" class="muted">
        No header rules yet.
      </p>
      <div
        v-for="(h, idx) in profile.headers"
        :key="h.id"
        class="drag-item"
        :class="{ 'drag-item--over': hOverIdx === idx }"
        :draggable="hDragFrom === idx"
        @dragstart="onHDragStart(idx, $event)"
        @dragover.prevent="hOverIdx = idx"
        @dragleave="hOverIdx === idx && (hOverIdx = -1)"
        @drop="onHDrop(idx)"
        @dragend="onHDragEnd"
      >
        <RuleRow
          :header="h"
          @update="(patch) => updateHeader(profile.id, h.id, patch)"
          @remove="removeHeader(profile.id, h.id)"
          @gripdown="hDragFrom = idx"
          @gripup="hDragFrom = -1"
        />
      </div>
      <button class="btn btn--ghost btn--block" @click="addHeader(profile.id)">
        + Add header rule
      </button>
    </div>
  </section>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useProfiles } from '../composables/useProfiles.js';
import { PROFILE_COLORS, DEFAULT_PROFILE_COLOR } from '../../core/constants.js';
import BaseToggle from './BaseToggle.vue';
import RuleRow from './RuleRow.vue';

const props = defineProps({ profile: { type: Object, required: true } });
defineEmits(['gripdown', 'gripup']);
const {
  toggleProfile,
  renameProfile,
  removeProfile,
  cloneProfile,
  setProfileColor,
  addHeader,
  updateHeader,
  removeHeader,
  moveHeader,
} = useProfiles();

const open = ref(false);
const showPalette = ref(false);
const colors = PROFILE_COLORS;

// Header drag state
const hDragFrom = ref(-1);
const hOverIdx = ref(-1);

const safeColor = computed(() => props.profile.color || DEFAULT_PROFILE_COLOR);
const accentStyle = computed(() =>
  props.profile.enabled ? { borderLeftColor: safeColor.value, borderLeftWidth: '4px' } : {}
);

function onToggle() {
  toggleProfile(props.profile.id);
}
function onRename(e) {
  renameProfile(props.profile.id, e.target.value);
}
function onClone() {
  cloneProfile(props.profile.id);
}
function onPickColor(hex) {
  setProfileColor(props.profile.id, hex);
  showPalette.value = false;
}
function onDelete() {
  if (confirm(`Delete profile "${props.profile.name}"?`)) {
    removeProfile(props.profile.id);
  }
}

function onHDragStart(idx, e) {
  hDragFrom.value = idx;
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}
function onHDrop(idx) {
  if (hDragFrom.value >= 0 && hDragFrom.value !== idx) {
    moveHeader(props.profile.id, hDragFrom.value, idx);
  }
  onHDragEnd();
}
function onHDragEnd() {
  hDragFrom.value = -1;
  hOverIdx.value = -1;
}
</script>
