import config from '../config.json';
import { fetchSchool } from './school.js';
import { login, loginWithCookie, fetchEclass } from './eclass.js';
import { CookieJar } from './http.js';
import { seal, unseal, COOKIE_NAME, maxAge } from './session.js';

// 每個 isolate 的短期快取（只放公開的學校公告，絕不放 eClass 資料）
let schoolCache = null;

const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

const cookieOf = (req, name) => new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(req.headers.get('cookie') || '')?.[1];
const setCookie = (url, v, age) => `${COOKIE_NAME}=${v}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${url.protocol === 'https:' ? '; Secure' : ''}`;

async function api(request, env, url) {
  const path = url.pathname;

  if (request.method === 'POST') {
    // 擋 CSRF：只收 same-origin 的 JSON（SameSite=Strict 為第二層）
    const origin = request.headers.get('origin');
    if ((origin && origin !== url.origin) || !(request.headers.get('content-type') || '').includes('application/json'))
      return json({ error: 'bad request' }, 400);
  }

  if (path === '/api/school') {
    if (url.searchParams.has('refresh') || !schoolCache || Date.now() - schoolCache.at > config.cacheSeconds * 1000)
      schoolCache = { at: Date.now(), data: await fetchSchool(config.school) };
    return json({ ...schoolCache.data, fetchedAt: schoolCache.at });
  }

  if (path === '/api/eclass/status')
    return json({ loggedIn: !!(await unseal(env.SESSION_SECRET, cookieOf(request, COOKIE_NAME))) });

  if (path === '/api/eclass/login' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    let jar;
    try {
      jar = b.cookie ? loginWithCookie(String(b.cookie)) : await login(config.eclass, String(b.username || ''), String(b.password || ''));
    } catch (e) { return json({ error: String(e.message || e) }, 401); }
    return json({ ok: true }, 200, { 'set-cookie': setCookie(url, await seal(env.SESSION_SECRET, jar.entries()), maxAge) });
  }

  if (path === '/api/eclass/logout' && request.method === 'POST')
    return json({ ok: true }, 200, { 'set-cookie': setCookie(url, '', 0) });

  if (path === '/api/eclass') {
    const entries = await unseal(env.SESSION_SECRET, cookieOf(request, COOKIE_NAME));
    if (!entries) return json({ error: 'not logged in' }, 401);
    return json({ ...(await fetchEclass(config.eclass, CookieJar.from(entries))), fetchedAt: Date.now() });
  }

  return json({ error: 'not found' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try { return await api(request, env, url); }
    catch (e) { return json({ error: String(e.message || e) }, 500); }
  },
};
