import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { extractAnnouncements, parseDate } from '../src/extract.js';

test('parseDate 支援民國年與多種分隔符', () => {
  assert.equal(parseDate('113/10/01'), '2024-10-01');
  assert.equal(parseDate('2026.9.5'), '2026-09-05');
  assert.equal(parseDate('115年10月2日'), '2026-10-02');
  assert.equal(parseDate('no date'), null);
});

test('通用模式能從 table 抽出公告並轉絕對網址', () => {
  const html = fs.readFileSync(new URL('./fixtures/list.html', import.meta.url), 'utf8');
  const items = extractAnnouncements(html, 'https://www.yphs.tp.edu.tw/index.php', { source: 't' });
  assert.equal(items.length, 2);
  assert.equal(items[0].title, '學務處：校慶運動會報名開始'); // 2026-09-28 比 2024-10-01 新
  assert.equal(items[0].url, 'https://www.yphs.tp.edu.tw/news/2.php');
  assert.equal(items[1].url, 'https://www.yphs.tp.edu.tw/post?id=1');
});

test('自訂 selector 模式', () => {
  const html = '<div class="n"><span class="d">115/10/02</span><a class="t" href="/x">測試公告標題</a></div>';
  const items = extractAnnouncements(html, 'https://a.b/', { selectors: { row: '.n', title: '.t', date: '.d' } });
  assert.deepEqual([items[0].title, items[0].date, items[0].url], ['測試公告標題', '2026-10-02', 'https://a.b/x']);
});
