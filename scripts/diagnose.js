// 在「你自己的電腦」執行：抓 config.json 的頁面，存 HTML 並印出抽取結果，方便回報/調整 selector。
// 用法：npm run diagnose            （只抓公開頁）
//       COOKIE="a=1; b=2" npm run diagnose   （用瀏覽器複製的 eClass cookie 一併診斷）
import fs from 'node:fs/promises';
import * as cheerio from 'cheerio';
import { CookieJar, request } from '../src/http.js';
import { extractAnnouncements } from '../src/extract.js';

const config = JSON.parse(await fs.readFile(new URL('../config.json', import.meta.url), 'utf8'));
await fs.mkdir('diagnose-output', { recursive: true });
const jar = new CookieJar();
if (process.env.COOKIE) jar.setRaw(process.env.COOKIE);

for (const [group, pages] of [['school', config.school.pages], ['eclass', config.eclass.pages]]) {
  for (const [i, p] of pages.entries()) {
    console.log(`\n=== [${group}] ${p.name}  ${p.url}`);
    try {
      const res = await request(p.url, { jar: group === 'eclass' ? jar : undefined });
      const file = `diagnose-output/${group}-${i}.html`;
      await fs.writeFile(file, res.html);
      const $ = cheerio.load(res.html);
      console.log(`HTTP ${res.status}，最終網址 ${res.url}，HTML ${res.html.length} bytes → ${file}`);
      console.log(`<title>: ${$('title').text().trim()} | 表單: ${$('form').length} | 密碼欄位: ${$('input[type=password]').length} | <a>: ${$('a[href]').length}`);
      const items = extractAnnouncements(res.html, res.url, { source: p.name, selectors: p.selectors });
      console.log(`抽到 ${items.length} 筆公告，前 5 筆：`);
      for (const it of items.slice(0, 5)) console.log(`  ${it.date}  ${it.title}  <${it.url}>`);
      if (res.html.length < 3000 || !items.length) console.log('⚠ 內容很少或抽不到東西：頁面可能由 JavaScript 動態載入（SPA），請在瀏覽器 DevTools → Network 找 XHR/JSON API 網址回報。');
    } catch (e) { console.log('失敗：', e.message); }
  }
}
console.log('\n把上面輸出（不含 cookie）和 diagnose-output/*.html 的相關片段貼給我即可。注意 eclass-*.html 可能含個資，貼之前先遮掉。');
