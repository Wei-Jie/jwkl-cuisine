# 05. 後端 API 技術規格 (Backend API Specifications)

**文件狀態**：v2.0
**API 類型**：Google Apps Script (GAS) POST Web App

---

## 1. 概觀 (Overview)

後端實作於 `Backend.gs` 中，透過單一網址（Endpoint）接收 JSON Payload，並依據 `action` 進行對應的 Google Sheets 操作。系統使用 UUID 作為全網唯一識別資料索引。

## 2. 請求結構 (Request Body)

所有請求皆為 `POST`，內容為 `application/json`：

```json
{
  "action": "ACTION_NAME",
  "sheetName": "工作表名稱",
  "payload": { ... }
}
```

---

## 3. 指令集 (Actions)

### 3.1 QUERY — 查詢全表資料
- **描述**: 取得該分頁之所有內文列與表頭。
- **Payload**:
  ```json
  { "action": "QUERY", "sheetName": "訂單主檔" }
  ```
- **Response**: 返回二維陣列（矩陣）之全量數據。

### 3.2 APPEND — 新增多筆資料
- **描述**: 在該分頁最後一列下方批次插入新行。
- **Payload**:
  ```json
  { 
    "action": "APPEND", 
    "sheetName": "排單表", 
    "values": [ ["UUID", "240801-01", "2024/08/01", "..."], [...] ] 
  }
  ```

### 3.3 UPDATE_BY_ID — 單筆 UUID 更新
- **描述**: 依據第一欄 ID 尋找目標行，並用新的整列值覆蓋。
- **Payload**:
  ```json
  { 
    "action": "UPDATE_BY_ID", 
    "sheetName": "菜單", 
    "id": "UUID-123", 
    "rowValues": ["UUID-123", "分類", "菜名", "單價", "..."] 
  }
  ```

### 3.4 BATCH_UPDATE — 批次 UUID 更新 (效能優化)
- **描述**: 同時對多筆資料進行搜尋並各自覆蓋。用於排單狀態變更。
- **Payload**:
  ```json
  { 
    "action": "BATCH_UPDATE", 
    "sheetName": "SCHEDULE", 
    "updates": [
       { "id": "UUID1", "rowValues": [...] },
       { "id": "UUID2", "rowValues": [...] }
    ] 
  }
  ```

### 3.5 BATCH_DELETE — 批次 UUID 刪除
- **描述**: 從大到小逆向刪除 UUID 比對成功之列，並避免行號位移。
- **Payload**:
  ```json
  { "action": "BATCH_DELETE", "sheetName": "排單表", "ids": ["UUID1", "UUID2"] }
  ```

---

## 4. 安全性與限制 (Security & Limitations)

1. **認證方式**：目前採用 GAS 公開發布（Anyone, even anonymous）模式以簡化私廚之內部存取流程。
2. **CORS 處理**：後端代碼中已包含 `doOptions` 協助處理瀏覽器的 Preflight 預檢請求，解決跨域通訊難題。
3. **錯誤處理**：若 UUID 不存在或分頁名稱錯誤，後端會返回 `status: "error"` 與錯誤訊息 JSON。

---

## 5. 範例通訊 (Example)

**請求**：
```bash
POST https://script.google.com/macros/s/xxx/exec
{
  "action": "QUERY",
  "sheetName": "菜單"
}
```

**成功回應**：
```json
{
  "status": "success",
  "data": [
    ["ID", "分類", "菜名", "單價", "最小訂購數量", "備註", "預估成本"],
    ["UUID1", "麵食", "水餃", "180", "1", "", "40%"]
  ],
  "error": null
}
```
