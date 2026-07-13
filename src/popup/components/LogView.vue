<template>
  <div class="panel">
    <div class="log-head">
      <p class="panel__intro">最近 {{ logs.length }} 条命中记录（按请求聚合，含 HHeader 修改过的所有 Header）</p>
      <div class="log-actions">
        <button class="btn btn--ghost btn--sm" @click="refresh">刷新</button>
        <button class="btn btn--ghost btn--sm" @click="clear">清空</button>
      </div>
    </div>

    <p class="note">
      ⚠ 命中日志依赖 Chrome 的调试 API（<code>onRuleMatchedDebug</code>），仅在“已解压/开发者模式”加载时可用。
    </p>

    <p v-if="groups.length === 0" class="muted">暂无记录。发起一些被规则匹配的请求后点“刷新”。</p>

    <div v-for="g in groups" :key="g.id" class="log-item">
      <div class="log-item__row1">
        <span class="log-method" :class="'m-' + g.method.toLowerCase()">{{ g.method }}</span>
        <span class="log-url" :title="g.url">{{ shortUrl(g.url) }}</span>
        <span class="log-type">{{ g.type }}</span>
      </div>
      <div class="log-item__changes">
        <code v-for="(c, i) in g.changes" :key="i" class="change-chip">
          {{ c.header }} <em>{{ c.operation }}</em><template v-if="c.operation !== 'remove'"> = {{ c.value }}</template>
        </code>
      </div>
      <div class="log-item__row2">
        <button class="btn btn--ghost btn--sm" @click="copy(buildCurl(g), 'cURL', g.id)">cURL</button>
        <button class="btn btn--ghost btn--sm" @click="copy(buildFetch(g), 'Fetch', g.id)">Fetch</button>
        <button class="btn btn--ghost btn--sm" @click="copy(buildPython(g), 'Python', g.id)">Python</button>
        <span class="copied" v-if="copied === g.id">{{ copiedLabel }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useProfiles } from '../composables/useProfiles.js';

const { fetchLogs, clearLogs } = useProfiles();
const logs = ref([]);
const copied = ref('');
const copiedLabel = ref('');

async function refresh() {
  logs.value = await fetchLogs();
}
async function clear() {
  await clearLogs();
  logs.value = [];
}

const shortUrl = (u) => (!u ? '' : u.length > 54 ? u.slice(0, 51) + '…' : u);

// Group per-rule log entries by requestId so one card shows all headers HHeader
// applied to that single request. Only request-direction headers go into the
// generated commands (response headers can't be set from fetch/curl).
const groups = computed(() => {
  const map = new Map();
  for (const l of logs.value) {
    const key = l.requestId || l.id;
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        method: l.method,
        url: l.url,
        type: l.type,
        changes: [],
        reqHeaders: [],
      });
    }
    const g = map.get(key);
    g.changes.push({ header: l.header, operation: l.operation, value: l.value });
    if (l.direction !== 'response' && l.operation !== 'remove' && l.header) {
      g.reqHeaders.push({ header: l.header, value: l.value });
    }
  }
  return [...map.values()];
});

function buildCurl(g) {
  const parts = [`curl -X ${g.method} '${g.url}'`];
  for (const h of g.reqHeaders) parts.push(`  -H '${h.header}: ${h.value}'`);
  return parts.join(' \\\n');
}
function buildFetch(g) {
  const hdrLines = g.reqHeaders.map((h) => `    '${h.header}': '${h.value}'`).join(',\n');
  return `fetch('${g.url}', {\n  method: '${g.method}',\n  headers: {\n${hdrLines}\n  }\n});`;
}
function buildPython(g) {
  const hdrLines = g.reqHeaders.map((h) => `    '${h.header}': '${h.value}'`).join(',\n');
  return `import requests\n\nr = requests.request(\n    '${g.method}',\n    '${g.url}',\n    headers: {\n${hdrLines}\n    },\n)\nprint(r.status_code, r.text)`;
}

async function copy(text, label, id) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  copied.value = id;
  copiedLabel.value = `已复制 ${label}`;
}

onMounted(refresh);
</script>
