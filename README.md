# YPHS Better Sources

把學校官網公告和 eClass 的資料匯整成一個比較好用的介面（搜尋、未讀標記、釘選、深淺色）。
**在自己電腦本機執行**，不需要資料庫，帳密不落地。

## 使用（Cloudflare Workers）

需要 Node.js 20+。

```bash
npm install
npm start              # wrangler dev → http://localhost:8787（本機模擬 Workers）
npm test
```

本機登入 eClass 需要 `.dev.vars`（已 gitignore，內含一行 `SESSION_SECRET=至少16字元的隨機字串`）。

## 部署到 Cloudflare

```bash
npx wrangler login
npx wrangler secret put SESSION_SECRET     # 貼上一串隨機字串，例如 openssl rand -base64 32
npm run deploy                             # → https://yphs-better-sources.<你的帳號>.workers.dev
```

靜態頁面由 Cloudflare Assets 服務，只有 `/api/*` 進 Worker，免費方案就夠用。

**部署前務必先確認兩件事：**

1. **學校官網是否擋海外 IP。** Worker 的出口 IP 不在台灣，有些學校網站會擋。部署後打開 `/api/school`，如果 errors 是 403/逾時就是被擋。
2. **eClass 公開架站的責任。** 同學的帳密會經過你的 Worker（只轉送、不保存）。建議用 **Cloudflare Access**（Zero Trust）把網站限制成學校 email 才能進，並事先告知使用者、取得學校同意。

## 第一次使用：先跑診斷

爬蟲用通用演算法（找「日期 + 連結」的列表列）加上可覆寫的 CSS selector。
學校網站與 eClass 的實際結構需要在能連到它們的環境驗證：

```bash
npm run diagnose                       # 抓公開頁，印出抽到的公告
COOKIE="a=1; b=2" npm run diagnose     # 連同 eClass（Cookie 從瀏覽器 DevTools 複製）
```

抽不準或抽不到時，在 `config.json` 對應頁面填 `selectors`：

```json
{ "name": "學校公告", "url": "https://www.yphs.tp.edu.tw/...",
  "selectors": { "row": "table.news tr", "title": "a", "date": "td.date", "tag": "td.unit" } }
```

若 `diagnose` 顯示頁面內容很少，代表資料是 JavaScript 動態載入，要改抓它背後的 JSON API。

## eClass 登入與 session

- 登入時 Worker 代為送出表單，**密碼用完即丟**。
- 登入後的 cookie jar 以 AES-GCM（金鑰來自 `SESSION_SECRET`）加密，放在使用者自己瀏覽器的 HttpOnly cookie，有效 1 小時。Worker 端不存任何 session，也不快取任何 eClass 資料。
- 表單登入不適用時（AJAX 登入、驗證碼），改貼瀏覽器的 Cookie。

## 安全備註

- POST 只接受 same-origin 的 JSON，cookie 為 `HttpOnly; SameSite=Strict`（https 下加 `Secure`）。
- 請只用自己的帳號，使用前確認符合學校與 eClass 規範；學校公告在 isolate 內快取 5 分鐘。
- `SESSION_SECRET` 外洩 = 攻擊者可偽造/解開 session cookie，請當密碼保管。
