const GuestMenu = (() => {
    let menuData = [];
    let currentCategory = '全部';

    async function init() {
        showLoading(true);
        try {
            const rows = await Sheets.getSheet(CONFIG.SHEETS.MENU);
            const allMenu = rowsToObjects(rows);
            // 核心過濾：只顯示上架商品
            menuData = allMenu.filter(m => {
                const status = String(m['狀態'] || '上架').trim();
                return status === '上架';
            });
            renderCategories();
            renderMenu();
        } catch (e) {
            console.error(e);
            alert('無法載入菜單，請重新整理頁面。');
        } finally {
            showLoading(false);
        }
    }

    function renderCategories() {
        const nav = document.getElementById('cat-nav');
        const categories = ['全部', ...new Set(menuData.map(m => m['分類']))];

        nav.innerHTML = categories.map(cat => `
            <button class="cat-btn ${cat === currentCategory ? 'active' : ''}" 
                    onclick="GuestMenu.filter('${cat}')">${cat}</button>
        `).join('');
    }

    function filter(cat) {
        currentCategory = cat;
        renderCategories();
        renderMenu();
    }

    function renderMenu() {
        const grid = document.getElementById('menu-grid');
        const items = currentCategory === '全部'
            ? menuData : menuData.filter(m => m['分類'] === currentCategory);

        grid.innerHTML = items.map(m => {
            const name = m['菜名'];
            const price = m['單價'];
            const displayPrice = String(price).includes('*') ? '秤重計價' : `$${price}`;

            // 優先序：1. 試算表填好的網址 2. 本地 pic/菜名.jpg 3. 預設圖庫
            const localImg = `pic/${name}.jpg`;
            const spreadsheetImg = m['圖片網址'];
            const defaultImg = 'https://placehold.jp/24/2c3e50/ffffff/400x300.png?text=不好意思%0A圖片製作中';

            const finalImg = spreadsheetImg || localImg;

            return `
                <div class="menu-card">
                    <img src="${finalImg}" 
                         class="menu-img" 
                         alt="${name}" 
                         onerror="this.onerror=null;this.src='${defaultImg}';">
                    <div class="menu-content">
                        <span class="menu-cat">${m['分類']}</span>
                        <span class="menu-name">${name}</span>
                        <div class="menu-note">${m['備註'] || ''}</div>
                        <div class="menu-footer">
                            <span class="menu-price">${displayPrice}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    return { init, filter };
})();

document.addEventListener('DOMContentLoaded', GuestMenu.init);

// 覆蓋 utils.js 的 showLoading，因為客戶端沒有後台的 ID
function showLoading(visible) {
    const el = document.getElementById('loading');
    if (el) el.style.display = visible ? 'flex' : 'none';
}
