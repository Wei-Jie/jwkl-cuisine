// ==============================
// 模組三：審核預約
// ==============================

const PendingOrders = (() => {
    let pendingData = [];
    let menuData = [];

    async function init() {
        try {
            menuData = await App.getMenu();
        } catch (e) { /* silent */ }
        
        const page = document.getElementById('page-pending-orders');
        page.innerHTML = `
            <div class="page-header">
                <h1 class="page-title">審核預約訂單</h1>
                <span class="text-secondary text-sm">此處為外部客戶提交之待審單項</span>
            </div>
            <div class="card" id="po-list-card">
                <div class="table-wrap">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>提交時間</th>
                                <th>預定日期</th>
                                <th>顧客名稱</th>
                                <th>聯繫方式</th>
                                <th>預估金額</th>
                                <th>品項明細</th>
                                <th style="width:180px">動作</th>
                            </tr>
                        </thead>
                        <tbody id="po-tbody"></tbody>
                    </table>
                </div>
            </div>
        `;
        query();
    }

    async function query() {
        showLoading(true);
        try {
            const rows = await Sheets.getSheet(CONFIG.SHEETS.PENDING);
            const all = rowsToObjects(rows);
            pendingData = all.filter(d => d['狀態'] === '待審核');
            renderTable();
        } catch (e) {
            showToast('預約單讀取失敗: ' + e.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    function renderTable() {
        const tbody = document.getElementById('po-tbody');
        if (!pendingData.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-secondary">目前沒有待審核的預約</td></tr>`;
            return;
        }

        tbody.innerHTML = pendingData.map((d, idx) => {
            let itemsHtml = '';
            try {
                const items = JSON.parse(d['品項明細'] || '[]');
                itemsHtml = items.map(it => `${it.name} x${it.qty}`).join('<br>');
            } catch(e) { itemsHtml = '解析錯誤'; }

            return `
                <tr>
                    <td class="text-sm">${d['提交時間']}</td>
                    <td>${d['訂單日期']}</td>
                    <td class="fw-medium">${d['顧客名稱']}</td>
                    <td class="text-secondary">${d['聯繫方式'] || '-'}</td>
                    <td class="fw-bold text-accent">$${d['總金額']}</td>
                    <td class="text-sm">${itemsHtml}</td>
                    <td>
                        <div style="display:flex;gap:8px">
                            <button class="btn btn-primary btn-sm" onclick="PendingOrders.approve(${idx})">✅ 核准</button>
                            <button class="btn btn-outline btn-sm" style="color:red" onclick="PendingOrders.reject(${idx})">✕ 拒絕</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    async function approve(idx) {
        const d = pendingData[idx];
        const ok = await showConfirm(`確定要核准 ${d['顧客名稱']} 的訂單嗎？\n核准後將正式轉入排單系統。`);
        if (!ok) return;

        showLoading(true);
        try {
            // 1. 產生正式訂單編號 (需先抓現有訂單算出最大號，這裡簡化處理或呼叫 App 邏輯)
            // 獲取現有訂單以生成 ID
            const orderRows = await Sheets.getSheet(CONFIG.SHEETS.ORDER_MAIN);
            const currentOrders = rowsToObjects(orderRows);
            const nextOrderId = generateOrderId(currentOrders.map(o => o['訂單編號']), d['訂單日期']);
            
            const items = JSON.parse(d['品項明細']);
            const scheduleItems = items.map(it => {
                const menuItem = menuData.find(m => m['菜名'] === it.name);
                const isWeight = menuItem && String(menuItem['單價']).includes('*');
                const unitPrice = menuItem ? (isWeight ? menuItem['單價'] : parseInt(menuItem['單價']) || 0) : 0;
                const subtotal = isWeight ? '' : unitPrice * parseFloat(it.qty);
                
                return [
                    generateUUID(),
                    nextOrderId,
                    d['訂單日期'],
                    d['顧客名稱'],
                    it.name,
                    d['訂單日期'], // 預設出貨日同訂單日
                    it.qty,
                    unitPrice,
                    subtotal,
                    d['備註'] || '',
                    CONFIG.STATUS.PENDING,
                    ''
                ];
            });

            // 2. 全部寫入
            await Promise.all([
                Sheets.appendRows(CONFIG.SHEETS.ORDER_MAIN, [[
                    generateUUID(),
                    nextOrderId,
                    d['訂單日期'],
                    d['總金額'],
                    d['顧客名稱'],
                    ''
                ]]),
                Sheets.appendRows(CONFIG.SHEETS.SCHEDULE, scheduleItems),
                // 3. 更新原預約單狀態
                Sheets.updateById(CONFIG.SHEETS.PENDING, d['ID'], [
                    d['ID'], d['提交時間'], d['訂單日期'], d['顧客名稱'], 
                    d['品項明細'], d['總金額'], d['備註'], '已轉正', d['聯繫方式']
                ])
            ]);

            showToast(`訂單 ${nextOrderId} 核准成功！`, 'success');
            query();
        } catch (e) {
            showToast('核准失敗: ' + e.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    async function reject(idx) {
        const d = pendingData[idx];
        const ok = await showConfirm('確定要刪除/拒絕此預約單嗎？');
        if (!ok) return;

        showLoading(true);
        try {
            await Sheets.batchDeleteById(CONFIG.SHEETS.PENDING, [d['ID']]);
            showToast('已刪除該預約選項', 'info');
            query();
        } catch (e) {
            showToast('刪除失敗: ' + e.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    return { init, query, approve, reject };
})();
