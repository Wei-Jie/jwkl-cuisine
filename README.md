# 🥘 小灶私廚 - 訂單與營收管理系統 

「小灶私廚」專為微型餐飲、私廚與小規模手工工作室設計，是一套無需維護伺服器、架構極輕量的「無伺服器 (Serverless)」內部管理系統。

本系統擁有如原生手機 APP 般流暢的操作體驗，前端採用純 HTML/CSS/JS 打造，並直接搭配 **Google Sheets API** 進行資料持久化儲存與讀取，結合 **Google Identity Services** 讓管理員安全地登入。

---

## ✨ 核心模組與功能

### 1. 📝 新增訂單 (`order-new.js`)
- 支援動態增加多個品項，自動計算單品小計與訂單總金額。
- 支援「秤重品項」防呆輸入（在結單當下直接忽略金額而在明細進行二次計算）。
- 同時寫入「訂單主檔」與「排單表」，確保資料連動。

### 2. 📅 排單管理 (`order-list.js`)
- 支援條件篩選（依日期區間、排程狀態、顧客名稱或出貨日期）查詢既有訂單。
- 擁有完整的「訂單明細」CRUD 視窗，可以在事後針對已存在的訂單內動態增刪改菜色。
- 修改明細時會**自動連動修改該筆訂單的總金額**。
- 將訂單勾選改為「已完成」或「已出貨」，並能批量更新。

### 3. 🧾 菜單管理 (`menu-mgmt.js`)
- 即時新增、修改、刪除（CRUD）您的專屬商品菜單。
- 支援「單位」、「單價」與**「預估成本」**（支援固定金額或百分比，如：`30%`），方便後續毛利分析。

### 4. 💸 支出紀錄 (`expense.js`)
- 輕鬆輸入並記下每日的食材、水電瓦斯、包裝耗材與運費。
- 提供最近 30 筆款項的自動匯入與防呆修改（CRUD）功能，完全不須動用原版 Google 試算表。

### 5. 📊 營收統計 (`revenue.js`)
- 匯集「訂單表」、「菜價」與「支出表」進行深度商業分析。
- 除了提供基礎的「訂單數」、「總營收」與「待收款」外，更具備雙軌利潤分析：
  - **單品毛利分析**：從菜單單價與設定之預估成本百分比，分析各項餐點的紙上毛利率。
  - **實際淨利試算**：抓取本月總營收，扣除在「支出紀錄」中所登錄的買菜、包裝開銷，精準反映老闆荷包最終增加了多少。

---

## 🛠️ 技術架構

- **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3
- **Authentication:** Google Identity Services (OAuth 2.0 Implicit Flow)
- **Database Backend:** Google Sheets API (v4)
- **Deployment:** 支援 GitHub Pages, Netlify, Vercel 等靜態網頁代管空間

這套系統不依賴任何 Node.js 背景，所有的非同步操作 `fetch` 皆由純前端發生，維護成本幾乎為 $0。

---

## 🚀 部署與環境建立指南

如果您需要自己部署這套系統給另一間店使用，請依照以下三個步驟操作：

### 步驟 1：建立 Google Cloud 憑證
1. 前往 [Google Cloud Console](https://console.cloud.google.com/)。
2. 建立一個專案，搜尋並啟用 **Google Sheets API**。
3. 前往「憑證」> 建立 OAuth 2.0 用戶端 ID（選擇「網頁應用程式」）。
4. 設定**已授權的 JavaScript 來源**與**已授權的重新導向 URI**（例如您發佈的 `https://wei-jie.github.io` 與地端除錯 `http://localhost:8080`）。

### 步驟 2：準備您的 Google 試算表
1. 建立一個全新的 Google 試算表。
2. 在下方建立最少四個分頁，需完全命名為：
   - `訂單主檔`
   - `排單表`
   - `菜單`
   - `支出紀錄`
3. 到網址列擷取這份試算表的 **Spreadsheet ID**（位在 `/d/` 與 `/edit` 之間的亂碼）。

### 步驟 3：修改系統配置
打開根目錄下的 `js/config.js`，將上面的金鑰與 ID 填入：

```javascript
const CONFIG = {
    CLIENT_ID: '填入您在第一步取得的 Google Client ID',
    SPREADSHEET_ID: '填入您在第二步取得的試算表 ID',
    SCOPES: 'https://www.googleapis.com/auth/spreadsheets',
    SHEETS: {
        ORDER_MAIN: '訂單主檔',
        ORDER_STATUS: '訂單狀態',
        SCHEDULE: '排單表',
        MENU: '菜單',
        EXPENSES: '支出紀錄'
    },
    // ...略
};
```

### 步驟 4：上傳並完成
將整個資料夾上推到 GitHub，並啟動 GitHub Pages，您專屬的免費 Serverless 訂單系統即刻上線！

---
*專案由 Antigravity AI 協同開發，為小灶私廚量身打造最直觀的商業流程營運系統。*
