// ==============================
// 主程式：導覽 & 頁面切換
// ==============================

const App = (() => {
    let currentPage = null;
    let sheetIds = {};
    let menuCache = null;

    const pages = {
        'order-new': OrderNew,
        'order-list': OrderList,
        'schedule-mgmt-item': ScheduleMgmtItem,
        'pending-orders': PendingOrders,
        'menu-mgmt': MenuMgmt,
        'expense': ExpenseMgmt,
        'revenue': Revenue
    };

    function init() {
        // 導覽按鈕事件
        document.querySelectorAll('.nav-btn[data-page]').forEach(btn => {
            btn.addEventListener('click', () => navigateTo(btn.dataset.page));
        });
    }

    async function onLogin() {
        showLoading(true);
        try {
            await Sheets.getSheet(CONFIG.SHEETS.ORDER_MAIN);
            menuCache = null; // 清除快取
            navigateTo('order-new');
        } catch (e) {
            showToast('讀取試算表資訊失敗：' + e.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    function onLogout() {
        currentPage = null;
        menuCache = null;
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    }

    function navigateTo(pageId) {
        if (!Auth.isLoggedIn()) return;
        // 隱藏所有頁面
        document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

        const pageEl = document.getElementById(`page-${pageId}`);
        const navBtn = document.querySelector(`.nav-btn[data-page="${pageId}"]`);

        if (pageEl) pageEl.classList.remove('hidden');
        if (navBtn) navBtn.classList.add('active');

        currentPage = pageId;
        // 呼叫對應模組的 init
        if (pages[pageId]) pages[pageId].init();
    }

    async function getMenu() {
        if (menuCache) return menuCache;
        const rows = await Sheets.getSheet(CONFIG.SHEETS.MENU);
        menuCache = rowsToObjects(rows);
        return menuCache;
    }

    function getSheetId(name) { return sheetIds[name]; }
    function clearMenuCache() { menuCache = null; }

    return { init, onLogin, onLogout, navigateTo, getMenu, getSheetId, clearMenuCache };
})();

document.addEventListener('DOMContentLoaded', App.init);
