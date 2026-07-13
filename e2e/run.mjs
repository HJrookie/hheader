/**
 * HHeader — End-to-end verification script
 * ---------------------------------------------------------------
 * Loads the built `dist/` extension into a real Chromium (Playwright),
 * drives its configuration through the extension's own storage, then
 * exercises the rules against a local HTTP server and asserts they take
 * effect (request headers, response headers, redirect, stealth).
 *
 * Requirements:
 *   - `npm run build` already ran (we auto-build if `dist/manifest.json` is missing)
 *   - Playwright + a Chromium build installed (`npm i -D playwright && npx playwright install chromium`)
 *
 * Run:
 *   node e2e/run.mjs                # auto-builds if needed
 *   EXT_PATH=dist node e2e/run.mjs  # explicit extension path
 *
 * Notes:
 *   - Uses `--headless=new` (via headless:false + that arg) so Manifest V3
 *     service workers and extensions work in a headless environment.
 *   - The extension id is discovered at runtime via CDP Target.getTargets.
 *   - Rules are applied exactly like the popup does: write `hheader:state`
 *     to chrome.storage.local, then post the `HH_SYNC` message.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const EXT_PATH = path.resolve(ROOT, process.env.EXT_PATH || 'dist');

// ---------------------------------------------------------------------------
// Tiny assertion / reporting helpers
// ---------------------------------------------------------------------------
const results = [];
function assert(cond, label, detail) {
  if (!cond) throw new Error(label + (detail ? `\n      observed: ${detail}` : ''));
}
async function run(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (e) {
    results.push({ name, ok: false, err: e.message });
    console.log(`  \x1b[31m✗\x1b[0m ${name}\n      ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Local test server: echoes request headers + sets known response headers
// ---------------------------------------------------------------------------
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      const p = u.pathname;
      // Response headers every response carries (targets for modify/remove tests)
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('X-Secret', 'original');
      res.setHeader('X-Test', 'before');
      res.setHeader('ETag', '"v1"');
      res.setHeader('Set-Cookie', 'hheader_test=1; Path=/');

      if (p === '/echo') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(req.headers)); // request headers the server saw
        return;
      }
      if (p === '/old') {
        res.setHeader('Content-Type', 'text/html');
        res.end('<html><body id="marker">OLD_PAGE</body></html>');
        return;
      }
      if (p === '/new') {
        res.setHeader('Content-Type', 'text/html');
        res.end('<html><body id="marker">NEW_PAGE</body></html>');
        return;
      }
      res.setHeader('Content-Type', 'text/html');
      res.end('<html><body>MAIN</body></html>');
    });
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port, base: `http://127.0.0.1:${port}` });
    });
  });
}

// ---------------------------------------------------------------------------
// Extension driving helpers
// ---------------------------------------------------------------------------
let PAGE; // a page in the extension context (used to call chrome.* APIs)

async function getExtensionId(context) {
  const cdp = await context.newCDPSession(await context.newPage());
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const { targetInfos } = await cdp.send('Target.getTargets');
    const bg = targetInfos.find(
      (t) => t.url.startsWith('chrome-extension://') && t.url.includes('background/service-worker.js')
    );
    if (bg) return new URL(bg.url).host;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Could not find HHeader background service worker. Is dist/ built and loadable?');
}

// Write a full state object and ask the service worker to rebuild rules,
// exactly the way the popup does it.
async function applyState(state) {
  await PAGE.goto(`chrome-extension://${EXT_ID}/popup/index.html`, { waitUntil: 'domcontentloaded' });
  await PAGE.evaluate(async (cfg) => {
    await chrome.storage.local.set({ 'hheader:state': cfg });
    await new Promise((res) => {
      try {
        chrome.runtime.sendMessage({ type: 'HH_SYNC' }, () => res());
      } catch {
        res();
      }
    });
  }, state);
}

// Poll the live DNR rule set until a matching rule is present.
async function waitForRule(matcher) {
  await PAGE.evaluate(async (m) => {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      try {
        const rules = await chrome.declarativeNetRequest.getDynamicRules();
        const hit = rules.some((r) => {
          if (m.redirect) return r.action && r.action.type === 'redirect';
          const h = (r.action.requestHeaders || [])[0] || (r.action.responseHeaders || [])[0];
          if (!h) return false;
          if (m.header && h.header !== m.header) return false;
          const dir = r.action.requestHeaders
            ? 'request'
            : r.action.responseHeaders
            ? 'response'
            : r.action.redirect
            ? 'request'
            : '';
          if (m.direction && dir !== m.direction) return false;
          return true;
        });
        if (hit) return;
      } catch {
        /* declarativeNetRequest may not be ready yet */
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('timed out waiting for rule: ' + JSON.stringify(m));
  }, matcher);
}

async function getRequestHeaders() {
  await PAGE.goto(`${SERVER.base}/echo`, { waitUntil: 'domcontentloaded' });
  const txt = (await PAGE.locator('body').textContent()) || '{}';
  return JSON.parse(txt);
}

async function getResponseHeaders(target = '/') {
  const resp = await PAGE.goto(`${SERVER.base}${target}`, { waitUntil: 'domcontentloaded' });
  return resp.headers();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
let EXT_ID;
let SERVER;
let browser;

async function main() {
  if (!fs.existsSync(path.join(EXT_PATH, 'manifest.json'))) {
    console.log('[e2e] dist/manifest.json not found — running `npm run build`...');
    execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
  }

  SERVER = startServer();
  console.log(`[e2e] test server: ${SERVER.base}`);

  browser = await chromium.launch({
    headless: false, // we pass --headless=new ourselves so MV3 extensions work
    args: [
      '--headless=new',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      `--load-extension=${EXT_PATH}`,
      `--disable-extensions-except=${EXT_PATH}`,
    ],
  });

  const context = await browser.newContext();
  PAGE = await context.newPage();
  await PAGE.addInitScript(() => {
    /* ensure chrome.* is reachable; nothing to do, just keep page alive */
  });

  EXT_ID = await getExtensionId(context);
  console.log(`[e2e] extension id: ${EXT_ID}\n`);

  // === Test A: request header ADD =========================================
  await run('Request header (Add) is injected', async () => {
    await applyState({
      settings: {},
      profiles: [
        {
          name: 'A',
          enabled: true,
          color: '#3b82f6',
          headers: [
            {
              op: 'add',
              name: 'X-E2E-Add',
              value: 'hello',
              direction: 'request',
              domains: '127.0.0.1',
              matchType: 'wildcard',
            },
          ],
        },
      ],
      variables: [],
    });
    await waitForRule({ header: 'X-E2E-Add', direction: 'request' });
    const rh = await getRequestHeaders();
    assert(rh['x-e2e-add'] === 'hello', 'X-E2E-Add should equal "hello"', JSON.stringify(rh));
  });

  // === Test B: request header MODIFY with a variable =====================
  await run('Variable {{Token}} substituted into request header', async () => {
    await applyState({
      settings: {},
      profiles: [
        {
          name: 'B',
          enabled: true,
          color: '#3b82f6',
          headers: [
            {
              op: 'modify',
              name: 'Authorization',
              value: 'Bearer {{Token}}',
              direction: 'request',
              domains: '127.0.0.1',
              matchType: 'wildcard',
            },
          ],
        },
      ],
      variables: [{ name: 'Token', value: 'abc123' }],
    });
    await waitForRule({ header: 'Authorization', direction: 'request' });
    const rh = await getRequestHeaders();
    assert(
      rh['authorization'] === 'Bearer abc123',
      'Authorization should be "Bearer abc123"',
      JSON.stringify(rh)
    );
  });

  // === Test C: response header REMOVE (Filter) ===========================
  await run('Response header removed (Filter X-Secret)', async () => {
    await applyState({
      settings: {},
      profiles: [
        {
          name: 'C',
          enabled: true,
          color: '#3b82f6',
          headers: [
            {
              op: 'filter',
              name: 'X-Secret',
              direction: 'response',
              domains: '127.0.0.1',
              matchType: 'wildcard',
            },
          ],
        },
      ],
      variables: [],
    });
    await waitForRule({ header: 'X-Secret', direction: 'response' });
    const hh = await getResponseHeaders('/');
    assert(!('x-secret' in hh), 'X-Secret should be removed', JSON.stringify(hh));
  });

  // === Test D: response header MODIFY ====================================
  await run('Response header modified (Modify X-Test)', async () => {
    await applyState({
      settings: {},
      profiles: [
        {
          name: 'D',
          enabled: true,
          color: '#3b82f6',
          headers: [
            {
              op: 'modify',
              name: 'X-Test',
              value: 'after',
              direction: 'response',
              domains: '127.0.0.1',
              matchType: 'wildcard',
            },
          ],
        },
      ],
      variables: [],
    });
    await waitForRule({ header: 'X-Test', direction: 'response' });
    const hh = await getResponseHeaders('/');
    assert(hh['x-test'] === 'after', 'X-Test should equal "after"', JSON.stringify(hh));
  });

  // === Test E: request REDIRECT (regex-scoped) ===========================
  await run('Request redirected (/old → /new)', async () => {
    const regex = `^http://127\\.0\\.0\\.1:${SERVER.port}/old$`;
    await applyState({
      settings: {},
      profiles: [
        {
          name: 'E',
          enabled: true,
          color: '#3b82f6',
          headers: [
            {
              op: 'redirect',
              name: '',
              value: '',
              direction: 'request',
              domains: regex,
              matchType: 'regex',
              redirect: `${SERVER.base}/new`,
            },
          ],
        },
      ],
      variables: [],
    });
    await waitForRule({ redirect: true });
    const resp = await PAGE.goto(`${SERVER.base}/old`, { waitUntil: 'domcontentloaded' });
    const finalUrl = resp.url();
    const body = (await PAGE.locator('body').textContent()) || '';
    assert(finalUrl.endsWith('/new'), 'final URL should end with /new', finalUrl);
    assert(body.includes('NEW_PAGE'), 'redirected page should contain NEW_PAGE', body);
  });

  // === Test F: Stealth mode injects privacy rules ========================
  await run('Stealth mode strips Set-Cookie & ETag', async () => {
    await applyState({ settings: { stealth: true }, profiles: [], variables: [] });
    await waitForRule({ header: 'Set-Cookie', direction: 'response' });
    const hh = await getResponseHeaders('/');
    assert(!('set-cookie' in hh), 'Stealth should remove Set-Cookie', JSON.stringify(hh));
    assert(!('etag' in hh), 'Stealth should remove ETag', JSON.stringify(hh));
  });

  // ---- summary ----------------------------------------------------------
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log('\n────────────────────────────────────────────');
  console.log(`  e2e result: ${passed}/${results.length} passed, ${failed} failed`);
  console.log('────────────────────────────────────────────');
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error('\n[e2e] fatal error:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      if (SERVER && SERVER.server) SERVER.server.close();
    } catch {
      /* ignore */
    }
    try {
      if (browser) await browser.close();
    } catch {
      /* ignore */
    }
  });
