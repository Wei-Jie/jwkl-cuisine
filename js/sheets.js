// ==============================
// Google Sheets API 操作封裝
// ==============================

const Sheets = (() => {

    async function requestGAS(payload) {
        // [資安防護] 若在後台系統 (有 Auth 模組)，則自動附上密碼
        if (typeof Auth !== 'undefined') {
            payload.token = Auth.getToken();
        }
        
        const res = await fetch(CONFIG.GAS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
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
