// ==============================
// 模組四：營收統計
// ==============================

const Revenue = (() => {
    let menuData = [];

    function init() {
        const page = document.getElementById('page-revenue');
        page.innerHTML = `
        <div class="page-header">
            <h1 class="page-title">營收統計</h1>
        </div>
        <div class="card">
            <div class="filter-grid">
                <div class="form-group">
                    <label class="form-label">訂單日期起 <span class="required">*</span></label>
                    <input type="date" id="rv-from" class="form-control">
                </div>
                <div class="form-group">
                    <label class="form-label">訂單日期訖 <span class="required">*</span></label>
                    <input type="date" id="rv-to" class="form-control" value="${todayInputStr()}">
                </div>
                <div class="form-group">
                    <label class="form-label">商品大類</label>
                    <select id="rv-category" class="form-control" onchange="Revenue.onCategoryChange()">
                        <option value="">全部</option>
                        <option value="麵食">麵食</option>
                        <option value="小菜">小菜</option>
                        <option value="料理包">料理包</option>
                        <option value="滷味">滷味</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">單一品項</label>
                    <select id="rv-item" class="form-control">
                        <option value="">全部</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">顧客名稱</label>
                    <input type="text" id="rv-customer" class="form-control" placeholder="輸入顧客名稱">
                </div>
                <div class="form-group form-group-action">
                    <button class="btn btn-primary" onclick="Revenue.query()">🔍 查詢</button>
                </div>
            </div>
        </div>
        <div id="rv-result" class="hidden">
            <div class="stats-cards" id="rv-cards"></div>
            
            <div class="card card-full">
                <h2 class="card-title">各品項銷售與毛利分析</h2>
                <div class="table-wrap"><table class="data-table" id="rv-items-table">
                    <thead><tr><th>品項</th><th>分類</th><th class="text-right">銷售數量</th><th class="text-right">銷售金額</th><th class="text-right">預估成本</th><th class="text-right">預估毛利</th></tr></thead>
                    <tbody id="rv-items-body"></tbody>
                </table></div>
            </div>
            
            <div class="card card-full mt-16">
                <h2 class="card-title">各顧客消費</h2>
                <div class="table-wrap"><table class="data-table" id="rv-cust-table">
                    <thead><tr><th>顧客名稱</th><th class="text-right">訂單筆數</th><th class="text-right">消費金額</th></tr></thead>
                    <tbody id="rv-cust-body"></tbody>
                </table></div>
            </div>
        </div>`;

        loadMenuForFilter();
    }

    async function loadMenuForFilter() {
        try {
            menuData = await App.getMenu();
        } catch (e) { /* 靜默失敗 */ }
    }

    function onCategoryChange() {
        const cat = document.getElementById('rv-category').value;
        const itemSel = document.getElementById('rv-item');
        const items = cat ? menuData.filter(m => m['分類'] === cat) : menuData;
        itemSel.innerHTML = `<option value="">全部</option>` + items.map(m => `<option value="${m['菜名']}">${m['菜名']}</option>`).join('');
    }

    async function query() {
        const fromDate = document.getElementById('rv-from').value;
        const toDate = document.getElementById('rv-to').value;
        if (!fromDate || !toDate) { showToast('請輸入日期起訖（必填）', 'error'); return; }

        const catFilter = document.getElementById('rv-category').value;
        const itemFilter = document.getElementById('rv-item').value;
        const custFilter = document.getElementById('rv-customer').value.trim();

        showLoading(true);
        try {
            const [orderRows, scheduleRows] = await Promise.all([
                Sheets.getSheet(CONFIG.SHEETS.ORDER_MAIN),
                Sheets.getSheet(CONFIG.SHEETS.SCHEDULE)
            ]);
            const orders = rowsToObjects(orderRows);
            const schedule = rowsToObjects(scheduleRows);

            // 篩選日期範圍內的訂單
            const filteredOrders = orders.filter(o => {
                const d = toInputDate(o['訂單日期']);
                return d >= fromDate && d <= toDate;
            });
            const orderIds = new Set(filteredOrders.map(o => o['訂單編號']));

            // 篩選排單表（符合訂單ID範圍）
            let lines = schedule.filter(s => orderIds.has(s['訂單編號']));

            // 進一步篩選
            if (catFilter) {
                const itemsInCat = new Set(menuData.filter(m => m['分類'] === catFilter).map(m => m['菜名']));
                lines = lines.filter(s => itemsInCat.has(s['品項']));
            }
            if (itemFilter) lines = lines.filter(s => s['品項'] === itemFilter);
            if (custFilter) lines = lines.filter(s => s['客戶名稱']?.includes(custFilter));

            // 整體統計
            const totalOrders = new Set(lines.map(s => s['訂單編號'])).size;
            let totalRevenue = 0, collectedRevenue = 0;
            filteredOrders.forEach(o => {
                if (!orderIds.has(o['訂單編號'])) return;
                const amt = parseFloat(o['訂單金額']) || 0;
                // 若有篩選條件，需按品項比例計算（簡化：只計算符合品項的小計）
                totalRevenue += amt;
                if (o['收款日期']) collectedRevenue += amt;
            });

            // 若有品項篩選，改用排單表小計加總
            if (catFilter || itemFilter || custFilter) {
                totalRevenue = lines.reduce((sum, l) => sum + (parseFloat(l['小計價格']) || 0), 0);
                const filteredIds = new Set(lines.map(l => l['訂單編號']));
                collectedRevenue = filteredOrders
                    .filter(o => filteredIds.has(o['訂單編號']) && o['收款日期'])
                    .reduce((sum, o) => sum + (parseFloat(o['訂單金額']) || 0), 0);
            }

            // 品項統計
            const itemStats = {};
            lines.forEach(l => {
                const name = l['品項'];
                if (!itemStats[name]) {
                    const menuItem = menuData.find(m => m['菜名'] === name);
                    itemStats[name] = { qty: 0, amount: 0, category: menuItem?.['分類'] || '-' };
                }
                itemStats[name].qty += parseInt(l['訂購數量']) || 0;
                itemStats[name].amount += parseFloat(l['小計價格']) || 0;
            });

            // 顧客統計
            const custStats = {};
            lines.forEach(l => {
                const cust = l['客戶名稱'];
                if (!custStats[cust]) custStats[cust] = { orders: new Set(), amount: 0 };
                custStats[cust].orders.add(l['訂單編號']);
                custStats[cust].amount += parseFloat(l['小計價格']) || 0;
            });

            renderResult({ totalOrders, totalRevenue, collectedRevenue, itemStats, custStats });
        } catch (e) {
            showToast('查詢失敗：' + e.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    function renderResult({ totalOrders, totalRevenue, collectedRevenue, itemStats, custStats }) {
        document.getElementById('rv-result').classList.remove('hidden');

        // 統計卡片
        document.getElementById('rv-cards').innerHTML = `
            <div class="stat-card">
                <div class="stat-label">訂單數</div>
                <div class="stat-value">${totalOrders}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">總營收</div>
                <div class="stat-value">$${totalRevenue.toLocaleString('zh-TW')}</div>
            </div>
            <div class="stat-card stat-card-success">
                <div class="stat-label">已收款</div>
                <div class="stat-value">$${collectedRevenue.toLocaleString('zh-TW')}</div>
            </div>
            <div class="stat-card stat-card-warning">
                <div class="stat-label">未收款</div>
                <div class="stat-value">$${(totalRevenue - collectedRevenue).toLocaleString('zh-TW')}</div>
            </div>`;

        // 品項表
        const sortedItems = Object.entries(itemStats).sort((a, b) => b[1].amount - a[1].amount);
        document.getElementById('rv-items-body').innerHTML = sortedItems.map(([name, s]) => `
            <tr>
                <td>${name}</td>
                <td><span class="tag">${s.category}</span></td>
                <td class="text-right">${s.qty}</td>
                <td class="text-right fw-medium">${s.amount ? '$' + s.amount.toLocaleString('zh-TW') : '秤重'}</td>
            </tr>`).join('') || `<tr><td colspan="4" class="text-center text-secondary">無資料</td></tr>`;

        // 顧客表
        const sortedCust = Object.entries(custStats).sort((a, b) => b[1].amount - a[1].amount);
        document.getElementById('rv-cust-body').innerHTML = sortedCust.map(([name, s]) => `
            <tr>
                <td>${name}</td>
                <td class="text-right">${s.orders.size}</td>
                <td class="text-right fw-medium">$${s.amount.toLocaleString('zh-TW')}</td>
            </tr>`).join('') || `<tr><td colspan="3" class="text-center text-secondary">無資料</td></tr>`;
    }

    return { init, query, onCategoryChange };
})();
