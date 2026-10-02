# YPHS Better Sources

把學校官網公告和 eClass 的資料匯整成一個比較好用的介面（搜尋、未讀標記、釘選、深淺色）。
**在自己電腦本機執行**，不需要資料庫，帳密不落地。

## 使用

```bash
npm install
npm start          # → http://localhost:3000
npm test
```

需要 Node.js 20+。

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

## eClass 登入

- 介面上輸入帳密 → 本機伺服器代為登入 → cookie 只存在記憶體（1 小時），不寫檔、不寫 log。
- 表單登入不適用時（AJAX 登入、驗證碼），改貼瀏覽器的 Cookie。

## 安全備註

- 伺服器只綁 `127.0.0.1`，並檢查 `Host`，避免被其他網站透過瀏覽器打 API。
- 請只用自己的帳號；使用前確認符合學校與 eClass 的使用規範，抓取頻率已快取 5 分鐘。
- 要給同學用，建議每人本機跑，而不是架一台共用伺服器收帳密。
