<template>
  <button
    class="toggle"
    :class="{ 'toggle--on': modelValue }"
    role="switch"
    :aria-checked="modelValue"
    @click="$emit('update:modelValue', !modelValue)"
  >
    <span class="toggle__knob" />
  </button>
</template>

<script setup>
defineProps({ modelValue: { type: Boolean, default: false } });
defineEmits(['update:modelValue']);
</script>
