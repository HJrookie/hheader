# HHeader Project Notes

MV3 request-header editor extension (Vue 3 + SCSS + Vite + declarativeNetRequest).

## Key technical decisions
- Build: Vite multi-entry with `root: 'src'` so dist/popup/index.html and dist/background/service-worker.js land correctly; `base: './'` for chrome-extension:// relative assets.
- Rules: profiles -> declarativeNetRequest.modifyHeaders dynamic rules. Add=append, Modify=set, Filter=remove.
- Domain match: wildcard -> `||host` urlFilter (example.com and *.example.com both match domain+subdomains); regex -> `regexFilter` (full URL, validated via isRegexSupported).
- append operation is blocked by Chrome for protected headers (user-agent, cookie, accept-*); engine downgrades those to set.
- Popup persists to chrome.storage.local then sends HH_SYNC message (messages wake the SW; storage.onChanged does NOT). Background rebuilds rules on HH_SYNC / onInstalled / onStartup / storage change.
- regexFilter DOES work with modifyHeaders in current Chrome.

## Load/unpacked
npm install && npm run build, then chrome://extensions -> Load unpacked -> dist/.

## UI layout convention (decided 2026-07-13)
- Keep current layout: Profile cards as top-level grouping (collapsible), 5 tabs (Rules/Vars/Presets/Log/Sync).
- Do NOT switch to ModHeader's single-profile + left-icon-nav + top-toolbar layout, even though its layout was admired. User prefers our current styling and structure.
- Color picker palette fix: `.card` must NOT have `overflow: hidden` (it clips the popover); instead round only `.card__body` bottom corners.

## Icon assets (added 2026-07-13)
- Source: `public/icons/icon.svg` (rounded square, white "H" strokes, brand gradient #3b82f6→#6366f1). Generated PNGs 16/32/48/128 in `public/icons/`; referenced in manifest `action.default_icon` + top-level `icons`.
- Dynamic toolbar icon drawn in `service-worker.js drawIcon()` (rounded square + white H strokes + subtle gradient + inner border). Sizes 16/32/48/128. Tints to active profile color when iconColorSync on; dimmed (alpha 0.4) when no profile enabled.
- Popup brand logo in `App.vue` uses inline SVG "H" inside the same gradient box (`.brand__logo`).

## Sandbox script evaluator (MV3 pattern)
- MV3 default CSP forbids `new Function`/`eval` on extension pages (no 'unsafe-eval'), so user JS (e.g. scriptable header rules) must run in a **sandboxed iframe**: `public/sandbox/eval.html` declared in manifest `"sandbox": { "pages": ["sandbox/eval.html"] }` (allow-scripts, NOT allow-same-origin). The iframe hosts pure JS eval + exposes helpers (md5, btoa) and postMessages results back.
- Bridge: `src/popup/scriptEval.js` `mountSandbox()` (creates hidden iframe via `chrome.runtime.getURL('sandbox/eval.html')`) + `evalScriptSource(source, ctx)` returns a Promise. Popup computes static results at edit time and stores them (rule op `script` -> `header.resolved: [{name,value}]`); the rule engine then expands `resolved` into static modifyHeaders. Never evaluate in the service worker.
- Reusable whenever we need to run arbitrary user JS in this MV3 extension.

## Rule model extensions (batch 4)
- Header has `direction` (request|response) -> DNR `requestHeaders`/`responseHeaders`. `op` = add|modify|filter|redirect|script. `redirect` -> DNR `action:{type:'redirect',redirect:{url}}` (request-only). `script` -> uses `resolved` (computed in sandbox). `resourceTypes`/`methods` per-rule filters.
- Global `settings.stealth` toggle injects `STEALTH_HEADERS` (presets.js) at priority 1..4; user rules have priority base 100 so they always win.
- Analytics: `src/core/analytics.js` counters in `chrome.storage.local` key `hheader:stats` (total, corsFixed, headerCounts, byDir, hours[24h bucket]); service-worker records on each match (throttled 1.5s flush). Dashboard = StatsView.vue (ECharts, lazy-loaded).

## UI layout convention (decided 2026-07-13)
- Keep current layout: Profile cards as top-level grouping (collapsible). Tabs: Rules / Vars / Presets / Log / Sync / Stats.
- New rule capabilities (direction, redirect, script) integrated into RuleRow toggles, NOT new tab pages — keeps it intuitive per user request.
- Do NOT switch to ModHeader's single-profile + left-icon-nav + top-toolbar layout. User prefers our current styling/structure.
- Color picker palette fix: `.card` must NOT have `overflow: hidden` (it clips the popover); instead round only `.card__body` bottom corners.

## Bundle hygiene
- ECharts imported via `echarts/core` + only the needed charts/components/renderers (not the full `echarts`). StatsView is `defineAsyncComponent`-lazy so ECharts (~520KB) loads only when the Stats tab opens; main popup bundle stays ~102KB.
- Literal `{{ }}` in Vue templates breaks the vite:vue compiler — use a JS const then `{{ constName }}` / `:placeholder`.
