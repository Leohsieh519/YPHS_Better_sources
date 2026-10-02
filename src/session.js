// 無狀態 session：cookie jar 用 AES-GCM 加密後放在使用者自己的瀏覽器 cookie 裡。
// Worker 不存任何帳密或 session；金鑰來自 env.SESSION_SECRET。
const enc = new TextEncoder(), dec = new TextDecoder();
const TTL_S = 3600;

const b64 = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function key(secret) {
  if (!secret || secret.length < 16) throw new Error('伺服器未設定 SESSION_SECRET（至少 16 字元）');
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(secret));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** @param {[string,string][]} jarEntries */
export async function seal(secret, jarEntries) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = enc.encode(JSON.stringify({ j: jarEntries, e: Date.now() + TTL_S * 1000 }));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(secret), data));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  const s = b64(out);
  if (s.length > 3800) throw new Error('eClass cookie 太大，放不進瀏覽器 cookie（4KB 上限）');
  return s;
}

/** @returns {Promise<[string,string][]|null>} */
export async function unseal(secret, token) {
  if (!token) return null;
  try {
    const buf = unb64(token);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, await key(secret), buf.slice(12));
    const { j, e } = JSON.parse(dec.decode(pt));
    return e > Date.now() ? j : null;
  } catch { return null; }
}

export const COOKIE_NAME = 'eclass';
export const maxAge = TTL_S;
