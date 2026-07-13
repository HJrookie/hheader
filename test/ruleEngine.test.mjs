// HHeader 规则引擎的无头单元测试（无需浏览器）。
// 运行: node test/ruleEngine.test.mjs
//
// 通过 mock chrome.declarativeNetRequest.isRegexSupported 来验证：
//   - 操作映射 (Add->append, Modify->set, Filter->remove)
//   - 通配符域名 -> ||host 的 urlFilter
//   - 空域名 -> 不加 urlFilter（匹配所有）
//   - 禁用 Profile 被忽略
//   - append 受限头部自动降级为 set
//   - 正则 -> regexFilter，且非法正则被跳过并告警
//   - 多 Profile 优先级递增

globalThis.chrome = {
  declarativeNetRequest: {
    isRegexSupported: (opts, cb) => {
      try {
        // eslint-disable-next-line no-new
        new RegExp(opts.regex);
        cb({ isSupported: true });
      } catch {
        cb({ isSupported: false });
      }
    },
  },
};

const { buildDynamicRules } = await import('../src/core/ruleEngine.js');
const { normalizeState, newProfile, newHeader, DEFAULT_PROFILE_COLOR } = await import('../src/core/constants.js');
const { resolveTemplate, buildVarContext } = await import('../src/core/templating.js');
const { getPresetHeaders, PRESETS } = await import('../src/core/presets.js');
const { isCorsRelated, bumpStats, emptyStats } = await import('../src/core/analytics.js');

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) {
    passed++;
    console.log('  \u2713', name);
  } else {
    failed++;
    console.error('  \u2717', name);
  }
}
const hasOp = (rules, header, op) =>
  rules.some((r) => r.action.requestHeaders.some((h) => h.header === header && h.operation === op));

const run = async () => {
  // 1. 基础：通配符 + 操作映射（add 用受保护头部 cookie 验证 append 映射）
  let { rules, warnings } = await buildDynamicRules({
    settings: { activation: 'multiple' },
    profiles: [
      {
        id: 'p1',
        name: 'A',
        enabled: true,
        headers: [
          { id: 'h1', op: 'add', name: 'cookie', value: 'v', domains: 'example.com, *.test.com', matchType: 'wildcard' },
          { id: 'h2', op: 'filter', name: 'X-Drop', value: '', domains: 'api.example.com', matchType: 'wildcard' },
        ],
      },
    ],
  });
  check('add(受保护头部) -> append', hasOp(rules, 'cookie', 'append'));
  check('filter -> remove', hasOp(rules, 'X-Drop', 'remove'));
  check('通配符 example.com -> ||example.com', rules.some((r) => r.condition.urlFilter === '||example.com'));
  check('通配符 *.test.com -> ||test.com', rules.some((r) => r.condition.urlFilter === '||test.com'));
  check('规则数 = 3', rules.length === 3);

  // 2. 空域名 -> 不加 urlFilter（匹配所有）
  ({ rules } = await buildDynamicRules({
    settings: { activation: 'multiple' },
    profiles: [{ id: 'p1', enabled: true, headers: [{ id: 'h', op: 'modify', name: 'X-Any', value: '1', domains: '', matchType: 'wildcard' }] }],
  }));
  check('空域名 => 无 urlFilter', !rules[0].condition.urlFilter && !rules[0].condition.regexFilter);

  // 3. 禁用的 Profile 被忽略
  ({ rules } = await buildDynamicRules({
    settings: { activation: 'multiple' },
    profiles: [
      { id: 'p1', enabled: false, headers: [{ id: 'h', op: 'add', name: 'X-Off', value: '1', domains: '', matchType: 'wildcard' }] },
      { id: 'p2', enabled: true, headers: [{ id: 'h', op: 'add', name: 'X-On', value: '1', domains: '', matchType: 'wildcard' }] },
    ],
  }));
  check('禁用 Profile 被忽略', rules.length === 1 && rules[0].action.requestHeaders[0].header === 'X-On');

  // 4. 受保护头部（在 allowlist 内）保持 append
  ({ rules } = await buildDynamicRules({
    settings: { activation: 'multiple' },
    profiles: [{ id: 'p1', enabled: true, headers: [{ id: 'h', op: 'add', name: 'user-agent', value: 'UA', domains: '', matchType: 'wildcard' }] }],
  }));
  check('受保护头部 user-agent 保持 append', hasOp(rules, 'user-agent', 'append') && !hasOp(rules, 'user-agent', 'set'));

  // 4b. 非受保护头部 append 自动降级为 set（否则 Chrome 会抛错）
  ({ rules } = await buildDynamicRules({
    settings: { activation: 'multiple' },
    profiles: [{ id: 'p1', enabled: true, headers: [{ id: 'h', op: 'add', name: 'X-Custom', value: 'v', domains: '', matchType: 'wildcard' }] }],
  }));
  check('非受保护头部 X-Custom append -> set', hasOp(rules, 'X-Custom', 'set') && !hasOp(rules, 'X-Custom', 'append'));

  // 5. 合法正则 -> regexFilter
  ({ rules, warnings } = await buildDynamicRules({
    settings: { activation: 'multiple' },
    profiles: [{ id: 'p1', enabled: true, headers: [{ id: 'h', op: 'add', name: 'X-Rx', value: '1', domains: '^https://a\\.b\\.com/.*', matchType: 'regex' }] }],
  }));
  check('正则 -> regexFilter', rules[0].condition.regexFilter === '^https://a\\.b\\.com/.*');

  // 6. 非法正则 -> 跳过并告警
  ({ rules, warnings } = await buildDynamicRules({
    settings: { activation: 'multiple' },
    profiles: [{ id: 'p1', enabled: true, headers: [{ id: 'h', op: 'add', name: 'X-Bad', value: '1', domains: '(', matchType: 'regex' }] }],
  }));
  check('非法正则被跳过', rules.length === 0 && warnings.length === 1);

  // 7. 多 Profile 优先级递增
  ({ rules } = await buildDynamicRules({
    settings: { activation: 'multiple' },
    profiles: [
      { id: 'p1', enabled: true, headers: [{ id: 'h', op: 'add', name: 'X1', value: '1', domains: '', matchType: 'wildcard' }] },
      { id: 'p2', enabled: true, headers: [{ id: 'h', op: 'add', name: 'X2', value: '1', domains: '', matchType: 'wildcard' }] },
    ],
  }));
  const p1 = rules.find((r) => r.action.requestHeaders[0].header === 'X1').priority;
  const p2 = rules.find((r) => r.action.requestHeaders[0].header === 'X2').priority;
  check('Profile2 优先级 > Profile1', p2 > p1);

  // 8. normalizeState: 导入/旧数据补齐字段、默认色、重建 id
  const norm = normalizeState({
    profiles: [
      { name: 'Legacy', enabled: true, headers: [{ name: 'X-A', op: 'add', value: '1' }] },
      { headers: [{ name: 'X-B' }] }, // 缺 name/color/enabled
    ],
  });
  check('normalize 后含 2 个 profile', norm.profiles.length === 2);
  check('缺失 name 用默认值', norm.profiles[1].name === 'Imported Profile');
  check('缺失 color 用默认色', norm.profiles[1].color === DEFAULT_PROFILE_COLOR);
  check('缺 enabled 默认 true', norm.profiles[1].enabled === true);
  check('header 字段补齐(matchType/domains)', norm.profiles[0].headers[0].matchType === 'wildcard' && norm.profiles[0].headers[0].domains === '');
  check('导入重建 profile id', norm.profiles[0].id !== 'legacy' && typeof norm.profiles[0].id === 'string');
  check('导入重建 header id', norm.profiles[0].headers[0].id !== undefined);

  // 9. newProfile 默认带颜色
  check('newProfile 默认带颜色', newProfile('X').color === DEFAULT_PROFILE_COLOR);

  // 10. 模板：自定义变量替换
  const ctx = buildVarContext([{ name: 'Token', value: 'abc123' }]);
  check('自定义变量替换', resolveTemplate('Bearer {{Token}}', ctx) === 'Bearer abc123');
  check('未知占位符保留原样', resolveTemplate('x {{Nope}} y', ctx) === 'x {{Nope}} y');
  check('内置 TIMESTAMP 为数字串', /^\d+$/.test(resolveTemplate('{{TIMESTAMP}}', ctx)));
  check('内置 UUID 形如 uuid', /^[0-9a-f-]{36}$/i.test(resolveTemplate('{{UUID}}', ctx)));

  // 11. 变量在 buildDynamicRules 中生效
  ({ rules } = await buildDynamicRules({
    settings: { activation: 'multiple' },
    variables: [{ name: 'Token', value: 'T-9' }],
    profiles: [{ id: 'p1', enabled: true, headers: [{ id: 'h', op: 'modify', name: 'Authorization', value: 'Bearer {{Token}}', domains: '', matchType: 'wildcard' }] }],
  }));
  check('规则构建时替换变量', rules[0].action.requestHeaders[0].value === 'Bearer T-9');

  // 12. 预设展开
  check('预设库非空', PRESETS.length > 0);
  const ua = getPresetHeaders('googlebot');
  check('googlebot 预设含 UA', ua.length === 1 && /Googlebot/.test(ua[0].value));

  // 13. 资源类型 / 方法过滤条件
  ({ rules } = await buildDynamicRules({
    settings: { activation: 'multiple' },
    profiles: [{ id: 'p1', enabled: true, headers: [{ id: 'h', op: 'modify', name: 'X-F', value: '1', domains: '', matchType: 'wildcard', resourceTypes: ['xmlhttprequest'], methods: ['post'] }] }],
  }));
  check('resourceTypes 覆盖默认', JSON.stringify(rules[0].condition.resourceTypes) === JSON.stringify(['xmlhttprequest']));
  check('methods -> requestMethods', JSON.stringify(rules[0].condition.requestMethods) === JSON.stringify(['post']));

  // 14. 空过滤 -> 默认全资源、无 requestMethods
  ({ rules } = await buildDynamicRules({
    settings: { activation: 'multiple' },
    profiles: [{ id: 'p1', enabled: true, headers: [{ id: 'h', op: 'modify', name: 'X-G', value: '1', domains: '', matchType: 'wildcard' }] }],
  }));
  check('空 resourceTypes -> 默认全集', rules[0].condition.resourceTypes.length > 1);
  check('空 methods -> 无 requestMethods', rules[0].condition.requestMethods === undefined);

  // 15. newHeader(seed) 携带过滤字段
  const nh = newHeader({ name: 'X-S', resourceTypes: ['image'], methods: ['get'] });
  check('newHeader seed 保留 resourceTypes/methods', nh.resourceTypes[0] === 'image' && nh.methods[0] === 'get');

  // 16. 响应方向 -> responseHeaders
  ({ rules } = await buildDynamicRules({
    settings: { activation: 'multiple' },
    profiles: [{ id: 'p1', enabled: true, headers: [{ id: 'h', op: 'modify', name: 'Content-Security-Policy', value: "default-src 'self'", direction: 'response', domains: '', matchType: 'wildcard' }] }],
  }));
  check('响应方向 -> responseHeaders', rules[0].action.responseHeaders && rules[0].action.responseHeaders[0].header === 'Content-Security-Policy');
  check('响应方向无 requestHeaders', rules[0].action.requestHeaders === undefined);

  // 17. 重定向规则 -> action redirect
  ({ rules } = await buildDynamicRules({
    settings: { activation: 'multiple' },
    profiles: [{ id: 'p1', enabled: true, headers: [{ id: 'h', op: 'redirect', name: '', redirect: 'https://localhost:3000/api', domains: 'api.example.com', matchType: 'wildcard' }] }],
  }));
  check('redirect -> action.type redirect', rules[0].action.type === 'redirect');
  check('redirect url 正确', rules[0].action.redirect.url === 'https://localhost:3000/api');
  check('redirect 仍带 urlFilter', rules[0].condition.urlFilter === '||api.example.com');
  ({ rules } = await buildDynamicRules({
    settings: { activation: 'multiple' },
    profiles: [{ id: 'p1', enabled: true, headers: [{ id: 'h', op: 'redirect', name: '', redirect: '', domains: '' }] }],
  }));
  check('redirect 空 URL 被跳过', rules.length === 0);

  // 18. 脚本规则：用预先计算好的 resolved 展开
  ({ rules } = await buildDynamicRules({
    settings: { activation: 'multiple' },
    profiles: [{ id: 'p1', enabled: true, headers: [{ id: 'h', op: 'script', name: 's', script: '(r)=>({})', resolved: [{ name: 'X-A', value: '1' }, { name: 'X-B', value: '2' }], direction: 'request', domains: '' }] }],
  }));
  check('script resolved 展开为 2 条 modifyHeaders', rules.length === 2 && rules.every((r) => r.action.type === 'modifyHeaders'));
  check('script resolved 头部值正确', rules.some((r) => r.action.requestHeaders[0].header === 'X-A' && r.action.requestHeaders[0].value === '1'));
  ({ rules, warnings } = await buildDynamicRules({
    settings: { activation: 'multiple' },
    profiles: [{ id: 'p1', enabled: true, headers: [{ id: 'h', op: 'script', name: 's', script: '(r)=>({})', resolved: [], domains: '' }] }],
  }));
  check('script 无 resolved -> 跳过并告警', rules.length === 0 && warnings.length === 1);

  // 19. 全局隐私防护（Stealth）注入
  ({ rules } = await buildDynamicRules({ settings: { activation: 'multiple', stealth: true }, profiles: [] }));
  check('stealth 注入 4 条规则', rules.length === 4);
  check('stealth 移除请求 Referer', rules.some((r) => r.action.requestHeaders && r.action.requestHeaders[0].header === 'Referer' && r.action.requestHeaders[0].operation === 'remove'));
  check('stealth 移除响应 Set-Cookie', rules.some((r) => r.action.responseHeaders && r.action.responseHeaders[0].header === 'Set-Cookie' && r.action.responseHeaders[0].operation === 'remove'));
  check('stealth 优先级 < 用户规则(100)', rules.every((r) => r.priority < 100));

  // 20. 用户规则优先级基准上移
  ({ rules } = await buildDynamicRules({
    settings: { activation: 'multiple' },
    profiles: [{ id: 'p1', enabled: true, headers: [{ id: 'h', op: 'add', name: 'X-U', value: '1', domains: '' }] }],
  }));
  check('用户规则优先级 >= 100', rules[0].priority >= 100);

  // 21. normalizeState 透传新增设置
  const n2 = normalizeState({
    settings: { stealth: true, webdav: { url: 'https://x/y.json', user: 'u', pass: 'p' }, repo: { repo: 'a/b', path: 'c.json', token: 't' } },
    profiles: [],
  });
  check('normalize stealth=true', n2.settings.stealth === true);
  check('normalize webdav 透传', n2.settings.webdav.url === 'https://x/y.json' && n2.settings.webdav.user === 'u');
  check('normalize repo 透传', n2.settings.repo.repo === 'a/b' && n2.settings.repo.path === 'c.json');
  const n3 = normalizeState({ profiles: [] });
  check('normalize 默认 stealth=false', n3.settings.stealth === false);

  // 22. newHeader 携带 direction/redirect/script
  const nh2 = newHeader({ name: 'X', op: 'redirect', redirect: 'https://x', direction: 'response' });
  check('newHeader redirect 保留', nh2.op === 'redirect' && nh2.redirect === 'https://x');
  check('newHeader direction=response 保留', nh2.direction === 'response');
  const nh3 = newHeader({ op: 'script', script: '(r)=>({})' });
  check('newHeader script 保留', nh3.op === 'script' && nh3.script === '(r)=>({})');
  check('newHeader 默认 direction=request', newHeader({ name: 'X' }).direction === 'request');

  // 23. 分析统计辅助函数
  check('isCorsRelated ACAO', isCorsRelated('access-control-allow-origin'));
  check('isCorsRelated CSP', isCorsRelated('content-security-policy'));
  check('isCorsRelated 否', !isCorsRelated('x-custom'));
  const st = emptyStats();
  bumpStats(st, { header: 'X-A', direction: 'request', isCors: false });
  bumpStats(st, { header: 'access-control-allow-origin', direction: 'response', isCors: true });
  check('bumpStats total=2', st.total === 2);
  check('bumpStats corsFixed=1', st.corsFixed === 1);
  check('bumpStats headerCounts', st.headerCounts['X-A'] === 1 && st.headerCounts['access-control-allow-origin'] === 1);
  check('bumpStats byDir', st.byDir.request === 1 && st.byDir.response === 1);
  check('bumpStats hours 增长', Object.keys(st.hours).length === 1);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
};

run();
