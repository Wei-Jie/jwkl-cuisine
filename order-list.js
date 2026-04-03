// ==============================
// 模組二：排單管理
// ==============================

const OrderList = (() => {
    let allOrders = [];    // 訂單主檔
    let allSchedule = [];  // 排單表
    let queryResult = [];  // 查詢結果（訂單級）
    let currentDetailIdx = null; // 正在查看明細的訂單索引

    function init() {
        const page = document.getElementById('page-order-list');
        page.innerHTML = `
        <div class="page-header">
            <h1 class="page-title">排單管理</h1>
        </div>
        <div class="card">
            <div class="filter-grid">
                <div class="form-group">
                    <label class="form-label">訂單日期起</label>
                    <input type="date" id="ol-order-from" class="form-control">
                </div>
                <div class="form-group">
                    <label class="form-label">訂單日期訖</label>
                    <input type="date" id="ol-order-to" class="form-control">
                </div>
                <div class="form-group">
                    <label class="form-label">出貨日期起</label>
                    <input type="date" id="ol-ship-from" class="form-control">
                </div>
                <div class="form-group">
                    <label class="form-label">出貨日期訖</label>
                    <input type="date" id="ol-ship-to" class="form-control">
                </div>
                <div class="form-group">
                    <label class="form-label">排程狀態</label>
                    <select id="ol-status" class="form-control">
                        <option value="">全部</option>
                        <option value="待排程">待排程</option>
                        <option value="已完成">已完成</option>
                        <option value="已出貨">已出貨</option>
                    </select>
                </div>
                <div class="form-group form-group-action">
                    <button class="btn btn-primary" onclick="OrderList.query()">🔍 查詢</button>
                </div>
            </div>
        </div>
        <div id="ol-result-wrap" class="card hidden">
            <div class="card-header-row">
                <div class="result-info">
                    <label class="checkbox-label">
                        <input type="checkbox" id="ol-select-all" onchange="OrderList.toggleAll(this.checked)">
                        <span>全選</span>
                    </label>
                    <span id="ol-result-count" class="text-secondary text-sm"></span>
                </div>
                <button class="btn btn-primary" onclick="OrderList.saveChanges()">💾 儲存異動</button>
            </div>
            <div class="table-wrap">
                <table class="data-table" id="ol-table">
                    <thead>
                        <tr>
                            <th style="width:40px"></th>
                            <th>訂單編號</th>
                            <th>訂單日期</th>
                            <th>顧客姓名</th>
                            <th>訂單金額</th>
                            <th>排程狀態</th>
                            <th>收款日期</th>
                        </tr>
                    </thead>
                    <tbody id="ol-tbody"></tbody>
                </table>
            </div>
        </div>`;
    }

    async function query() {
        const orderFrom = document.getElementById('ol-order-from').value;
        const orderTo = document.getElementById('ol-order-to').value;
        const shipFrom = document.getElementById('ol-ship-from').value;
        const shipTo = document.getElementById('ol-ship-to').value;
        const statusFilter = document.getElementById('ol-status').value;

        showLoading(true);
        try {
            const [orderRows, scheduleRows] = await Promise.all([
                Sheets.getSheet(CONFIG.SHEETS.ORDER_MAIN),
                Sheets.getSheet(CONFIG.SHEETS.SCHEDULE)
            ]);
            allOrders = rowsToObjects(orderRows);
            allSchedule = rowsToObjects(scheduleRows);

            // 無日期條件但有超量風險時先檢查
            const hasDateFilter = orderFrom || orderTo || shipFrom || shipTo;

            // 篩選訂單主檔（依訂單日期）
            let orders = allOrders.filter(o => {
                const d = toInputDate(o['訂單日期']);
                if (orderFrom && d < orderFrom) return false;
                if (orderTo && d > orderTo) return false;
                return true;
            });

            // 若有出貨日篩選，從排單表篩出符合的訂單編號
            if (shipFrom || shipTo) {
                const matchIds = new Set(allSchedule
                    .filter(s => {
                        const d = toInputDate(s['預計出貨日期 (A)']);
                        if (!d) return false;
                        if (shipFrom && d < shipFrom) return false;
                        if (shipTo && d > shipTo) return false;
                        return true;
                    })
                    .map(s => s['訂單編號']));
                orders = orders.filter(o => matchIds.has(o['訂單編號']));
            }

            // 計算每筆訂單的整體排程狀態
            queryResult = orders.map(o => {
                const lines = allSchedule.filter(s => s['訂單編號'] === o['訂單編號']);
                const hasPending = lines.some(s => s['排程狀態'] === CONFIG.STATUS.PENDING);
                const allShipped = lines.length > 0 && lines.every(s => s['排程狀態'] === CONFIG.STATUS.SHIPPED);
                const computedStatus = hasPending ? CONFIG.STATUS.PENDING
                    : allShipped ? CONFIG.STATUS.SHIPPED
                    : CONFIG.STATUS.DONE;
                return { ...o, _computedStatus: computedStatus };
            });

            // 依排程狀態篩選
            if (statusFilter) {
                queryResult = queryResult.filter(o => o._computedStatus === statusFilter);
            }

            // 超量警示
            if (!hasDateFilter && queryResult.length > 100) {
                showToast(`查詢結果共 ${queryResult.length} 筆，超過100筆，建議加上日期條件縮小範圍`, 'warning');
            }

            renderTable();
        } catch (e) {
            showToast('查詢失敗：' + e.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    function renderTable() {
        const wrap = document.getElementById('ol-result-wrap');
        const tbody = document.getElementById('ol-tbody');
        const countEl = document.getElementById('ol-result-count');

        wrap.classList.remove('hidden');
        countEl.textContent = `共 ${queryResult.length} 筆`;
        document.getElementById('ol-select-all').checked = false;

        if (!queryResult.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-secondary">查無資料</td></tr>`;
            return;
        }

        tbody.innerHTML = queryResult.map((o, idx) => {
            const status = o._computedStatus;
            const isPending = status === CONFIG.STATUS.PENDING;
            const isShipped = status === CONFIG.STATUS.SHIPPED;

            let statusHtml;
            if (isPending) {
                statusHtml = `<select class="form-control form-control-sm status-select" data-idx="${idx}" disabled>
                    <option>待排程</option></select>`;
            } else if (isShipped) {
                statusHtml = `<select class="form-control form-control-sm status-select" data-idx="${idx}" disabled>
                    <option>已出貨</option></select>`;
            } else {
                statusHtml = `<select class="form-control form-control-sm status-select" data-idx="${idx}">
                    <option value="已完成" ${status === '已完成' ? 'selected' : ''}>已完成</option>
                    <option value="已出貨" ${status === '已出貨' ? 'selected' : ''}>已出貨</option>
                </select>`;
            }

            const payDate = toInputDate(o['收款日期'] || '');
            const badge = isPending ? 'badge-pending' : isShipped ? 'badge-shipped' : 'badge-done';

            return `<tr>
                <td><input type="checkbox" class="ol-cb" data-idx="${idx}"></td>
                <td class="fw-medium" style="display:flex;align-items:center;gap:4px">
                    ${o['訂單編號']}
                    <button class="btn-icon" onclick="OrderList.showDetail(${idx})" title="查看明細">📝</button>
                </td>
                <td>${o['訂單日期']}</td>
                <td>${o['顧客名稱']}</td>
                <td>${o['訂單金額'] ? '$' + Number(o['訂單金額']).toLocaleString('zh-TW') : '-'}</td>
                <td>${statusHtml}</td>
                <td><input type="date" class="form-control form-control-sm pay-date" data-idx="${idx}" value="${payDate}"></td>
            </tr>`;
        }).join('');
    }

    function toggleAll(checked) {
        document.querySelectorAll('.ol-cb').forEach(cb => cb.checked = checked);
    }

    async function saveChanges() {
        const checked = [...document.querySelectorAll('.ol-cb:checked')];
        if (!checked.length) { showToast('請先勾選要異動的訂單', 'error'); return; }

        const ok = await showConfirm(`確定要異動已勾選的 ${checked.length} 筆訂單資料嗎？`);
        if (!ok) return;

        showLoading(true);
        try {
            const updates = []; // { range, values }

            for (const cb of checked) {
                const idx = parseInt(cb.dataset.idx);
                const order = queryResult[idx];
                const orderId = order['訂單編號'];

                // 新排程狀態
                const statusEl = document.querySelector(`.status-select[data-idx="${idx}"]`);
                const newStatus = statusEl?.value || order._computedStatus;

                // 新收款日期
                const payEl = document.querySelector(`.pay-date[data-idx="${idx}"]`);
                const newPayDate = fromInputDate(payEl?.value || '');

                // 更新訂單主檔收款日期（E欄）
                const orderRow = order._rowIndex;
                updates.push({ range: `${CONFIG.SHEETS.ORDER_MAIN}!E${orderRow}`, values: [[newPayDate]] });

                // 更新排單表排程狀態（J欄）
                const scheduleLines = allSchedule.filter(s => s['訂單編號'] === orderId);
                for (const line of scheduleLines) {
                    // 只向前推進，不退回：待排程→已完成/已出貨；已完成→已出貨
                    const curStatus = line['排程狀態'];
                    let targetStatus = newStatus;
                    if (curStatus === CONFIG.STATUS.SHIPPED) targetStatus = CONFIG.STATUS.SHIPPED; // 不退回
                    if (curStatus === CONFIG.STATUS.DONE && targetStatus === CONFIG.STATUS.PENDING) targetStatus = CONFIG.STATUS.DONE;
                    updates.push({ range: `${CONFIG.SHEETS.SCHEDULE}!J${line._rowIndex}`, values: [[targetStatus]] });
                }
            }

            await Sheets.batchUpdate(updates);
            showToast('異動儲存成功！', 'success');
            query(); // 重新查詢
        } catch (e) {
            showToast('儲存失敗：' + e.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    function showDetail(idx) {
        currentDetailIdx = idx;
        const order = queryResult[idx];
        const orderId = order['訂單編號'];
        
        document.getElementById('od-modal-title').textContent = `訂單明細 - ${orderId} (${order['顧客名稱']})`;
        const tbody = document.getElementById('od-tbody');
        
        const lines = allSchedule.filter(s => s['訂單編號'] === orderId);
        
        if (!lines.length) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-secondary">無明細資料</td></tr>`;
        } else {
            tbody.innerHTML = lines.map((line, lineIdx) => {
                const status = line['排程狀態'];
                let statusHtml = '';
                if (status === '待排程') {
                    statusHtml = `<select class="form-control form-control-sm od-status" data-line-idx="${lineIdx}">
                        <option value="待排程" selected>待排程</option>
                        <option value="已完成">已完成</option>
                    </select>`;
                } else if (status === '已完成') {
                    statusHtml = `<select class="form-control form-control-sm od-status" data-line-idx="${lineIdx}">
                        <option value="已完成" selected>已完成</option>
                        <option value="已出貨">已出貨</option>
                    </select>`;
                } else if (status === '已出貨') {
                    statusHtml = `<select class="form-control form-control-sm od-status" data-line-idx="${lineIdx}" disabled>
                        <option value="已出貨" selected>已出貨</option>
                    </select>`;
                } else {
                    statusHtml = `<select class="form-control form-control-sm od-status" data-line-idx="${lineIdx}">
                        <option value="待排程" ${status==='待排程'?'selected':''}>待排程</option>
                        <option value="已完成" ${status==='已完成'?'selected':''}>已完成</option>
                        <option value="已出貨" ${status==='已出貨'?'selected':''}>已出貨</option>
                    </select>`;
                }

                return `<tr>
                    <td>${line['品項名稱'] || ''}</td>
                    <td>${line['數量'] || ''} ${line['單位'] || ''}</td>
                    <td><span class="text-secondary text-sm">${line['說明'] || ''}</span></td>
                    <td>${line['預計出貨日期 (A)'] || ''}</td>
                    <td>${statusHtml}</td>
                </tr>`;
            }).join('');
        }
        
        document.getElementById('orderDetailModal').classList.add('show');
    }

    function closeDetail() {
        currentDetailIdx = null;
        document.getElementById('orderDetailModal').classList.remove('show');
    }

    async function saveDetail() {
        if (currentDetailIdx === null) return;
        const order = queryResult[currentDetailIdx];
        const orderId = order['訂單編號'];
        const lines = allSchedule.filter(s => s['訂單編號'] === orderId);
        
        const selects = document.querySelectorAll('.od-status');
        const updates = [];
        
        selects.forEach(sel => {
            const lineIdx = parseInt(sel.dataset.lineIdx);
            const line = lines[lineIdx];
            const newStatus = sel.value;
            
            if (line['排程狀態'] !== newStatus) {
                updates.push({
                    range: `${CONFIG.SHEETS.SCHEDULE}!J${line._rowIndex}`,
                    values: [[newStatus]]
                });
            }
        });

        if (!updates.length) {
            closeDetail();
            return;
        }

        showLoading(true);
        try {
            await Sheets.batchUpdate(updates);
            showToast('明細狀態更新成功！', 'success');
            closeDetail();
            query(); // 重新整理外層畫面以反映變更
        } catch (e) {
            showToast('更新失敗：' + e.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    return { init, query, toggleAll, saveChanges, showDetail, closeDetail, saveDetail };
})();
