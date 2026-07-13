# HHeader E2E verification

End-to-end checks that load the **built** `dist/` extension into a real Chromium
(Playwright), configure it through its own storage, and assert that the rules
actually take effect against a local HTTP server.

It exercises, in a browser, the things unit tests can't:

| # | Check | What it proves |
| - | ----- | -------------- |
| A | Request header `Add` | A custom request header is injected before the request leaves the browser |
| B | `Modify` + `{{Token}}` variable | Template placeholders are resolved at sync time |
| C | Response header `Filter` (remove) | `X-Secret` is stripped from the response |
| D | Response header `Modify` | `X-Test` is rewritten to `after` |
| E | `Redirect` (regex-scoped) | `/old` is redirected to `/new` without looping |
| F | Stealth mode | `Set-Cookie` + `ETag` are stripped from responses |

## Requirements

- Node 18+ (project uses 22)
- `npm run build` already run once (the script auto-builds if `dist/manifest.json` is missing)
- Playwright + a Chromium build:

```bash
npm install -D playwright
npx playwright install chromium
```

## Run

```bash
node e2e/run.mjs
# or, explicit extension path:
EXT_PATH=dist node e2e/run.mjs
```

The script prints a per-check ✓/✗ list and exits non-zero if any check fails.

## How it works

1. Boots a local HTTP server on `127.0.0.1:<random-port>` that **echoes the
   request headers it received** and sets a known set of response headers
   (`X-Secret`, `X-Test`, `ETag`, `Set-Cookie`).
2. Launches Chromium with `--headless=new` and `--load-extension=./dist`
   (the `headless:false` + `--headless=new` combo is what makes MV3 service
   workers + extensions work headless).
3. Discovers the extension id via CDP `Target.getTargets`.
4. For each check it writes a full `hheader:state` to `chrome.storage.local`
   and posts the `HH_SYNC` message — exactly what the popup does — then polls
   `chrome.declarativeNetRequest.getDynamicRules()` until the expected rule is
   live, navigates the test server, and asserts the header/redirect result.
5. Tears down the browser + server and reports.

## Notes / limitations

- Uses `--headless=new`; on a desktop machine you can also run it headed by
  removing that arg (or set `headless: true` won't load extensions — keep the trick).
- Redirect rules are scoped with a **regex on the path** (`^…/old$`) so they
  don't cascade into the target URL.
- The local server binds to `127.0.0.1`; rule domains in the tests use
  `127.0.0.1` (not `localhost`) so the DNR `||127.0.0.1` filter matches.
