import { request } from './http.js';
import { extractAnnouncements } from './extract.js';

/** 抓學校官網所有設定的公告頁；單頁失敗不影響其他頁。 */
export async function fetchSchool(cfg) {
  const items = [], errors = [];
  await Promise.all(cfg.pages.map(async (p) => {
    try {
      const res = await request(p.url);
      if (res.status >= 400) throw new Error('HTTP ' + res.status);
      items.push(...extractAnnouncements(res.html, res.url, { source: p.name, selectors: p.selectors }));
    } catch (e) {
      errors.push({ page: p.name, error: String(e.message || e) });
    }
  }));
  return { items, errors };
}
