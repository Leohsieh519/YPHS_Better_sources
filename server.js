import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSchool } from './src/school.js';
import { login, loginWithCookie, logout, getSession, fetchEclass } from './src/eclass.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(await fs.readFile(path.join(root, 'config.json'), 'utf8'));
const PORT = process.env.PORT || config.port || 3000;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const cache = new Map(); // key -> { at, data }
async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < config.cacheSeconds * 1000) return hit.data;
  const data = await fn();
  cache.set(key, { at: Date.now(), data });
  return data;
}

const send = (res, code, obj, headers = {}) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(obj));
};
const readJson = (req) => new Promise((ok, bad) => {
  let s = '';
  req.on('data', (c) => { s += c; if (s.length > 20_000) { bad(new Error('too large')); req.destroy(); } });
  req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch (e) { bad(e); } });
});
const tokenOf = (req) => /(?:^|;\s*)eclass=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1];
const cookieHdr = (v, age) => `eclass=${v}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}`;

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    // 只接受本機來源，避免別的網站用你的瀏覽器打這個 API（CSRF/DNS rebinding）
    const host = (req.headers.host || '').split(':')[0];
    if (!['localhost', '127.0.0.1', '[::1]'].includes(host) && !process.env.ALLOW_LAN) return send(res, 403, { error: 'forbidden host' });

    if (url.pathname === '/api/school') {
      const force = url.searchParams.has('refresh');
      if (force) cache.delete('school');
      const data = await cached('school', () => fetchSchool(config.school));
      return send(res, 200, { ...data, fetchedAt: cache.get('school').at });
    }
    if (url.pathname === '/api/eclass/status') {
      return send(res, 200, { loggedIn: !!getSession(tokenOf(req)) });
    }
    if (url.pathname === '/api/eclass/login' && req.method === 'POST') {
      const b = await readJson(req);
      const token = b.cookie ? loginWithCookie(b.cookie) : await login(config.eclass, String(b.username || ''), String(b.password || ''));
      return send(res, 200, { ok: true }, { 'set-cookie': cookieHdr(token, 3600) });
    }
    if (url.pathname === '/api/eclass/logout' && req.method === 'POST') {
      logout(tokenOf(req));
      return send(res, 200, { ok: true }, { 'set-cookie': cookieHdr('', 0) });
    }
    if (url.pathname === '/api/eclass') {
      const s = getSession(tokenOf(req));
      if (!s) return send(res, 401, { error: 'not logged in' });
      const data = await fetchEclass(config.eclass, s);
      return send(res, 200, { ...data, fetchedAt: Date.now() });
    }

    // 靜態檔
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = path.join(root, 'public', path.normalize(rel));
    if (!file.startsWith(path.join(root, 'public'))) return send(res, 403, { error: 'forbidden' });
    const buf = await fs.readFile(file).catch(() => null);
    if (!buf) return send(res, 404, { error: 'not found' });
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  } catch (e) {
    send(res, 500, { error: String(e.message || e) });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`YPHS Better Sources → http://localhost:${PORT}`));
