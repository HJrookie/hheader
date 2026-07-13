// Bridges the popup to the sandboxed script evaluator (public/sandbox/eval.html).
// MV3 forbids `new Function` on extension pages, so script rules are evaluated
// in a sandboxed iframe that is allowed to run eval, then the resulting static
// headers are posted back here.

let iframe = null;
let seq = 0;
const pending = new Map();

function ensureListener() {
  if (ensureListener._wired) return;
  ensureListener._wired = true;
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (d && d.id && pending.has(d.id)) {
      pending.get(d.id)(d);
      pending.delete(d.id);
    }
  });
}

// Mount the hidden sandbox iframe (call once, e.g. on popup mount).
export function mountSandbox() {
  ensureListener();
  if (iframe) return;
  iframe = document.createElement('iframe');
  iframe.src = chrome.runtime.getURL('sandbox/eval.html');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);
}

// Evaluate a script-rule source with the given context. Resolves to
// { ok, headers: [{name, value}], error? }.
export function evalScriptSource(source, ctx) {
  return new Promise((resolve) => {
    if (!iframe || !iframe.contentWindow) {
      resolve({ ok: false, error: 'sandbox 未就绪', headers: [] });
      return;
    }
    const id = 's' + ++seq;
    pending.set(id, resolve);
    iframe.contentWindow.postMessage({ id, source: source || '', ctx: ctx || {} }, '*');
  });
}
