// ==============================
// Google Sheets API 操作封裝
// ==============================

const Sheets = (() => {

    async function requestGAS(payload) {
        // App.onLogin() 或是其他地方呼叫時，會對 GAS_URL 發送 POST
        // 注意：Web App 預設會遇到 Redirect 跟 CORS，GAS 這邊處理方式已經設置好 TEXT/JSON
        // 如果瀏覽器仍跳 CORS 錯誤，可以在 request 加入 mode: 'cors' 或是 body 轉換。
        const res = await fetch(CONFIG.GAS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8', // GAS 偏好 text/plain 避免 preflight OPTIONS 的一些雷
            },
            body: JSON.stringify(payload)
        });
        
        let result;
        try {
            result = await res.json();
        } catch(e) {
            throw new Error('伺服器回應異常，可能網址錯誤或需要重新部署');
        }
        
        if (result.status === 'error') {
            throw new Error(result.error);
        }
        return result;
    }

    async function getSheet(sheetName) {
        const res = await requestGAS({ action: 'QUERY', sheetName: sheetName });
        return res.data || [];
    }

    async function appendRows(sheetName, values) {
        return requestGAS({ action: 'APPEND', sheetName: sheetName, values: values });
    }

    async function updateById(sheetName, id, rowValues) {
        return requestGAS({ action: 'UPDATE_BY_ID', sheetName: sheetName, id: id, rowValues: rowValues });
    }

    async function batchUpdateById(sheetName, updates) {
        // updates = [{ id: 'xx', rowValues: [...] }, ...]
        return requestGAS({ action: 'BATCH_UPDATE', sheetName: sheetName, updates: updates });
    }

    async function batchDeleteById(sheetName, ids) {
        // ids = ['UUID1', 'UUID2']
        return requestGAS({ action: 'BATCH_DELETE', sheetName: sheetName, ids: ids });
    }

    /** 相容舊程式碼呼叫，我們已經不再依賴 sheetId 進行刪除 */
    async function getSheetIds() {
        return {};
    }

    return { requestGAS, getSheet, appendRows, updateById, batchUpdateById, batchDeleteById, getSheetIds };
})();
