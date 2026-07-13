<template>
  <div class="panel">
    <p class="panel__intro">
      在 Header 值里用 <code>{{ sample }}</code> 引用变量。自定义变量改一处、处处生效。
    </p>

    <h3 class="panel__h">内置变量</h3>
    <ul class="builtin">
      <li v-for="b in builtins" :key="b.name">
        <code>{{ tokenOf(b.name) }}</code>
        <span class="builtin__desc">{{ b.desc }}</span>
      </li>
    </ul>
    <p class="note">
      ⚠ 受 Manifest V3 限制，<code>{{ tokenOf('TIMESTAMP') }}</code>/<code>{{ tokenOf('UUID') }}</code>
      在“规则同步时”求值（含占位符时每分钟自动刷新一次），并非每个请求都重新生成。
    </p>

    <h3 class="panel__h">自定义变量</h3>
    <p v-if="state.variables.length === 0" class="muted">还没有自定义变量。</p>
    <div v-for="v in state.variables" :key="v.id" class="var-row">
      <input
        class="var-name"
        :value="v.name"
        @input="updateVariable(v.id, { name: $event.target.value.replace(/[^A-Za-z0-9_.-]/g, '') })"
        placeholder="NAME"
        spellcheck="false"
      />
      <input
        class="var-value"
        :value="v.value"
        @input="updateVariable(v.id, { value: $event.target.value })"
        placeholder="value"
        spellcheck="false"
      />
      <button class="icon-btn icon-btn--danger" title="Remove" @click="removeVariable(v.id)">✕</button>
    </div>
    <button class="btn btn--ghost btn--block" @click="addVariable">+ Add variable</button>
  </div>
</template>

<script setup>
import { useProfiles } from '../composables/useProfiles.js';
import { BUILTIN_VARS } from '../../core/templating.js';

const { state, addVariable, updateVariable, removeVariable } = useProfiles();
const builtins = BUILTIN_VARS;
const tokenOf = (name) => `{{${name}}}`;
const sample = '{{NAME}}';
</script>
