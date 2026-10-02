// 小型 fetch 包裝：處理 cookie jar、手動 redirect、Big5/UTF-8 解碼、timeout。
const UA = 'Mozilla/5.0 (compatible; YPHS-Better-Sources/0.1; +student-project)';

export class CookieJar {
  constructor() { this.map = new Map(); }
  // 接受 "a=1; b=2" 形式（手動貼 cookie 用）
  setRaw(str) {
    for (const part of String(str).split(';')) {
      const i = part.indexOf('=');
      if (i > 0) this.map.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
    }
  }
  absorb(res) {
    const list = res.headers.getSetCookie?.() ?? [];
    for (const c of list) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      if (i <= 0) continue;
      const name = pair.slice(0, i).trim();
      const val = pair.slice(i + 1).trim();
      if (/max-age=0/i.test(c) || val === '' || val === 'deleted') this.map.delete(name);
      else this.map.set(name, val);
    }
  }
  header() { return [...this.map].map(([k, v]) => `${k}=${v}`).join('; '); }
  get size() { return this.map.size; }
}

function decode(buf, contentType = '') {
  let charset = /charset=([\w-]+)/i.exec(contentType)?.[1];
  if (!charset) {
    const head = new TextDecoder('latin1').decode(buf.slice(0, 2048));
    charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  }
  charset = (charset || 'utf-8').toLowerCase();
  if (charset === 'big5' || charset === 'big5-hkscs') charset = 'big5';
  try { return new TextDecoder(charset).decode(buf); }
  catch { return new TextDecoder('utf-8').decode(buf); }
}

/** @returns {{status:number,url:string,html:string,headers:Headers}} */
export async function request(url, { jar, method = 'GET', body, headers = {}, maxRedirects = 8, timeoutMs = 15000 } = {}) {
  let cur = url, m = method, b = body;
  for (let i = 0; i <= maxRedirects; i++) {
    const h = { 'user-agent': UA, 'accept-language': 'zh-TW,zh;q=0.9', ...headers };
    if (jar?.size) h.cookie = jar.header();
    const res = await fetch(cur, {
      method: m, body: b, headers: h, redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    jar?.absorb(res);
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      cur = new URL(res.headers.get('location'), cur).href;
      if (res.status !== 307 && res.status !== 308) { m = 'GET'; b = undefined; }
      continue;
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    return { status: res.status, url: cur, html: decode(buf, res.headers.get('content-type') || ''), headers: res.headers };
  }
  throw new Error('redirect 次數過多：' + url);
}
