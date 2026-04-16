const GuestMenu = (() => {
    let menuData = [];
    let currentCategory = '全部';

    async function init() {
        showLoading(true);
        try {
            const rows = await Sheets.getSheet(CONFIG.SHEETS.MENU);
            menuData = rowsToObjects(rows);
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
            const price = m['單價'];
            const displayPrice = String(price).includes('*') ? '秤重計價' : `$${price}`;
            // 嘗試從分頁取得圖片網址，若無則顯示預設圖
            const imgUrl = m['圖片網址'] || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80';
            
            return `
                <div class="menu-card">
                    <img src="${imgUrl}" class="menu-img" alt="${m['菜名']}">
                    <div class="menu-content">
                        <span class="menu-cat">${m['分類']}</span>
                        <span class="menu-name">${m['菜名']}</span>
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
