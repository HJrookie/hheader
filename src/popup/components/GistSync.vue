<template>
  <div class="sync-layout">
    <!-- 左侧竖排 tab -->
    <nav class="sync-nav">
      <button
        v-for="t in tabs"
        :key="t.id"
        class="sync-nav__btn"
        :class="{ active: active === t.id, 'sync-nav__btn--foot': t.foot }"
        @click="active = t.id"
      >
        <span class="sync-nav__icon">{{ t.icon }}</span>
        <span class="sync-nav__label">{{ t.label }}</span>
      </button>
    </nav>

    <!-- 右侧内容 -->
    <div class="sync-content">
      <!-- 本地文件 -->
      <section v-if="active === 'local'" class="panel">
        <h3 class="panel__h">本地文件</h3>
        <p class="panel__intro">导出为 JSON 备份，或从文件导入（会替换当前全部配置）。</p>
        <div class="sync-row">
          <button class="btn btn--ghost" @click="onImportClick">⭱ Import JSON</button>
          <button class="btn btn--ghost" @click="onExport">⭳ Export JSON</button>
          <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="onImportFile" />
        </div>
      </section>

      <!-- GitHub Gist -->
      <section v-else-if="active === 'gist'" class="panel">
        <h3 class="panel__h">GitHub Gist 同步</h3>
        <p class="panel__intro">输入 Gist ID 实现跨设备同步；文件名需为 <code>hheader-config.json</code>。</p>
        <label class="field">
          <span>Gist ID</span>
          <input
            :value="state.settings.gist.id"
            @input="setGist({ id: $event.target.value.trim() })"
            placeholder="e.g. 3f9a...c21"
            spellcheck="false"
          />
        </label>
        <label class="field">
          <span>Token（推送/私有需要，gist 权限）</span>
          <input
            type="password"
            :value="state.settings.gist.token"
            @input="setGist({ token: $event.target.value.trim() })"
            placeholder="ghp_... (仅本机保存)"
            spellcheck="false"
          />
        </label>
        <div class="sync-row">
          <button class="btn btn--ghost" :disabled="busy" @click="run(pullFromGist)">⬇ 拉取</button>
          <button class="btn btn--ghost" :disabled="busy" @click="run(pushToGist)">⬆ 推送</button>
        </div>
      </section>

      <!-- WebDAV -->
      <section v-else-if="active === 'webdav'" class="panel">
        <h3 class="panel__h">WebDAV 同步</h3>
        <p class="panel__intro">坚果云 / 群晖等。填写<strong>文件的完整 URL</strong>（如 <code>https://dav.jianguoyun.com/dav/.../hheader-config.json</code>）。</p>
        <label class="field">
          <span>WebDAV 文件 URL</span>
          <input
            :value="state.settings.webdav.url"
            @input="setWebdav({ url: $event.target.value.trim() })"
            placeholder="https://dav.example.com/path/hheader-config.json"
            spellcheck="false"
          />
        </label>
        <div class="sync-row2">
          <label class="field">
            <span>用户名</span>
            <input
              :value="state.settings.webdav.user"
              @input="setWebdav({ user: $event.target.value })"
              placeholder="user"
              spellcheck="false"
            />
          </label>
          <label class="field">
            <span>密码 / 应用密码</span>
            <input
              type="password"
              :value="state.settings.webdav.pass"
              @input="setWebdav({ pass: $event.target.value })"
              placeholder="•••••"
              spellcheck="false"
            />
          </label>
        </div>
        <div class="sync-row">
          <button class="btn btn--ghost" :disabled="busy" @click="run(pullFromWebdav)">⬇ 拉取</button>
          <button class="btn btn--ghost" :disabled="busy" @click="run(pushToWebdav)">⬆ 推送</button>
        </div>
      </section>

      <!-- GitHub 仓库 -->
      <section v-else-if="active === 'repo'" class="panel">
        <h3 class="panel__h">GitHub 仓库同步</h3>
        <p class="panel__intro">推送到私有仓库的 <code>config.json</code>（contents API），适合“连一个仓库自动同步”。</p>
        <label class="field">
          <span>仓库 (owner/repo)</span>
          <input
            :value="state.settings.repo.repo"
            @input="setRepo({ repo: $event.target.value.trim() })"
            placeholder="octocat/hheader-sync"
            spellcheck="false"
          />
        </label>
        <div class="sync-row2">
          <label class="field">
            <span>文件路径</span>
            <input
              :value="state.settings.repo.path"
              @input="setRepo({ path: $event.target.value.trim() })"
              placeholder="hheader-config.json"
              spellcheck="false"
            />
          </label>
          <label class="field">
            <span>Token（repo 权限）</span>
            <input
              type="password"
              :value="state.settings.repo.token"
              @input="setRepo({ token: $event.target.value.trim() })"
              placeholder="ghp_..."
              spellcheck="false"
            />
          </label>
        </div>
        <div class="sync-row">
          <button class="btn btn--ghost" :disabled="busy" @click="run(pullFromRepo)">⬇ 拉取</button>
          <button class="btn btn--ghost" :disabled="busy" @click="run(pushToRepo)">⬆ 推送</button>
        </div>
      </section>

      <!-- 外观 -->
      <section v-else-if="active === 'appearance'" class="panel">
        <h3 class="panel__h">外观</h3>
        <p class="panel__intro">与同步无关的界面设置。</p>
        <label class="switch-row">
          <span>图标颜色随激活 Profile 变化</span>
          <BaseToggle :model-value="state.settings.iconColorSync" @update:model-value="setIconColorSync" />
        </label>
      </section>

      <p v-if="msg" class="sync-msg" :class="{ ok: msgOk, err: !msgOk }">{{ msg }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useProfiles } from '../composables/useProfiles.js';
import BaseToggle from './BaseToggle.vue';

const {
  state,
  getStatePlain,
  replaceState,
  setGist,
  pushToGist,
  pullFromGist,
  setWebdav,
  pushToWebdav,
  pullFromWebdav,
  setRepo,
  pushToRepo,
  pullFromRepo,
  setIconColorSync,
} = useProfiles();

// Left-rail sync sections. `foot: true` pins the item to the bottom.
const tabs = [
  { id: 'local', icon: '📄', label: '本地文件' },
  { id: 'gist', icon: '☁️', label: 'Gist' },
  { id: 'webdav', icon: '🌐', label: 'WebDAV' },
  { id: 'repo', icon: '📦', label: '仓库' },
  { id: 'appearance', icon: '🎨', label: '外观', foot: true },
];
const active = ref('local');

const fileInput = ref(null);
const busy = ref(false);
const msg = ref('');
const msgOk = ref(true);

function show(res) {
  msg.value = res.message;
  msgOk.value = res.ok;
}
async function run(fn) {
  busy.value = true;
  show(await fn());
  busy.value = false;
}

function onImportClick() {
  fileInput.value && fileInput.value.click();
}
async function onImportFile(e) {
  const input = e.target;
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.profiles)) {
      show({ ok: false, message: '无效配置：需要包含 profiles 数组的 JSON。' });
      return;
    }
    if (!confirm('导入会替换当前全部配置，确定继续？')) return;
    replaceState(parsed);
    show({ ok: true, message: '已导入配置。' });
  } catch (err) {
    show({ ok: false, message: '导入失败：' + (err && err.message ? err.message : err) });
  }
}
function onExport() {
  const data = JSON.stringify(getStatePlain(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'hheader-config.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
</script>
