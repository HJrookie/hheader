<template>
  <div class="profile-list">
    <p v-if="state.profiles.length === 0" class="empty">
      No profiles yet. Create one to start editing headers.
    </p>
    <div
      v-for="(p, idx) in state.profiles"
      :key="p.id"
      class="drag-item"
      :class="{ 'drag-item--over': overIdx === idx }"
      :draggable="dragFrom === idx"
      @dragstart="onDragStart(idx, $event)"
      @dragover.prevent="overIdx = idx"
      @dragleave="overIdx === idx && (overIdx = -1)"
      @drop="onDrop(idx)"
      @dragend="onDragEnd"
    >
      <ProfileCard
        :profile="p"
        @gripdown="dragFrom = idx"
        @gripup="dragFrom = -1"
      />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useProfiles } from '../composables/useProfiles.js';
import ProfileCard from './ProfileCard.vue';

const { state, moveProfile } = useProfiles();

const dragFrom = ref(-1);
const overIdx = ref(-1);

function onDragStart(idx, e) {
  dragFrom.value = idx;
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}
function onDrop(idx) {
  if (dragFrom.value >= 0 && dragFrom.value !== idx) {
    moveProfile(dragFrom.value, idx);
  }
  onDragEnd();
}
function onDragEnd() {
  dragFrom.value = -1;
  overIdx.value = -1;
}
</script>
