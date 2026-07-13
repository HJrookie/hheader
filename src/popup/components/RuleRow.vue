<template>
  <div class="rule">
    <div class="rule__row1">
      <button
        class="grip"
        title="拖动排序"
        @mousedown="$emit('gripdown')"
        @mouseup="$emit('gripup')"
      >⠿</button>
      <select
        class="rule__op"
        :value="header.op"
        @change="patch({ op: $event.target.value })"
      >
        <option v-for="o in opOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
      <input
        class="rule__name"
        :value="header.name"
        :disabled="header.op === 'redirect'"
        @input="patch({ name: $event.target.value })"
        placeholder="Header-Name"
        spellcheck="false"
      />
      <button
        class="icon-btn"
        :class="{ 'icon-btn--active': showAdv }"
        title="高级过滤（资源类型 / 方法）"
        @click="showAdv = !showAdv"
      >⚙</button>
      <button class="icon-btn icon-btn--danger" title="Remove rule" @click="$emit('remove')">✕</button>
    </div>

    <!-- Direction: outgoing request or incoming response -->
    <div class="rule__dir">
      <span class="dir-label">方向</span>
      <div class="seg">
        <button
          class="seg__btn"
          :class="{ 'seg__btn--on': direction === 'request' }"
          @click="direction = 'request'"
        >请求 →</button>
        <button
          class="seg__btn"
          :class="{ 'seg__btn--on': direction === 'response' }"
          @click="direction = 'response'"
        >响应 ←</button>
      </div>
    </div>

    <!-- Value (add / modify) -->
    <div v-if="header.op === 'add' || header.op === 'modify'" class="rule__valwrap">
      <input
        class="rule__value"
        :value="header.value"
        @input="patch({ value: $event.target.value })"
        :placeholder="valuePlaceholder"
        spellcheck="false"
      />
      <span v-if="hasVar" class="var-flag" title="包含变量占位符">{ }</span>
    </div>

    <!-- Redirect target URL -->
    <div v-else-if="header.op === 'redirect'" class="rule__valwrap">
      <input
        class="rule__value"
        :value="header.redirect"
        @input="patch({ redirect: $event.target.value })"
        placeholder="https://localhost:3000/api (匹配的请求将被重定向到这里)"
        spellcheck="false"
      />
    </div>

    <!-- Script source -->
    <div v-else-if="header.op === 'script'" class="rule__script">
      <textarea
        class="rule__code"
        :value="scriptText"
        @input="onScriptInput"
        rows="5"
        placeholder="(request, ctx) => {
  if (request.url.includes('api')) {
    return { 'X-Custom-Token': 'Calc_' + md5(request.method) };
  }
  return {};
}"
        spellcheck="false"
      ></textarea>
      <div class="script-bar">
        <button class="btn btn--ghost btn--sm" @click="runEval">重新计算</button>
        <span class="script-status" :class="{ err: !scriptStatus.ok }">
          <template v-if="scriptStatus.ok">{{ scriptStatus.count }} 个 Header 已生成</template>
          <template v-else>⚠ {{ scriptStatus.error }}</template>
        </span>
      </div>
      <p class="script-note">
        ⚠ 脚本在沙箱里<strong>编辑时</strong>求值，结果是“静态快照”（DNR 无法逐请求运行 JS）。可用 <code>ctx.variables</code>、<code>md5()</code>、<code>btoa()</code>。
      </p>
    </div>

    <div class="rule__row2">
      <select
        class="rule__match"
        :value="header.matchType"
        @change="patch({ matchType: $event.target.value })"
      >
        <option value="wildcard">Wildcard</option>
        <option value="regex">Regex</option>
      </select>
      <textarea
        class="rule__domains"
        :value="header.domains"
        @input="patch({ domains: $event.target.value })"
        rows="2"
        :placeholder="
          header.matchType === 'regex'
            ? '^https://api\\.example\\.com/.*'
            : 'example.com, *.test.com'
        "
        spellcheck="false"
      ></textarea>
    </div>

    <div v-if="showAdv" class="rule__adv">
      <div class="adv-group">
        <span class="adv-label">资源类型（不选=全部）</span>
        <div class="chips">
          <button
            v-for="rt in resourceOptions"
            :key="rt.id"
            class="chip"
            :class="{ 'chip--on': selectedTypes.includes(rt.id) }"
            @click="toggleType(rt.id)"
          >{{ rt.label }}</button>
        </div>
      </div>
      <div class="adv-group">
        <span class="adv-label">HTTP 方法（不选=全部）</span>
        <div class="chips">
          <button
            v-for="m in methodOptions"
            :key="m"
            class="chip"
            :class="{ 'chip--on': selectedMethods.includes(m) }"
            @click="toggleMethod(m)"
          >{{ m.toUpperCase() }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { OP, OP_OPTIONS, RESOURCE_TYPE_OPTIONS, HTTP_METHODS } from '../../core/constants.js';
import { hasPlaceholder } from '../../core/templating.js';
import { useProfiles } from '../composables/useProfiles.js';
import { evalScriptSource } from '../scriptEval.js';

const props = defineProps({ header: { type: Object, required: true } });
const emit = defineEmits(['update', 'remove', 'gripdown', 'gripup']);
const { state } = useProfiles();

const showAdv = ref(false);
const opOptions = OP_OPTIONS;
const resourceOptions = RESOURCE_TYPE_OPTIONS;
const methodOptions = HTTP_METHODS;
const valuePlaceholder = 'Header value（支持 {{VAR}}）';

const selectedTypes = computed(() => props.header.resourceTypes || []);
const selectedMethods = computed(() => props.header.methods || []);
const hasVar = computed(() => hasPlaceholder(props.header.value));

const direction = computed({
  get: () => (props.header.direction === 'response' ? 'response' : 'request'),
  set: (v) => {
    const dir = v === 'response' ? 'response' : 'request';
    // Redirect only makes sense for outgoing requests.
    if (dir === 'response' && props.header.op === OP.REDIRECT) {
      patch({ direction: dir, op: OP.ADD });
    } else {
      patch({ direction: dir });
    }
  },
});

// ----- Script evaluation (sandboxed) -----
const scriptText = computed(() => props.header.script || '');
const scriptStatus = ref({ ok: true, error: '', count: 0 });
let evalTimer = null;
function patch(p) {
  emit('update', p);
}
function onScriptInput(e) {
  patch({ script: e.target.value });
  scheduleEval();
}
function scheduleEval() {
  clearTimeout(evalTimer);
  evalTimer = setTimeout(runEval, 400);
}
async function runEval() {
  const src = props.header.script || '';
  if (!src.trim()) {
    scriptStatus.value = { ok: true, error: '', count: 0 };
    patch({ resolved: [] });
    return;
  }
  const varMap = {};
  (state.variables || []).forEach((v) => {
    if (v.name) varMap[v.name] = v.value;
  });
  const firstDomain = (props.header.domains || '').split(/[\n,]/)[0] || '';
  const res = await evalScriptSource(src, {
    variables: varMap,
    url: firstDomain,
    method: '',
    type: '',
  });
  if (res.ok) {
    scriptStatus.value = { ok: true, error: '', count: res.headers.length };
    patch({ resolved: res.headers });
  } else {
    scriptStatus.value = { ok: false, error: res.error || '脚本错误', count: 0 };
  }
}
onMounted(() => {
  if (props.header.op === OP.SCRIPT && (props.header.script || '').trim()) runEval();
});
onBeforeUnmount(() => clearTimeout(evalTimer));

function toggleType(id) {
  const set = new Set(selectedTypes.value);
  set.has(id) ? set.delete(id) : set.add(id);
  patch({ resourceTypes: [...set] });
}
function toggleMethod(m) {
  const set = new Set(selectedMethods.value);
  set.has(m) ? set.delete(m) : set.add(m);
  patch({ methods: [...set] });
}
</script>
