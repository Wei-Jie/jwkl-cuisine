// ==============================
// 工具函式
// ==============================

/** 格式化日期為 YYYY/M/D */
function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/** 將 YYYY/M/D 轉換為 input[type=date] 用的 YYYY-MM-DD */
function toInputDate(str) {
    if (!str) return '';
    const parts = str.split('/');
    if (parts.length !== 3) return '';
    return `${parts[0]}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`;
}

/** 將 YYYY-MM-DD 轉回 YYYY/M/D */
function fromInputDate(str) {
    if (!str) return '';
    const parts = str.split('-');
    if (parts.length !== 3) return '';
    return `${parts[0]}/${parseInt(parts[1])}/${parseInt(parts[2])}`;
}

/** 取得今日的 YYYY/M/D 字串 */
function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/** 取得今日的 YYYY-MM-DD 字串（input 用） */
function todayInputStr() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
}

/** 格式化金額（加千分位） */
function formatAmount(n) {
    if (n === '' || n === null || n === undefined) return '';
    return `$${Number(n).toLocaleString('zh-TW')}`;
}

/**
 * 產生新訂單編號
 * 格式：YYMMDD + 4位序號
 * @param {string[]} existingIds - 既有訂單編號陣列
 * @param {Date} [date] - 指定日期，預設今日
 */
function generateOrderId(existingIds, date) {
    const d = date || new Date();
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const prefix = `${yy}${mm}${dd}`;

    let maxSeq = 0;
    existingIds.forEach(id => {
        if (id && String(id).startsWith(prefix)) {
            const seq = parseInt(String(id).slice(6), 10);
            if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
        }
    });
    return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

/** 顯示 Toast 通知 */
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast toast-${type} show`;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 3500);
}

/** 顯示確認 Dialog，回傳 Promise<boolean> */
function showConfirm(message) {
    return new Promise(resolve => {
        const modal = document.getElementById('confirmModal');
        const msgEl = document.getElementById('confirmMessage');
        const okBtn = document.getElementById('confirmOk');
        const cancelBtn = document.getElementById('confirmCancel');

        msgEl.textContent = message;
        modal.classList.add('show');

        const cleanup = () => {
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            modal.classList.remove('show');
        };
        const onOk = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
    });
}

/** 顯示/隱藏 Loading */
function showLoading(visible) {
    const el = document.getElementById('loadingOverlay');
    if (el) el.classList.toggle('show', visible);
}

/** 從陣列資料（含標題列）轉換為物件陣列，並附帶原始行號 */
function rowsToObjects(rows) {
    if (!rows || rows.length < 2) return [];
    const headers = rows[0];
    return rows.slice(1).map((row, i) => {
        const obj = { _rowIndex: i + 2 }; // Sheets 1-indexed，第1列是標題
        headers.forEach((h, j) => { obj[h] = row[j] || ''; });
        return obj;
    });
}

/** 防抖函式 */
function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}
