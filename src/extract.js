// 通用「公告列表」抽取器。
// 想法：公告列表幾乎一定是「一列 = 日期 + 標題連結」。找出同時含日期和連結的 <tr>/<li>/<div>，
// 取同一層級裡出現最多次的那種 row，當作公告列表。
import * as cheerio from 'cheerio';

const DATE_RE = /(\d{2,4})\s*[-\/.年]\s*(\d{1,2})\s*[-\/.月]\s*(\d{1,2})/;

export function parseDate(text) {
  const m = DATE_RE.exec(text || '');
  if (!m) return null;
  let [, y, mo, d] = m.map(Number);
  if (y < 1911 && y > 0) y += 1911;           // 民國年（113 → 2024）
  if (y < 1990 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
const SKIP_HREF = /^(#|javascript:|mailto:|tel:)/i;

function fromRows($, rows, baseUrl, source) {
  const out = [];
  rows.each((_, el) => {
    const $row = $(el);
    const date = parseDate($row.text());
    if (!date) return;
    // 標題連結 = 文字最長的 <a>
    let best = null;
    $row.find('a[href]').each((_, a) => {
      const href = $(a).attr('href') || '';
      if (SKIP_HREF.test(href)) return;
      const t = clean($(a).text());
      if (!best || t.length > best.title.length) best = { title: t, href };
    });
    if (!best || best.title.length < 4) return;
    const rowText = clean($row.text());
    const tag = clean($row.find('.category,.cat,.type,.unit,.dept,.badge,.label').first().text()) || null;
    out.push({
      source,
      title: best.title,
      url: new URL(best.href, baseUrl).href,
      date,
      tag,
      snippet: rowText.replace(best.title, '').replace(DATE_RE, '').trim().slice(0, 80) || null,
    });
  });
  return out;
}

export function extractAnnouncements(html, baseUrl, { source = '', selectors = null } = {}) {
  const $ = cheerio.load(html);

  if (selectors?.row) {
    const rows = $(selectors.row);
    if (!selectors.title) return fromRows($, rows, baseUrl, source);
    const out = [];
    rows.each((_, el) => {
      const $r = $(el);
      const $a = $r.find(selectors.title).first();
      const href = $a.attr('href') || $r.find('a[href]').first().attr('href');
      const title = clean($a.text());
      if (!title || !href) return;
      const dateText = selectors.date ? $r.find(selectors.date).first().text() : $r.text();
      out.push({
        source, title, url: new URL(href, baseUrl).href,
        date: parseDate(dateText),
        tag: selectors.tag ? clean($r.find(selectors.tag).first().text()) || null : null,
        snippet: null,
      });
    });
    return out;
  }

  // 通用模式：試 tr / li / 其他容器，取抽到最多筆者
  $('script,style,nav,header,footer').remove();
  const candidates = ['tr', 'li', '.row,.item,.list-item,article,.news,.post'];
  let best = [];
  for (const sel of candidates) {
    const rows = fromRows($, $(sel), baseUrl, source);
    if (rows.length > best.length) best = rows;
  }
  // 去重（同 url+title）並依日期新到舊
  const seen = new Set();
  return best
    .filter((r) => { const k = r.url + '|' + r.title; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}
