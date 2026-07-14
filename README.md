# HHeader

An open-source **Manifest V3** browser extension for customizing, modifying, or
removing HTTP **request and response** headers per domain. It borrows the
**Profile** concept from [ModHeader](https://modheader.com/) and wraps it in a
modern, intuitive popup UI.

> Stack: Manifest V3 · `declarativeNetRequest` · Vue 3 · SCSS · Vite

<p align="center">
  <strong>English</strong> &nbsp;·&nbsp; <a href="README.zh.md">中文</a>
</p>

---

## Features

### Basics

- **Profiles** — create multiple profiles, each holding a set of header rules.
- **One-click toggle** — enable / disable any profile independently.
- **Activation mode (global)**:
  - `Multiple` — several profiles can be active at once.
  - `Single` — only one profile may be active; enabling one turns the others off.
- **Per-rule fields**:
  - Operation: `Add` / `Modify` / `Filter` (plus `Redirect` / `Script`, see below).
  - `Header Name` and `Header Value` (`Filter` needs no value).
  - **Direction**: `请求 →` (request) or `响应 ←` (response).
- **Domain filter**:
  - **Wildcard** — e.g. `example.com`, `*.test.com`.
  - **Regex** — matched against the full request URL, e.g. `^https://api\.example\.com/.*`.
- **Persistence** — everything is stored in `chrome.storage.local`; survives restarts.
- **Color tags** — tint each profile (dev = blue, prod = red, …). An accent bar on
  the card shows the active environment at a glance, preventing config mix-ups.
- **Clone** — duplicate a profile (new id, name gets `(copy)`) to fork a setup quickly.
- **Import / Export JSON** — export the whole config as `hheader-config.json`, or
  import a colleague's / a GitHub-shared set. Import **replaces** the current config
  (with a confirm prompt) and auto-fills missing fields and regenerates ids.
- **Badge** — the toolbar icon shows the **number of currently active rules**. `0`
  shows nothing; `>0` shows a blue number, so you know the extension is live without
  opening the popup.

### Advanced

- **Variables & dynamic placeholders** — header values accept `{{VAR}}` tokens.
  Built-ins like `{{TIMESTAMP}}` / `{{UUID}}` plus your own variables (e.g. `Token`)
  reused across rules. See [Variables](#variables--dynamic-injection).
- **Preset library** — 7 one-click setups (spoof GoogleBot / BingBot, simulate
  iPhone / Android, bypass cache, harden security headers, …).
- **Fine-grained filtering (resource type / method)** — scope a rule to specific
  resource types (e.g. only `XHR/Fetch`, leaving images / CSS alone) or HTTP methods
  (e.g. only `POST`).
- **Debug log / monitor** — the panel lists the last 10 requests HHeader modified,
  with **one-click "copy as cURL"** to reproduce in a terminal (dev mode only, see notes).
- **Dark mode** — `auto` / `light` / `dark`; `auto` follows `prefers-color-scheme`.
- **Drag & drop** — reorder profiles and rules (order = priority).
- **Context menu** — right-click any page → "Add current domain to HHeader" to
  quick-create a profile for that site.
- **Icon color sync** — the toolbar icon tints to the active profile's color.
- **Cloud sync (Gist)** — push / pull config across devices via a GitHub Gist.

---

## Config import / export format

The exported JSON *is* the internal state object (easy to share with colleagues or on GitHub):

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

On import, `normalizeState()` validates the data: fills in missing fields
(`color` / `enabled` / `matchType`, …) and regenerates all profile / header ids to
avoid collisions with local config.

---

## Variables & dynamic injection

Use `{{varName}}` placeholders in any header value; they are replaced with real
values when rules are synced.

**Built-in variables** (`BUILTIN_VARS` in `src/core/templating.js`):

| Placeholder | Meaning | Example |
| --- | --- | --- |
| `{{TIMESTAMP}}` | Unix seconds | `1752378705` |
| `{{TIMESTAMP_MS}}` | Unix milliseconds | `1752378705123` |
| `{{ISODATE}}` | ISO 8601 time | `2026-07-13T03:51:45.000Z` |
| `{{DATE}}` | Date | `2026-07-13` |
| `{{UUID}}` | Random UUID v4 | `9f1c…` |
| `{{RANDOM}}` | Random integer | `482913` |

**Custom variables**: add `name → value` in the `Vars` tab, then reference with
`{{name}}` in any rule — change it once, applies everywhere. Undefined placeholders
are left as-is.

> ### ⚠️ Key MV3 limit: variables are a "sync-time snapshot", not per-request
>
> HHeader is built on `declarativeNetRequest` (**declarative**): Chrome freezes
> header values at rule-registration time and the extension cannot rewrite them per
> request. So `{{TIMESTAMP}}` / `{{UUID}}` are generated as a snapshot **at the
> moment rules are synced** and stay constant for that batch.
>
> To mitigate this, when dynamic placeholders are detected the background uses
> `chrome.alarms` to **re-sync rules every minute**, refreshing timestamps / UUIDs
> periodically. If you need a truly per-request unique value, the declarative API
> cannot do it — that's a platform limit, not a bug.

---

## Preset library

The `Presets` tab offers 7 one-click setups (`src/core/presets.js`), applicable to
an existing profile or as a new one:

| Category | Preset | Effect |
| --- | --- | --- |
| Crawler  | GoogleBot / BingBot | Spoof crawler User-Agent |
| Mobile   | iPhone / Android | Simulate modern mobile request headers |
| Security | Security headers | Append CSP / HSTS etc. for testing |
| Debug    | Bypass cache / AJAX | `Cache-Control: no-cache`, `X-Requested-With`, … |

---

## Fine-grained filtering (resource type / HTTP method)

Each rule's **⚙ advanced** panel narrows the scope:

- **Resource type**: when checked, the rule applies only to the chosen types (e.g.
  only `xmlhttprequest` / `fetch`), leaving images, scripts, stylesheets untouched.
  Unchecked = all types.
- **HTTP method**: when checked, only the chosen methods apply (written to the DNR
  `condition.requestMethods`). Unchecked = all methods.

---

## Debug view (Log / Monitor)

The `Log` tab shows the last 10 requests HHeader modified; click an entry to
**copy it as a cURL** command and paste it into a terminal to reproduce.

> ⚠️ This log relies on `chrome.declarativeNetRequest.onRuleMatchedDebug`, which is
> available **only when the extension is loaded unpacked (developer mode)** and
> requires the `declarativeNetRequestFeedback` permission. Store-installed builds
> don't receive this event, so the log is empty there — a Chrome design limit.

---

## Cloud sync (Gist)

The `Sync` tab syncs config across devices:

1. Create a GitHub **Personal Access Token** (tick the `gist` scope).
2. Create or reuse a Gist and put its **Gist ID** + token in the panel.
3. **Push** writes the current config to the Gist; **Pull** fetches and overwrites local.

> The token is stored only in local `chrome.storage.local` and is never leaked via
> the exported JSON (credentials are stripped on export). Pulling preserves your
> locally-entered Gist credentials.

---

## Advanced features (this release)

### 1. Response header modification

Besides request headers, a rule can also target **response** headers: flip the rule's
direction to `响应 ←` and pick `Add` / `Modify` / `Filter`. Two common pain points,
solved in one click:

- **CORS**: `Add Access-Control-Allow-Origin: *` (or a specific origin) to stop local
  cross-origin errors.
- **CSP**: `Filter` out `Content-Security-Policy` to unblock intercepted scripts.

Under the hood it uses `declarativeNetRequest`'s `responseHeaders`, sharing the same
domain / resource-type / method filtering as request rules.

### 2. Scriptable rules

Write a JS function that produces headers dynamically:

```js
(request, ctx) => {
  if (request.url.includes('api')) {
    return { 'X-Custom-Token': 'Calc_' + md5(request.method) };
  }
  return {};
};
```

Available context: `ctx.variables` (your Vars), `md5()`, `btoa()`.

> ⚠ **MV3 limit (important)**: Chrome extension pages forbid `new Function` / `eval`
> by default, and `declarativeNetRequest` is declarative — header values are frozen at
> registration, so JS can't run per request. HHeader therefore evaluates the script in
> a **sandboxed page** (`sandbox/eval.html`, declared with `allow-scripts` in the
> manifest) and stores the result as a **static snapshot** in the rule. It's great for
> "compose a complex value from variables", but it **cannot** branch per live
> `request.url` / `request.method`. Click **Recompute** in the editor to refresh the
> snapshot.

### 3. Multi-device sync (WebDAV / private GitHub repo)

Beyond JSON import/export and GitHub Gist, the Sync tab also supports:

- **WebDAV**: full file URL (e.g. 坚果云 `dav.jianguoyun.com`, Synology, …) + user /
  password (Basic Auth); one-click Push / Pull.
- **Private GitHub repo**: `owner/repo` + file path + token (`repo` scope); uses the
  contents API to read/write `config.json` automatically — like syncing to a repo.

All credentials live only in local `chrome.storage.local`; nothing is sent to any
HHeader server (this project has no backend).

### 4. Advanced copy (cURL / Fetch / Python)

In the Log panel, each hit is **aggregated per request**, showing every header HHeader
changed, with three copy buttons:

- **cURL** / **Fetch** / **Python** — the generated code already includes all headers
  HHeader injected, ready to paste into a terminal / scraper / API automation.

### 5. Request redirect

Pick `Redirect` as the operation (direction is fixed to "request") and enter the target
URL; matching requests are redirected. Classic use: point production
`https://api.prod.com/*` at a local mock `https://localhost:3000/api` for zero-change
front-end debugging. Redirect rules coexist with header rules in the same profile.

### 6. Stealth mode

Click the 🛡 button (top-right of the popup) to toggle it on. HHeader then **auto-injects**
a set of privacy rules (below user-rule priority, so you can override them):

- Request: strip `Referer`, replace `User-Agent` with a generic desktop Chrome.
- Response: strip `ETag`, `Set-Cookie`.

HHeader instantly becomes a lightweight anti-tracking tool. You can also add the
"Stealth" preset as a standalone profile for domain-scoped use.

### 7. Analytics dashboard

The `Stats` tab draws an ECharts dashboard (data comes from the hit log, dev mode only):

- Four metric cards: **total hits / CORS·CSP fixed / request vs response**.
- **Most-modified headers** ranking (bar).
- **Request vs response** traffic share (pie).
- **Last-24h request volume** curve (hourly buckets).

> Stats are fed by the toolbar hit log, so they also require unpacked / developer-mode
> loading. Click **Clear stats** to reset.

---

## Directory structure

```
hheader/
├── public/manifest.json          # MV3 manifest (incl. sandbox declaration)
├── public/sandbox/eval.html       # sandboxed script evaluator (allow-scripts)
├── src/
│   ├── core/
│   │   ├── constants.js           # op/match/resource/method maps, defaults, factories
│   │   ├── storage.js             # chrome.storage.local wrapper
│   │   ├── templating.js          # {{var}} placeholder resolution (built-in + custom)
│   │   ├── presets.js             # preset library + STEALTH_HEADERS
│   │   ├── analytics.js           # Stats counters (storage.local)
│   │   └── ruleEngine.js          # Profile → declarativeNetRequest dynamic rules
│   │                             #   (request / response / redirect / script / stealth)
│   ├── background/
│   │   └── service-worker.js      # rebuild DNR rules, log, alarms, icon tint, menu
│   └── popup/                     # Vue 3 + SCSS popup
│       ├── index.html
│       ├── main.js
│       ├── App.vue                # tabs (Rules/Vars/Presets/Log/Sync/Stats) + theme + stealth + sandbox
│       ├── scriptEval.js          # popup ↔ sandbox evaluation bridge
│       ├── composables/useProfiles.js
│       └── components/
│           ├── ProfileList.vue    # drag-reorder container
│           ├── ProfileCard.vue    # color / clone / rule drag
│           ├── RuleRow.vue        # rule row + ⚙ filters + direction toggle + script/redirect
│           ├── VariablesPanel.vue # variable management
│           ├── PresetPicker.vue   # preset chooser
│           ├── LogView.vue        # hit log + copy cURL/Fetch/Python
│           ├── GistSync.vue       # import/export + Gist/WebDAV/repo sync
│           ├── StatsView.vue       # ECharts dashboard (lazy-loaded)
│           └── BaseToggle.vue
├── test/ruleEngine.test.mjs      # unit tests (62 cases)
├── e2e/run.mjs                   # end-to-end browser verification (Playwright)
├── vite.config.js
└── package.json
```

Build output lives in `dist/`: `dist/manifest.json`, `dist/popup/`, `dist/background/`,
`dist/sandbox/`, `dist/assets/`.

---

## Build & load

```bash
npm install
npm run build      # output to dist/
```

Load the extension:

1. Open `chrome://extensions/` (or Edge's `edge://extensions/`).
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select this project's `dist/` folder.
4. Click the puzzle icon, pin **HHeader**, and open the popup to configure.

> After any source change, re-run `npm run build`, then click **↻** on the extension
> card in the manager.

---

## Rule engine notes (important)

### Operation mapping

| UI op | declarativeNetRequest operation | Notes |
| --- | --- | --- |
| `Add`    | `append` | append / create a header |
| `Modify` | `set`    | overwrite / create a header |
| `Filter` | `remove` | delete a header |

> ⚠️ Chrome restricts `append` to a small allow-list of protected headers
> (`user-agent`, `cookie`, `accept-*`, `x-forwarded-for`, …). So `Add` really does
> `append` only for those; for **custom headers outside the allow-list** (e.g. `X-Custom`)
> the engine auto-downgrades to `set` to avoid Chrome rejecting the rule. If you want to
> overwrite a protected header, use `Modify` (`set`) directly.

### Domain matching

- **Wildcard**: `example.com` and `*.example.com` both match the domain and all
  subdomains; the engine unifies them to the DNR `urlFilter: "||example.com"`. You can
  also write Adblock-style filters directly (starting with `||` or `/` are kept as-is).
  Empty = matches all domains (no `urlFilter`).
- **Regex**: matched against the **full request URL**, written to DNR `regexFilter`.
  Each regex is first validated with `chrome.declarativeNetRequest.isRegexSupported`;
  unsupported ones are skipped with a console warning.

### Per-rule filters

- **Resource type**: when `header.resourceTypes` is non-empty it's written to
  `condition.resourceTypes`; otherwise all types are covered.
- **HTTP method**: when `header.methods` is non-empty it's written to
  `condition.requestMethods` (lowercased); otherwise no method restriction.

### Variable substitution timing

`buildDynamicRules(state)` first builds a variable context via
`buildVarContext(state.variables)`, then calls `resolveTemplate()` on each rule's
`value` to finish `{{VAR}}` substitution before writing the DNR rule. Substitution
happens **at sync time** (see the MV3 limit above).

### Priority

Later profiles and later rules win (`priority = 100 + profileIndex*1000 + headerIndex`),
so on conflict the later one overrides. Drag-reordering adjusts this priority. Stealth
rules are injected at priority 1–4, **below** all user rules, so users can always
override them.

### Quotas

- Total dynamic rules: **5000** (`MAX_NUMBER_OF_DYNAMIC_RULES`).
- Total regex rules: **1000** (`MAX_NUMBER_OF_REGEX_RULES`).

---

## Data storage

Config lives in `chrome.storage.local` under the key `hheader:state`:

```jsonc
{
  "settings": {
    "activation": "multiple",     // "multiple" | "single"
    "theme": "auto",              // "auto" | "light" | "dark"
    "iconColorSync": true,        // icon tints to active profile color
    "stealth": false,             // global anti-tracking switch
    "gist": { "id": "", "token": "" },
    "webdav": { "url": "", "user": "", "pass": "" },
    "repo": { "repo": "", "path": "hheader-config.json", "token": "" }
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
          "op": "add",                // "add" | "modify" | "filter" | "redirect" | "script"
          "name": "X-Custom",
          "value": "Bearer {{Token}}",
          "direction": "request",     // "request" | "response"
          "domains": "example.com, *.test.com",
          "matchType": "wildcard",    // "wildcard" | "regex"
          "resourceTypes": ["xmlhttprequest"],
          "methods": ["post"],
          "redirect": "",             // op === "redirect"
          "script": ""                // op === "script"
        }
      ]
    }
  ]
}
```

Runtime state (hit log, ruleId→header meta) lives in `chrome.storage.session`, valid
only for the browser session: `hheader:log` (last 10 matches), `hheader:rulemeta`.

Every popup edit writes storage and sends an `HH_SYNC` message to the background
Service Worker, which calls `declarativeNetRequest.updateDynamicRules` to rebuild the
rules and updates the badge + icon color.

### Permissions (manifest.json)

| Permission | Purpose |
| --- | --- |
| `declarativeNetRequest` | core API for modifying headers |
| `declarativeNetRequestFeedback` | hit log (`onRuleMatchedDebug`, dev mode only) |
| `storage` | persist config + session log |
| `contextMenus` | right-click "Add current domain to HHeader" |
| `alarms` | re-sync every minute when dynamic placeholders exist |
| `host_permissions: <all_urls>` | apply rules to any site |

---

## Testing & verification

Unit tests (no browser; cover the rule engine / variables / presets / filters):

```bash
npm test        # node test/ruleEngine.test.mjs → 62 passed
```

End-to-end browser verification (loads `dist/`, drives the extension, asserts rules
take effect — see [e2e/README.md](e2e/README.md)):

```bash
npm install -D playwright && npx playwright install chromium
node e2e/run.mjs
```

Manual browser checklist (`npm run build`, then load `dist/`):

1. **Variables**: add `Token=abc` in `Vars`; set a rule value to `Bearer {{Token}}`;
   confirm in DevTools that it's substituted; `{{TIMESTAMP}}` has a value.
2. **Presets**: apply GoogleBot in `Presets`; confirm a new UA rule appears.
3. **Filters**: in a rule's ⚙ panel tick only `POST` / `xmlhttprequest`; confirm GET /
   image requests are unaffected.
4. **Log**: trigger a hit; the `Log` tab shows it; copied cURL runs in a terminal.
5. **Dark mode**: toggle the theme; the UI light/dark follows; `auto` follows the OS.
6. **Drag**: reorder profiles / rules via the handle; confirm it takes effect.
7. **Context menu**: right-click any page → "Add current domain to HHeader"; confirm a
   new profile is created.
8. **Icon tint**: enable a colored profile; the toolbar icon tints accordingly.
9. **Gist sync**: enter Gist ID / token; Push, view on GitHub, Pull on another device.

---

## License

MIT
