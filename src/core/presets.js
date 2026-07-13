// Built-in "one-click" preset configurations for common developer scenarios.
// applyPreset() returns an array of header-rule seeds (without ids); the store
// wraps them with newHeader() so they merge cleanly into a profile.

import { OP, MATCH_TYPE } from './constants.js';

// Each preset: { id, name, desc, category, headers: [{op,name,value,domains,matchType}] }
export const PRESETS = [
  {
    id: 'googlebot',
    name: 'Googlebot',
    desc: '伪装成 Google 爬虫的 User-Agent',
    category: 'Crawler',
    headers: [
      {
        op: OP.MODIFY,
        name: 'User-Agent',
        value:
          'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        domains: '',
        matchType: MATCH_TYPE.WILDCARD,
      },
    ],
  },
  {
    id: 'bingbot',
    name: 'Bingbot',
    desc: '伪装成 Bing 爬虫的 User-Agent',
    category: 'Crawler',
    headers: [
      {
        op: OP.MODIFY,
        name: 'User-Agent',
        value:
          'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
        domains: '',
        matchType: MATCH_TYPE.WILDCARD,
      },
    ],
  },
  {
    id: 'iphone',
    name: 'iPhone (iOS)',
    desc: '模拟最新 iPhone Safari 请求头',
    category: 'Mobile',
    headers: [
      {
        op: OP.MODIFY,
        name: 'User-Agent',
        value:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
        domains: '',
        matchType: MATCH_TYPE.WILDCARD,
      },
      {
        op: OP.MODIFY,
        name: 'Sec-CH-UA-Mobile',
        value: '?1',
        domains: '',
        matchType: MATCH_TYPE.WILDCARD,
      },
      {
        op: OP.MODIFY,
        name: 'Sec-CH-UA-Platform',
        value: '"iOS"',
        domains: '',
        matchType: MATCH_TYPE.WILDCARD,
      },
    ],
  },
  {
    id: 'android',
    name: 'Android (Chrome)',
    desc: '模拟最新 Android Chrome 请求头',
    category: 'Mobile',
    headers: [
      {
        op: OP.MODIFY,
        name: 'User-Agent',
        value:
          'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
        domains: '',
        matchType: MATCH_TYPE.WILDCARD,
      },
      {
        op: OP.MODIFY,
        name: 'Sec-CH-UA-Mobile',
        value: '?1',
        domains: '',
        matchType: MATCH_TYPE.WILDCARD,
      },
      {
        op: OP.MODIFY,
        name: 'Sec-CH-UA-Platform',
        value: '"Android"',
        domains: '',
        matchType: MATCH_TYPE.WILDCARD,
      },
    ],
  },
  {
    id: 'no-cache',
    name: '绕过缓存',
    desc: '添加 Cache-Control / Pragma 强制不走缓存',
    category: 'Debug',
    headers: [
      {
        op: OP.MODIFY,
        name: 'Cache-Control',
        value: 'no-cache, no-store, must-revalidate',
        domains: '',
        matchType: MATCH_TYPE.WILDCARD,
      },
      {
        op: OP.MODIFY,
        name: 'Pragma',
        value: 'no-cache',
        domains: '',
        matchType: MATCH_TYPE.WILDCARD,
      },
    ],
  },
  {
    id: 'security',
    name: '安全加固头',
    desc: '常见安全头（用于测试站点响应）',
    category: 'Security',
    headers: [
      {
        op: OP.MODIFY,
        name: 'X-Content-Type-Options',
        value: 'nosniff',
        domains: '',
        matchType: MATCH_TYPE.WILDCARD,
      },
      {
        op: OP.MODIFY,
        name: 'X-Frame-Options',
        value: 'DENY',
        domains: '',
        matchType: MATCH_TYPE.WILDCARD,
      },
      {
        op: OP.MODIFY,
        name: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
        domains: '',
        matchType: MATCH_TYPE.WILDCARD,
      },
    ],
  },
  {
    id: 'ajax',
    name: 'AJAX / XHR 标识',
    desc: '添加 X-Requested-With，模拟 AJAX 请求',
    category: 'Debug',
    headers: [
      {
        op: OP.ADD,
        name: 'X-Requested-With',
        value: 'XMLHttpRequest',
        domains: '',
        matchType: MATCH_TYPE.WILDCARD,
      },
    ],
  },
  {
    id: 'stealth',
    name: '隐私防护 (Stealth)',
    desc: '移除 Referer / Set-Cookie / ETag，伪装通用 UA',
    category: 'Privacy',
    headers: [
      { op: OP.FILTER, name: 'Referer', domains: '', matchType: MATCH_TYPE.WILDCARD, direction: 'request' },
      {
        op: OP.MODIFY,
        name: 'User-Agent',
        value:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        domains: '',
        matchType: MATCH_TYPE.WILDCARD,
        direction: 'request',
      },
      { op: OP.FILTER, name: 'ETag', domains: '', matchType: MATCH_TYPE.WILDCARD, direction: 'response' },
      { op: OP.FILTER, name: 'Set-Cookie', domains: '', matchType: MATCH_TYPE.WILDCARD, direction: 'response' },
    ],
  },
];

// The global "Stealth Mode" switch injects these rules into every request,
// regardless of which profiles are enabled. Same set as the preset above but
// expressed as plain rule specs (direction + op + name + value) so the rule
// engine can fold them in at a low priority.
export const STEALTH_HEADERS = [
  { direction: 'request', op: OP.FILTER, name: 'Referer', value: '' },
  {
    direction: 'request',
    op: OP.MODIFY,
    name: 'User-Agent',
    value:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
  { direction: 'response', op: OP.FILTER, name: 'ETag', value: '' },
  { direction: 'response', op: OP.FILTER, name: 'Set-Cookie', value: '' },
];

// Return the raw header seeds for a preset id (or [] if unknown).
export function getPresetHeaders(presetId) {
  const p = PRESETS.find((x) => x.id === presetId);
  return p ? JSON.parse(JSON.stringify(p.headers)) : [];
}
