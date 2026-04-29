# 🥘 小灶私廚 - 訂單與營收管理系統 (v2.3.0)

「小灶私廚」專為微型餐飲、私廚與小規模手工工作室設計，是一套無需維護伺服器、架構極輕量的「無伺服器 (Serverless)」管理系統。

本系統 **v2.3.0 (Performance & Control 優化版)** 已全面提升核心效能與營運彈性，引入 SystemConfig 預編號機制、全端商品上下架控制、以及強化的接單防呆邏輯。

---

## ✨ 核心模組與功能

### 1. 🛍️ 客戶自助點餐 (`menu.html` & `order.html`)
- **動態圖文網頁**：客戶不需登入即可滑動查閱菜單、過濾分類，具有精美 UI。
- **免帳號預約送出**：送出預約不用跳轉，具備電話格式校驗與重複送單限制。
- **LINE 機器人連動**：收到新訂單的瞬間，老闆的手機 LINE 會立刻收到格式化後的預約通知。
- **進度自助查詢 (track.html)**：客戶憑單號加電話即可查進度。**v2.2 已升級為精準電話比對**，徹底排除誤查風險。

### 2. 🛡️ 安全加固與自動監控 (`Backend.gs` & `P2 監控`) [v2.2 重點]
- **併發單號加鎖 (Concurrency Lock)**：在高流量多人同時下單時，利用 `LockService` 確保訂單編號絕對唯一不重複。
- **API 限流保護 (Rate Limit)**：防止惡意暴力查詢或灌單。送單與查詢皆有頻率限制。
- **CORS 網域限定**：後端僅接受來自官方網域（如 GitHub Pages）與授權環境的請求。
- **自動化系統日誌**：系統出錯時會自動在 Google Sheets 建立「系統日誌」分頁並寫入詳情，無需手動排錯。

### 3. 📝 訂單與排單管理 (`order-list.js`)
- **Handler 模組化架構**：後端代碼已重構為分離的 Handlers，易於擴充與維護。
- **型別提示支援 (js/types.d.ts)**：提供開發時的變數自動補完，減少拼字錯誤。
- **狀態管理**：一鍵切換「備料中」、「製作中」、「已完成」。當訂單皆轉為「已完成」，系統還會貼心寄信給顧客。

### 4. 📊 營收統計 (`revenue.js`)
- **財務總覽**：統計指定期間的訂單數、總營收、已收款與預計淨利。支援秤重商品導致的毛利動態估算。

---

## 🛠️ 技術架構

- **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3. (含 XSS 渲染防護)
- **Backend API:** Google Apps Script (GAS) 採用模組化 Handler 模式。
- **Security:** 
  - `LockService`: 解決單號資源競賽。
  - `CacheService`: 實作 API 限流限制。
  - `XSS/XSRF Protection`: 前後端雙重跳疊與來源校驗。
- **Typing:** TypeScript Definition (`.d.ts`) 提供開發建議。

---

## 🚀 快速開始 (Quick Start)

### 1. 啟動系統
在專案根目錄雙擊執行 `start.bat`（或推上 GitHub Pages）：
- `index.html`：老闆專用後台（需密碼解鎖）。
- `order.html` / `track.html`：給客戶下單與查詢用的介面。

### 2. 環境變數配置 (關鍵)
至 Google Apps Script 佈署頁面的 **專案設定 > 指令碼屬性** 新增以下密鑰：
- `ADMIN_TOKEN`: 登入後台的密碼字串。
- `LINE_ACCESS_TOKEN`: LINE Notify / Messaging API 授權碼。
- `LINE_USER_ID`: 接收通知的對象。

### 3. 維護與手冊
更多進階維護細節（如 Token 換發、欄位擴充）請參閱：
*   [**MAINTENANCE_GUIDE.md**](file:///c:/AI/JWKL_CUISINE/MAINTENANCE_GUIDE.md)

---
*專案由 Antigravity AI 協同開發，為小灶私廚量身打造最直觀、最安全的小規模營運系統。*
