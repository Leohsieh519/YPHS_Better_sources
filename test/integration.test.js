import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { login, fetchEclass } from '../src/eclass.js';

// 假 eClass：表單登入 → Set-Cookie → 帶 cookie 才看得到公告
const srv = http.createServer((req, res) => {
  if (req.url === '/login' && req.method === 'GET') {
    res.setHeader('content-type', 'text/html');
    return res.end('<form method="post" action="/do"><input type="hidden" name="csrf" value="tok"><input name="acct"><input type="password" name="pw"><button>go</button></form>');
  }
  if (req.url === '/do') {
    let b = ''; req.on('data', (c) => b += c); req.on('end', () => {
      const p = new URLSearchParams(b);
      if (p.get('csrf') === 'tok' && p.get('acct') === 'leo' && p.get('pw') === 'secret') {
        res.writeHead(302, { 'set-cookie': 'sid=abc; Path=/', location: '/home' }); return res.end();
      }
      res.setHeader('content-type', 'text/html');
      res.end('<form><input type="password" name="pw"></form>');
    }); return;
  }
  if (req.url === '/home') {
    res.setHeader('content-type', 'text/html');
    if (!/sid=abc/.test(req.headers.cookie || '')) return res.end('<input type="password">');
    return res.end('<ul><li>2026-10-01 <a href="/a/1">數學作業：第三章習題</a></li></ul>');
  }
  res.statusCode = 404; res.end();
});

test('eClass 表單登入 + 抓取（假站）', async (t) => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); t.after(() => srv.close());
  const base = `http://127.0.0.1:${srv.address().port}`;
  const cfg = { loginUrl: base + '/login', pages: [{ name: 'hw', url: base + '/home', selectors: null }] };

  await assert.rejects(login(cfg, 'leo', 'wrong'), /登入失敗/);
  const jar = await login(cfg, 'leo', 'secret');
  const out = await fetchEclass(cfg, jar);
  assert.equal(out.errors.length, 0);
  assert.equal(out.items[0].title, '數學作業：第三章習題');
  assert.equal(out.items[0].url, base + '/a/1');
});

import { seal, unseal } from '../src/session.js';
test('session 加密往返、錯誤金鑰與竄改都會失敗', async () => {
  const secret = 'x'.repeat(32), jar = [['sid', 'abc'], ['b', 'c=d']];
  const tok = await seal(secret, jar);
  assert.deepEqual(await unseal(secret, tok), jar);
  assert.equal(await unseal('y'.repeat(32), tok), null);
  assert.equal(await unseal(secret, tok.slice(0, -2) + 'AA'), null);
  assert.equal(await unseal(secret, 'garbage'), null);
});
