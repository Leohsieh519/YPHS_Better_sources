// eClass：帳密只在記憶體裡的 session（cookie jar），不寫入磁碟、不寫 log。
import * as cheerio from 'cheerio';
import crypto from 'node:crypto';
import { CookieJar, request } from './http.js';
import { extractAnnouncements } from './extract.js';

const sessions = new Map(); // token -> { jar, expires }
const TTL_MS = 60 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of sessions) if (v.expires < now) sessions.delete(k);
}, 60_000).unref();

export function getSession(token) {
  const s = token && sessions.get(token);
  if (!s || s.expires < Date.now()) return null;
  s.expires = Date.now() + TTL_MS;
  return s;
}
export function logout(token) { sessions.delete(token); }

function newSession(jar) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { jar, expires: Date.now() + TTL_MS });
  return token;
}

/** 在登入頁找出帳號/密碼欄位並送出表單（通用做法，未必適用所有 eClass 版本）。 */
export async function login(cfg, username, password) {
  const jar = new CookieJar();
  const page = await request(cfg.loginUrl, { jar });
  const $ = cheerio.load(page.html);
  const $pw = $('input[type=password]').first();
  if (!$pw.length) throw new Error('登入頁找不到密碼欄位（可能是 JS 動態產生或網址不對），請用 cookie 登入模式，或跑 npm run diagnose 回報。');
  const $form = $pw.closest('form');
  if (!$form.length) throw new Error('找不到登入 <form>（可能是 AJAX 登入），請用 cookie 登入模式。');

  const fields = new URLSearchParams();
  $form.find('input[name],select[name],textarea[name]').each((_, el) => {
    const $el = $(el), type = ($el.attr('type') || 'text').toLowerCase();
    if (['submit', 'button', 'image', 'file'].includes(type)) return;
    if (['checkbox', 'radio'].includes(type) && !$el.attr('checked')) return;
    fields.set($el.attr('name'), $el.attr('value') ?? '');
  });
  fields.set($pw.attr('name'), password);
  // 帳號欄位：密碼欄位之前最後一個文字型 input
  const $user = $form.find('input').filter((_, el) => {
    const t = ($(el).attr('type') || 'text').toLowerCase();
    return ['text', 'email', 'tel', 'number'].includes(t) && $(el).attr('name');
  }).first();
  if (!$user.length) throw new Error('找不到帳號欄位');
  fields.set($user.attr('name'), username);

  const action = new URL($form.attr('action') || page.url, page.url).href;
  const method = ($form.attr('method') || 'POST').toUpperCase();
  const res = method === 'GET'
    ? await request(action + '?' + fields, { jar })
    : await request(action, { jar, method: 'POST', body: fields, headers: { 'content-type': 'application/x-www-form-urlencoded', referer: page.url } });

  // 登入失敗的粗略判斷：回來的頁面還有密碼欄位
  if (cheerio.load(res.html)('input[type=password]').length) throw new Error('登入失敗：帳號或密碼錯誤？');
  return newSession(jar);
}

/** 貼上瀏覽器的 Cookie header（從 DevTools 複製），適用 AJAX/驗證碼等無法用表單登入的情況。 */
export function loginWithCookie(cookieStr) {
  const jar = new CookieJar();
  jar.setRaw(cookieStr);
  if (!jar.size) throw new Error('Cookie 格式不正確');
  return newSession(jar);
}

export async function fetchEclass(cfg, session) {
  const items = [], errors = [];
  await Promise.all(cfg.pages.map(async (p) => {
    try {
      const res = await request(p.url, { jar: session.jar });
      if (res.status >= 400) throw new Error('HTTP ' + res.status);
      if (cheerio.load(res.html)('input[type=password]').length) throw new Error('登入已過期，請重新登入');
      items.push(...extractAnnouncements(res.html, res.url, { source: p.name, selectors: p.selectors }));
    } catch (e) {
      errors.push({ page: p.name, error: String(e.message || e) });
    }
  }));
  return { items, errors };
}
