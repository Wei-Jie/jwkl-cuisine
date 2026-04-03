// ==============================
// Google Sheets API 操作封裝
// ==============================

const Sheets = (() => {
    const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
    const SID = CONFIG.SPREADSHEET_ID;

    function token() {
        return Auth.getToken();
    }

    function headers() {
        return {
            'Authorization': `Bearer ${token()}`,
            'Content-Type': 'application/json'
        };
    }

    async function request(url, options = {}) {
        const res = await fetch(url, { ...options, headers: headers() });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || `HTTP ${res.status}`);
        }
        return res.json();
    }

    /** 取得試算表基本資訊（sheetId 等） */
    async function getSpreadsheetInfo() {
        return request(`${BASE}/${SID}?fields=sheets(properties(sheetId,title))`);
    }

    /** 讀取指定範圍的值 */
    async function getValues(range) {
        const url = `${BASE}/${SID}/values/${encodeURIComponent(range)}`;
        const data = await request(url);
        return data.values || [];
    }

    /** 讀取整個工作表（自動取全欄） */
    async function getSheet(sheetName) {
        return getValues(`${sheetName}!A:Z`);
    }

    /** 追加列到工作表末尾 */
    async function appendRows(sheetName, values) {
        const url = `${BASE}/${SID}/values/${encodeURIComponent(sheetName + '!A1')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
        return request(url, {
            method: 'POST',
            body: JSON.stringify({ values })
        });
    }

    /** 更新單一範圍 */
    async function updateRange(range, values) {
        const url = `${BASE}/${SID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
        return request(url, {
            method: 'PUT',
            body: JSON.stringify({ values })
        });
    }

    /** 批量更新多個範圍 */
    async function batchUpdate(dataArr) {
        // dataArr: [{ range, values }, ...]
        const url = `${BASE}/${SID}/values:batchUpdate`;
        return request(url, {
            method: 'POST',
            body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: dataArr })
        });
    }

    /** 批量刪除指定工作表的列（rowIndices: 0-indexed 陣列） */
    async function deleteRows(sheetId, rowIndices) {
        if (!rowIndices.length) return;
        // 從大到小排序，避免刪除後行號偏移
        const sorted = [...rowIndices].sort((a, b) => b - a);
        const requests = sorted.map(i => ({
            deleteDimension: {
                range: { sheetId, dimension: 'ROWS', startIndex: i, endIndex: i + 1 }
            }
        }));
        const url = `${BASE}/${SID}:batchUpdate`;
        return request(url, {
            method: 'POST',
            body: JSON.stringify({ requests })
        });
    }

    /**
     * 取得各工作表的 sheetId（數字）映射
     * 回傳：{ '訂單主檔': 0, '排單表': 123456, ... }
     */
    async function getSheetIds() {
        const info = await getSpreadsheetInfo();
        const map = {};
        info.sheets.forEach(s => {
            map[s.properties.title] = s.properties.sheetId;
        });
        return map;
    }

    return { getSheet, getValues, appendRows, updateRange, batchUpdate, deleteRows, getSheetIds };
})();
