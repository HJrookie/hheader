# HHeader

开源的 **Manifest V3** 浏览器扩展，用于按域名自定义、修改或删除 HTTP 请求头。
设计借鉴 [ModHeader](https://modheader.com/) 的 **Profile（配置组）** 概念，提供现代、直观的 Popup 界面。

> 技术栈：Manifest V3 · `declarativeNetRequest` · Vue 3 · SCSS · Vite

<p align="center">
  <a href="README.md">English</a> &nbsp;·&nbsp; <strong>中文</strong>
</p>

---

## 功能特性

### 基础能力

- **配置组（Profiles）**：可创建多个 Profile，每个 Profile 包含一组 Header 修改规则。
- **一键开关**：每个 Profile 可单独启用 / 禁用。
- **激活模式（全局）**：
  - `Multiple`：可同时激活多个 Profile；
  - `Single`：同一时间仅允许一个 Profile 生效（开启某个会自动关闭其余）。
- **规则详情**：每条规则包含
  - 操作类型：`Add`（添加） / `Modify`（修改） / `Filter`（删除）
  - `Header Name` 与 `Header Value`（Filter 无需 Value）
- **域名匹配（Domain Filter）**：支持
  - **通配符（Wildcard）**：如 `example.com`、`*.test.com`
  - **正则（Regex）**：作用于完整请求 URL，如 `^https://api\.example\.com/.*`
- **持久化**：所有配置保存在 `chrome.storage.local`，扩展重启不丢失。
- **颜色标识（Color tag）**：每个 Profile 可设置一种颜色（如开发环境=蓝、生产环境=红）。启用时卡片左侧显示对应颜色的强调条，一眼区分当前环境，避免切错配置。
- **一键克隆（Clone）**：配置好一套复杂规则后，点卡片上的克隆按钮即可复制出一份独立副本（新 id、名称带 `(copy)`），方便基于现有配置快速派生变体。
- **JSON 导入 / 导出（Import / Export）**：把整套配置导出为 `hheader-config.json`，或导入同事 / GitHub 上分享的配置集。导入会用新配置**整体替换**当前配置（含确认提示），并自动补全缺失字段、重建 id。
- **状态角标（Badge）**：插件图标上实时显示**当前已生效的规则数量**。数量为 0 时不显示角标，>0 时显示蓝色数字，无需打开 Popup 即可知道插件是否在运行。

### 进阶能力

- **变量与动态注入（Dynamic Placeholders）**：Header 值支持 `{{VAR}}` 占位符。内置 `{{TIMESTAMP}}`、`{{UUID}}` 等变量，也可自定义变量（如 `Token`）在多条规则中复用，改一处全生效。详见 [变量与动态注入](#变量与动态注入)。
- **预设模板库（Preset Library）**：内置 7 套常用「一键配置」——伪装 GoogleBot / BingBot、模拟 iPhone / Android、绕过缓存、安全加固等，点一下即可应用到现有或新建 Profile。
- **细粒度过滤（Resource Type / Method）**：每条规则可勾选只对特定**资源类型**（如仅 `XHR/Fetch`，不影响图片/CSS）或特定 **HTTP 方法**（如仅 `POST`）生效。
- **调试视图（Log / Monitor）**：面板内展示最近 10 条被 HHeader 成功修改的请求，可**一键复制为 cURL** 命令在终端复现。（依赖开发者模式，见下文说明。）
- **黑暗模式（Dark Mode）**：支持 自动 / 亮 / 暗 三态切换，自动模式跟随系统 `prefers-color-scheme`。
- **拖拽排序（Drag & Drop）**：拖动手柄可调整 Profile 与规则的顺序（顺序即优先级）。
- **右键快捷键（Context Menu）**：在任意页面右键，选择「将当前域名加入 HHeader」，快速为当前站点新建 Profile。
- **图标同步变色（Icon Color Sync）**：工具栏图标可根据当前激活 Profile 的颜色同步着色，一眼确认所处环境。
- **Gist 云同步（Cloud Sync）**：填入 GitHub Gist ID + Token，即可跨设备推送 / 拉取配置。

---

## 配置导入 / 导出格式

导出的 JSON 即内部状态对象，结构如下（可直接在同事间或 GitHub 分享）：

```json
{
  "settings": { "activation": "multiple" },
  "profiles": [
    {
      "id": "p_xxx",
      "name": "Dev (staging)",
      "enabled": true,
      "color": "#3b82f6",
      "headers": [
        { "id": "h_xxx", "op": "add", "name": "X-Env", "value": "staging", "domains": "staging.example.com", "matchType": "wildcard" },
        { "id": "h_yyy", "op": "filter", "name": "X-Secrets", "value": "", "domains": "", "matchType": "wildcard" }
      ]
    }
  ]
}
```

导入时会经过 `normalizeState()` 校验：补齐 `color` / `enabled` / `matchType` 等缺失字段，并为所有 profile / header **重新生成 id**，避免与本地已有配置冲突。

---

## 变量与动态注入

在任意 Header 值里使用 `{{变量名}}` 占位符，同步规则时会被替换为实际值。

**内置变量**（`src/core/templating.js` 的 `BUILTIN_VARS`）：

| 占位符 | 含义 | 示例 |
| --- | --- | --- |
| `{{TIMESTAMP}}`    | Unix 秒级时间戳 | `1752378705` |
| `{{TIMESTAMP_MS}}` | Unix 毫秒级时间戳 | `1752378705123` |
| `{{ISODATE}}`      | ISO 8601 时间 | `2026-07-13T03:51:45.000Z` |
| `{{DATE}}`         | 日期 | `2026-07-13` |
| `{{UUID}}`         | 随机 UUID v4 | `9f1c…` |
| `{{RANDOM}}`       | 随机整数 | `482913` |

**自定义变量**：在 `Vars` 标签页新增「名称 → 值」，即可在多条规则中用 `{{名称}}` 引用，改一处全生效。未定义的占位符会**原样保留**。

> ### ⚠️ MV3 关键限制：变量是"同步时快照"，不是"每次请求实时计算"
>
> HHeader 基于 `declarativeNetRequest`（**声明式**）实现，Chrome 在规则注册时就把 Header 值固化了，扩展无法在每个请求发出时动态改写。
> 因此 `{{TIMESTAMP}}` / `{{UUID}}` 的值是在**同步规则那一刻**生成的快照，同一批规则内保持不变。
>
> 为缓解这一点，当配置中检测到动态占位符时，后台会通过 `chrome.alarms` **每分钟自动重新同步**一次规则，让时间戳/UUID 周期性刷新。若你需要"每请求唯一"的值，声明式 API 无法做到——这是平台限制而非本扩展缺陷。

---

## 预设模板库

`Presets` 标签页提供 7 套一键配置（`src/core/presets.js`），可应用到现有 Profile 或直接生成新 Profile：

| 分类 | 预设 | 作用 |
| --- | --- | --- |
| Crawler  | GoogleBot / BingBot     | 伪装搜索引擎爬虫 User-Agent |
| Mobile   | iPhone / Android        | 模拟最新移动端请求头 |
| Security | 安全加固                 | 追加 CSP / HSTS 等安全头用于测试 |
| Debug    | 绕过缓存 / AJAX          | `Cache-Control: no-cache`、`X-Requested-With` 等 |

---

## 细粒度过滤（资源类型 / HTTP 方法）

每条规则的 **⚙ 高级** 面板可缩小生效范围：

- **资源类型**：勾选后仅对所选类型生效，如仅 `xmlhttprequest` / `fetch`，避免干扰图片、脚本、样式表（`RESOURCE_TYPE_OPTIONS`）。不勾选 = 全部类型。
- **HTTP 方法**：勾选后仅对所选方法生效，如仅 `POST`（写入 DNR `condition.requestMethods`）。不勾选 = 全部方法。

---

## 调试视图（Log / Monitor）

`Log` 标签页显示最近 10 条被 HHeader 修改的请求，点击可**一键复制为 cURL** 命令，直接粘贴到终端复现调试。

> ⚠️ 该日志依赖 `chrome.declarativeNetRequest.onRuleMatchedDebug`，**仅在以「加载已解压的扩展程序」方式安装（开发者模式）时可用**，且需要 `declarativeNetRequestFeedback` 权限。商店正式安装的扩展收不到该事件，日志会为空——这是 Chrome 的设计限制。

---

## Gist 云同步

`Sync` 标签页支持跨设备同步：

1. 在 GitHub 创建一个 **Personal Access Token**（勾选 `gist` 权限）。
2. 新建或复用一个 Gist，把它的 **Gist ID** 与 Token 填入面板。
3. **Push** 将当前配置写入 Gist；**Pull** 从 Gist 拉取并覆盖本地配置。

> Token 仅保存在本地 `chrome.storage.local`，不会随导出的配置 JSON 外泄（导出时会剥离凭据）。Pull 时也会保留本地已填的 Gist 凭据。

---

## 进阶功能（本批新增）

### 1. 响应头修改（Response Headers）

每条规则除了改**请求头**，还能改**响应头**：在规则行点「方向」切换为 `响应 ←`，
操作选 Add / Modify / Filter 即可。最常见的两个痛点一键解决：

- **CORS**：Add `Access-Control-Allow-Origin: *`（或指定来源），本地联调跨域不再报红。
- **CSP**：Filter 掉 `Content-Security-Policy`，放行被拦截的脚本。

底层用的是 `declarativeNetRequest` 的 `responseHeaders`，与请求头走同一套域名 / 资源类型 / 方法过滤。

### 2. 脚本化规则（Scriptable Rules）

支持写一段 JS 函数动态产出 Header：

```js
(request, ctx) => {
  if (request.url.includes('api')) {
    return { 'X-Custom-Token': 'Calc_' + md5(request.method) };
  }
  return {};
};
```

可用上下文：`ctx.variables`（你在 Vars 里定义的变量）、`md5()`、`btoa()`。

> ⚠ **MV3 限制（重要）**：Chrome 扩展页面默认禁止 `new Function` / `eval`，
> 且 `declarativeNetRequest` 是**声明式**的——Header 值在规则注册时就被固化，无法逐请求运行 JS。
> 因此 HHeader 把脚本放进一个**沙箱页面**（`sandbox/eval.html`，manifest 中声明允许 eval）求值，
> 把结果作为**静态快照**存入规则。它适合「用变量拼出复杂值」，但**不能**依赖实时 `request.url` / `request.method`
> 做逐请求分支。编辑脚本时点「重新计算」即可刷新快照。

### 3. 多端同步（WebDAV / 私有 GitHub 仓库）

除了 JSON 导入导出和 GitHub Gist，Sync 页还支持：

- **WebDAV**：填写文件的完整 URL（坚果云 `dav.jianguoyun.com`、群晖等）+ 用户名 / 密码（Basic Auth），一键 Push / Pull。
- **私有 GitHub 仓库**：填写 `owner/repo` + 文件路径 + Token（repo 权限），走 contents API 自动读写 `config.json`，相当于“连一个仓库自动同步”。

所有凭据仅保存在本机 `chrome.storage.local`，绝不上传到 HHeader 服务器（本项目无后端）。

### 4. 高级复制（cURL / Fetch / Python）

Log 面板里每条命中记录会**按请求聚合**，显示该请求被 HHeader 修改过的所有 Header，并提供三个复制按钮：

- **cURL** / **Fetch** / **Python**——生成的代码已包含 HHeader 注入后的全部请求头，方便直接粘到终端 / 爬虫 / 接口自动化里复现。

### 5. 请求重定向（Redirect）

规则操作选 `Redirect`（方向固定为「请求」），填写目标 URL，匹配的请求会被重定向过去。
典型玩法：把生产接口 `https://api.prod.com/*` 重定向到本地 Mock `https://localhost:3000/api`，
前端联调零改动。重定向规则与 Header 修改规则可共存于同一 Profile。

### 6. 隐私防护模式（Stealth）

点工具栏弹窗右上角的 🛡 一键开启。开启后，HHeader 会**自动注入**一组隐私规则（用户规则优先级之上、可被覆盖）：

- 请求：移除 `Referer`、把 `User-Agent` 替换为通用桌面 Chrome
- 响应：移除 `ETag`、`Set-Cookie`

让 HHeader 瞬间变成轻量防追踪工具。也可以在 Presets 里把「隐私防护」作为独立 Profile 添加，按需作用到指定域名。

### 7. 实时数据图表（Analytics Dashboard）

Stats 页用 ECharts 画出（数据来自命中日志，仅开发者模式可用）：

- **总命中 / 修复 CORS·CSP 次数 / 请求头 vs 响应头** 四个指标卡
- **最常修改的 Header** 排行（柱状）
- **请求 vs 响应** 流量占比（饼图）
- **近 24 小时请求量** 曲线（按小时聚合）

> 统计自工具栏图标的命中日志，因此同样依赖「已解压 / 开发者模式」加载。点「清空统计」可重置。

---

## 目录结构

```
hheader/
├── public/manifest.json          # MV3 清单（含 sandbox 声明）
├── src/
│   ├── core/
│   │   ├── constants.js           # 操作/匹配/资源/方法映射、默认值、工厂函数
│   │   ├── storage.js             # chrome.storage.local 封装
│   │   ├── templating.js          # {{变量}} 占位符解析（内置 + 自定义）
│   │   ├── presets.js             # 预设模板库 + STEALTH_HEADERS
│   │   ├── analytics.js            # Stats 统计计数（storage.local）
│   │   └── ruleEngine.js          # Profile → declarativeNetRequest 动态规则（请求/响应/重定向/脚本/隐私）
│   ├── background/
│   │   └── service-worker.js      # 重建 DNR 规则、日志、alarms、图标着色、右键菜单
│   └── popup/                     # Vue 3 + SCSS 弹窗
│       ├── index.html
│       ├── main.js
│       ├── App.vue                # 标签页(Rules/Vars/Presets/Log/Sync) + 主题 + Stealth + 沙箱挂载
│   ├── scriptEval.js          # 弹窗 ↔ 沙箱求值桥接
│       ├── composables/useProfiles.js
│       ├── components/
│       │   ├── ProfileList.vue    # 拖拽排序容器
│       │   ├── ProfileCard.vue    # 颜色/克隆/规则拖拽
│       │   ├── RuleRow.vue        # 规则行 + ⚙高级过滤 + 方向切换 + 脚本/重定向
│       │   ├── VariablesPanel.vue # 变量管理
│       │   ├── PresetPicker.vue   # 预设选择
│       │   ├── LogView.vue        # 生效日志 + 复制 cURL/Fetch/Python
│       │   ├── GistSync.vue       # 导入导出 + Gist/WebDAV/仓库 同步
│   │   ├── StatsView.vue       # ECharts 数据看板（懒加载）
│       │   └── BaseToggle.vue
│       └── styles/main.scss       # 含黑暗模式变量
├── test/ruleEngine.test.mjs      # 单元测试（62 项）
├── vite.config.js
└── package.json
```

构建产物位于 `dist/`，结构：`dist/manifest.json`、`dist/popup/`、`dist/background/`、`dist/assets/`。

---

## 构建与加载

```bash
npm install
npm run build      # 产物输出到 dist/
```

加载扩展：

1. 打开 `chrome://extensions/`（或 Edge 的 `edge://extensions/`）。
2. 右上角开启 **开发者模式（Developer mode）**。
3. 点击 **加载已解压的扩展程序（Load unpacked）**，选择本项目的 `dist/` 目录。
4. 点击工具栏拼图图标，固定 **HHeader**，点击打开 Popup 进行配置。

> 每次修改源码后，重新 `npm run build`，回到扩展管理页点击 **刷新（↻）** 即可。

---

## 规则引擎说明（重要）

### 操作映射

| UI 操作 | declarativeNetRequest operation | 说明 |
| --- | --- | --- |
| `Add`    | `append` | 追加 / 创建请求头 |
| `Modify` | `set`    | 覆盖 / 创建请求头 |
| `Filter` | `remove` | 删除请求头 |

> ⚠️ Chrome 限制 `append` **仅可用于**一小部分受保护头部（`user-agent`、`cookie`、`accept-*`、`x-forwarded-for` 等 allowlist）。
> 因此 `Add` 在这些头部上才会真正执行 `append`；对 **allowlist 之外**的自定义头部（如 `X-Custom`），
> 引擎会自动降级为 `set` 以避免规则被 Chrome 拒绝。如果你想"修改/覆盖"某个受保护头部，请直接用 `Modify`（`set`）。

### 域名匹配

- **通配符（Wildcard）**：`example.com` 与 `*.example.com` 都会匹配该域及其所有子域，
  引擎统一转换为 DNR `urlFilter: "||example.com"`。
  你也可以直接写 Adblock 风格过滤器（以 `||` 或 `/` 开头会原样保留）。
  留空表示对所有域名生效（不加 `urlFilter`）。
- **正则（Regex）**：作用于**完整请求 URL**，写入 DNR `regexFilter`。
  每个正则都会先用 `chrome.declarativeNetRequest.isRegexSupported` 校验，
  不支持的正则会被跳过并在控制台给出警告。

### 每规则过滤条件

- **资源类型**：`header.resourceTypes` 非空时写入 `condition.resourceTypes`，否则默认覆盖全部类型。
- **HTTP 方法**：`header.methods` 非空时写入 `condition.requestMethods`（小写），否则不限制方法。

### 变量替换时机

`buildDynamicRules(state)` 先用 `buildVarContext(state.variables)` 构造变量上下文，
再对每条规则的 `value` 调用 `resolveTemplate()` 完成 `{{VAR}}` 替换后写入 DNR 规则。
替换发生在**同步规则时**（见上文 MV3 限制）。

### 优先级

靠后的 Profile、靠后的规则拥有更高优先级（`priority = 1 + profileIndex*1000 + headerIndex`），
因此冲突时后者覆盖前者。拖拽排序即调整该优先级。

### 配额限制

- 动态规则总数上限 **5000**（`MAX_NUMBER_OF_DYNAMIC_RULES`）。
- 正则规则总数上限 **1000**（`MAX_NUMBER_OF_REGEX_RULES`）。

---

## 数据存储

配置保存在 `chrome.storage.local`，键名为 `hheader:state`：

```jsonc
{
  "settings": {
    "activation": "multiple",     // "multiple" | "single"
    "theme": "auto",              // "auto" | "light" | "dark"
    "iconColorSync": true,        // 图标随激活 Profile 颜色变色
    "gist": { "id": "", "token": "" }  // Gist 云同步凭据（Token 不随导出外泄）
  },
  "variables": [
    { "id": "v_xxx", "name": "Token", "value": "abc123" }
  ],
  "profiles": [
    {
      "id": "p_xxx",
      "name": "My Profile",
      "enabled": true,
      "color": "#3b82f6",
      "headers": [
        {
          "id": "h_xxx",
          "op": "add",            // "add" | "modify" | "filter"
          "name": "X-Custom",
          "value": "Bearer {{Token}}",   // 支持 {{变量}} 占位符
          "domains": "example.com, *.test.com",
          "matchType": "wildcard",       // "wildcard" | "regex"
          "resourceTypes": ["xmlhttprequest"], // 空 = 全部类型
          "methods": ["post"]                  // 空 = 全部方法
        }
      ]
    }
  ]
}
```

运行时状态（生效日志、ruleId→header 元信息）保存在 `chrome.storage.session`，
仅存活于浏览器会话期间：`hheader:log`（最近 10 条匹配）、`hheader:rulemeta`。

Popup 每次修改都会写入 storage 并向后台发送 `HH_SYNC` 消息；后台 Service Worker
据此调用 `declarativeNetRequest.updateDynamicRules` 重建规则，并同步更新角标与图标颜色。

### 所需权限（manifest.json）

| 权限 | 用途 |
| --- | --- |
| `declarativeNetRequest`          | 修改请求头的核心 API |
| `declarativeNetRequestFeedback`  | 生效日志（`onRuleMatchedDebug`，仅开发者模式） |
| `storage`                        | 持久化配置与会话日志 |
| `contextMenus`                   | 右键「将当前域名加入 HHeader」 |
| `alarms`                         | 存在动态占位符时每分钟刷新规则 |
| `host_permissions: <all_urls>`   | 对任意站点应用规则 |

---

## 测试与验证

单元测试（无需浏览器，覆盖规则引擎 / 变量 / 预设 / 过滤条件）：

```bash
npm test        # node test/ruleEngine.test.mjs → 62 passed
```

端到端浏览器验证（自动加载 `dist/`、驱动扩展、断言规则真实生效，详见 [e2e/README.md](e2e/README.md)）：

```bash
npm install -D playwright && npx playwright install chromium
node e2e/run.mjs
```

浏览器端手动验证清单（`npm run build` 后加载 `dist/`）：

1. **变量**：`Vars` 加变量 `Token=abc`，某规则值填 `Bearer {{Token}}`，命中站点抓包确认已替换；`{{TIMESTAMP}}` 有值。
2. **预设**：`Presets` 应用 GoogleBot，确认新增 UA 规则。
3. **过滤**：规则 ⚙ 仅勾 `POST` / `xmlhttprequest`，确认 GET / 图片请求不受影响。
4. **日志**：触发命中后 `Log` 出现记录，复制 cURL 可在终端运行。
5. **黑暗模式**：切换主题按钮，界面明暗随之变化；`auto` 跟随系统。
6. **拖拽**：拖动 Profile / 规则手柄改变顺序并生效。
7. **右键菜单**：任意页面右键 →「将当前域名加入 HHeader」，确认新增 Profile。
8. **图标变色**：启用带颜色的 Profile，工具栏图标随之着色。
9. **Gist 同步**：填入 Gist ID / Token，Push 后在 GitHub 查看，另一台设备 Pull 生效。

---

## License

MIT
