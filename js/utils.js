/**
 * 通用工具函式 (v2.2.0 合併版)
 */

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * 將試算表 Rows 轉為物件陣列
 * @param {Array[]} rows 
 * @returns {Object[]}
 */
function rowsToObjects(rows) {
    if (!rows || rows.length < 2) return [];
    const headers = rows[0];
    return rows.slice(1).map(row => {
        const obj = {};
        headers.forEach((h, i) => {
            let val = row[i];
            // 處理日期格式
            if (val instanceof Date) {
                val = val.getFullYear() + '/' + 
                      String(val.getMonth() + 1).padStart(2, '0') + '/' + 
                      String(val.getDate()).padStart(2, '0');
            }
            // 處理為 null 或 undefined 的情況
            obj[h] = (val === null || val === undefined) ? "" : val;
        });
        return obj;
    });
}

/**
 * 格式化備註內容，防止 XSS 與格式崩壞
 */
function normalizeNote(text) {
    if (!text) return "";
    return text.trim()
        .replace(/\r\n/g, " ")
        .replace(/\n/g, " ")
        .replace(/\t/g, " ");
}

/**
 * 金額格式化
 */
function formatCurrency(amount) {
    const num = parseFloat(String(amount).replace(/[$,]/g, '')) || 0;
    return '$' + num.toLocaleString('zh-TW');
}

/**
 * 延遲函式
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
