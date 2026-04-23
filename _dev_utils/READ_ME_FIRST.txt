# 🛠️ JWKL Cuisine 開發者工具說明書

本目錄 (_dev_utils/) 存放的是系統開發、安全性測試以及連線模擬用的腳本。
這些檔案受 .gitignore 保護，不會被上傳到公開的 GitHub。

## 檔案說明：

1. **simulate.js**
   - 用途：在本地端模擬前端下單流程。
   - 何時使用：當您想測試後端邏輯，但不想實際打開瀏覽器一項一項點選時。

2. **test_gas.js**
   - 用途：測試與 Google Apps Script (GAS) 的連線能力。
   - 何時使用：當系統回報「連線失敗」或「Token 錯誤」時，執行此腳本可快速隔離診斷。

3. **test_backend.js**
   - 用途：最新的 v2.2 Handler 路由測試腳本。
   - 何時使用：變更 Backend.gs 的動作分支後，用來驗證 PING、SUBMIT 等分流是否正確。

4. **UPLOAD_CHECKLIST.txt**
   - 用途：Git 上傳備忘錄與指令懶人包。
   - 何時使用：每次準備將修改推送到 GitHub 之前。

---
*註：若要執行以上 .js 檔案，請在終端機輸入 `node [檔名]`。*
