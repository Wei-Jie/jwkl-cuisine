// ==============================
// 模組二：排單管理
// ==============================

const OrderList = (() => {
    let allOrders = [];    // 訂單主檔
    let allSchedule = [];  // 排單表
    let queryResult = [];  // 查詢結果（訂單級）
    let currentDetailIdx = null; // 正在查看明細的訂單索引
    let menuData = [];
    let detailLines = [];
    let deletedRows = [];

    async function init() {
        try {
            menuData = await App.getMenu();
        } catch (e) { /* silent */ }
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
                            <th>聯絡方式</th>
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
                const allDoneOrShipped = lines.length > 0 && lines.every(s =>
                    s['排程狀態'] === CONFIG.STATUS.DONE || s['排程狀態'] === CONFIG.STATUS.SHIPPED
                );
                const anyDone = lines.some(s => s['排程狀態'] === CONFIG.STATUS.DONE);
                // 只有「全部已完成或已出貨，且至少有一個已完成」才算整體已完成
                const computedStatus = hasPending ? CONFIG.STATUS.PENDING
                    : allShipped ? CONFIG.STATUS.SHIPPED
                        : (allDoneOrShipped && anyDone) ? CONFIG.STATUS.DONE
                            : CONFIG.STATUS.PENDING;
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
            // 清理彙整表
            const existingSummary = document.getElementById('ol-summary-wrap');
            if (existingSummary) existingSummary.remove();
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
                <td class="fw-medium">
                    <div style="display:flex;align-items:center;gap:4px">
                        ${o['訂單編號']}
                        <button class="btn-icon" onclick="OrderList.showDetail(${idx})" title="查看明細">📝</button>
                    </div>
                </td>
                <td>${o['訂單日期']}</td>
                <td>${escapeHtml(o['顧客名稱'])}</td>
                <td>${o['電話'] ? '📞 ' + escapeHtml(o['電話']) + '<br>' : ''}
                    ${o['SNS'] ? '💬 ' + escapeHtml(o['SNS']) + '<br>' : ''}
                    ${o['Email'] ? '✉️ ' + escapeHtml(o['Email']) : ''}
                </td>
                <td>${formatAmount(o['訂單金額'] || '-')}</td>
                <td>${statusHtml}</td>
                <td><input type="date" class="form-control form-control-sm pay-date" data-idx="${idx}" value="${payDate}"></td>
            </tr>`;
        }).join('');

        renderSummaryTable();
    }

    function renderSummaryTable() {
        // 1. 移除舊有的彙整表
        const oldSummary = document.getElementById('ol-summary-wrap');
        if (oldSummary) oldSummary.remove();

        // 2. 彙整「待排程」的所有商品 (從全域 allSchedule 中，屬於目前查詢結果中訂單的項目)
        const currentOrderIds = new Set(queryResult.map(o => o['訂單編號']));
        const pendingSchedules = allSchedule.filter(s => 
            s['排程狀態'] === CONFIG.STATUS.PENDING && 
            currentOrderIds.has(s['訂單編號'])
        );

        if (!pendingSchedules.length) return;

        const summaryMap = {};
        pendingSchedules.forEach(s => {
            // 使用動態關鍵字偵測，優先找「品項」，避開通用的「名稱」以免誤抓顧客
            const name = getValueByKeyword(s, ['品項', '商品名稱']) || '';
            const rawQty = getValueByKeyword(s, ['數量', 'qty']) || 0;
            const qty = parseFloat(rawQty) || 0;
            if (name) {
                summaryMap[name] = (summaryMap[name] || 0) + qty;
            }
        });

        const sortedNames = Object.keys(summaryMap).sort();
        
        // 3. 建立彙整表格 UI
        const summaryWrap = document.createElement('div');
        summaryWrap.id = 'ol-summary-wrap';
        summaryWrap.className = 'mt-24';
        summaryWrap.innerHTML = `
            <div class="card-header-row" style="margin-bottom: 12px;">
                <h3 style="font-size: 1.1rem; color: var(--color-primary);">📊 待製作商品彙整 (待排程)</h3>
            </div>
            <div class="table-wrap">
                <table class="data-table" style="max-width: 500px;">
                    <thead style="background: var(--color-bg-alt);">
                        <tr>
                            <th style="text-align: left;">品項</th>
                            <th style="width: 150px; text-align: right;">待製作數量</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sortedNames.map(name => `
                            <tr>
                                <td class="fw-medium">${escapeHtml(name)}</td>
                                <td style="text-align: right; color: var(--color-accent); font-weight: bold;">
                                    ${summaryMap[name].toLocaleString('zh-TW')}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        document.getElementById('ol-result-wrap').appendChild(summaryWrap);
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
            const updates = []; // { sheet, data: { id, rowValues } }

            const emailPromises = [];

            for (const cb of checked) {
                const idx = parseInt(cb.dataset.idx);
                const order = queryResult[idx];
                const orderId = order['訂單編號'];

                // 新排程狀態
                const statusEl = document.querySelector(`.status-select[data-idx="${idx}"]`);
                const newStatus = statusEl?.value || order._computedStatus;
                
                const scheduleLines = allSchedule.filter(s => s['訂單編號'] === orderId);

                // 判斷是否由非完成狀態變成已完成，且有填信箱
                if (order._computedStatus !== '已完成' && order._computedStatus !== '已出貨' && newStatus === '已完成' && order['Email']) {
                    const itemsText = scheduleLines.map(s => {
                        const name = getValueByKeyword(s, ['品項', '商品名稱']);
                        const qty = getValueByKeyword(s, ['數量', 'qty']);
                        
                        // 判別是否為秤重商品
                        const menuItem = menuData.find(m => m['菜名'] === name);
                        const isWeight = menuItem && String(menuItem['單價']).includes('*');
                        const unit = isWeight ? '(g)' : '';
                        
                        return `✔️ ${name} x${qty}${unit}`;
                    }).join('<br>');
                    emailPromises.push(sendCompletionEmail(order, itemsText));
                }

                // 新收款日期
                const payEl = document.querySelector(`.pay-date[data-idx="${idx}"]`);
                const newPayDate = fromInputDate(payEl?.value || '');

                const orderHeaders = Object.keys(order).filter(k => !k.startsWith('_'));
                const orderRow = orderHeaders.map(k => {
                    if (k === '收款日期') return newPayDate;
                    return order[k] || '';
                });
                updates.push({ sheet: CONFIG.SHEETS.ORDER_MAIN, data: { id: order['ID'], rowValues: orderRow } });

                for (const line of scheduleLines) {
                    const curStatus = line['排程狀態'];
                    let targetStatus = newStatus;
                    if (curStatus === CONFIG.STATUS.SHIPPED) targetStatus = CONFIG.STATUS.SHIPPED;
                    if (curStatus === CONFIG.STATUS.DONE && targetStatus === CONFIG.STATUS.PENDING) targetStatus = CONFIG.STATUS.DONE;

                    const lineHeaders = Object.keys(line).filter(k => !k.startsWith('_'));
                    const lineRow = lineHeaders.map(k => {
                        if (k === '排程狀態') return targetStatus;
                        return line[k] || '';
                    });
                    updates.push({ sheet: CONFIG.SHEETS.SCHEDULE, data: { id: line['ID'], rowValues: lineRow } });
                }
            }

            const mainUpdates = updates.filter(u => u.sheet === CONFIG.SHEETS.ORDER_MAIN).map(u => u.data);
            const schedUpdates = updates.filter(u => u.sheet === CONFIG.SHEETS.SCHEDULE).map(u => u.data);

            const tasks = [];
            if (mainUpdates.length) tasks.push(Sheets.batchUpdateById(CONFIG.SHEETS.ORDER_MAIN, mainUpdates));
            if (schedUpdates.length) tasks.push(Sheets.batchUpdateById(CONFIG.SHEETS.SCHEDULE, schedUpdates));

            await Promise.all(tasks);
            if (emailPromises.length > 0) {
                await Promise.all(emailPromises);
            }

            showToast('異動儲存成功！', 'success');
            query(); // 重新查詢
        } catch (e) {
            showToast('儲存失敗：' + e.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    function buildItemOptions(selectedName = '') {
        const categories = [...new Set(menuData.map(m => m['分類']))];
        let opts = `<option value="">請選擇</option>`;
        categories.forEach(cat => {
            const items = menuData.filter(m => m['分類'] === cat);
            opts += `<optgroup label="${cat}">`;
            items.forEach(m => {
                const sel = m['菜名'] === selectedName ? 'selected' : '';
                opts += `<option value="${m['菜名']}" ${sel}>${m['菜名']}</option>`;
            });
            opts += `</optgroup>`;
        });
        return opts;
    }

    function renderDetailTable() {
        const tbody = document.getElementById('od-tbody');
        const visibleLines = detailLines.filter(l => !l._deleted);

        if (!visibleLines.length) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center text-secondary">無明細資料</td></tr>`;
            updateDetailTotal();
            return;
        }

        tbody.innerHTML = detailLines.map((line, lineIdx) => {
            if (line._deleted) return '';

            const status = line['排程狀態'] || '';
            const isPending = status === '待排程';

            // 尋找品項名稱與數量，考量各種標題可能性
            let name = '', qtyStr = '', note = '';
            Object.keys(line).forEach(k => {
                if (!name && (k.includes('品項'))) name = line[k];
                if (!qtyStr && (k.includes('數量'))) qtyStr = line[k];
                if (!note && (k.includes('說明') || k.includes('備註'))) note = line[k];
            });

            // 重要：初始化 _isWeight 與單價資訊，確保後續 onQtyChange 運算正確
            const menuItem = menuData.find(m => m['菜名'] === name);
            if (menuItem) {
                line._isWeight = String(menuItem['單價']).includes('*');
                line._unitPriceStr = menuItem['單價'];
                line._unitPrice = line._isWeight ? menuItem['單價'] : parseInt(menuItem['單價']) || 0;
            } else {
                line._isWeight = false;
                line._unitPrice = 0;
            }

            const qty = String(qtyStr).replace(/[^0-9.]/g, '') || '';
            const date = line['預計出貨日期 (A)'] || '';
            const isWeight = line._isWeight;

            let statusHtml = '';
            if (isPending) {
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
                    <option value="待排程" ${status === '待排程' ? 'selected' : ''}>待排程</option>
                    <option value="已完成" ${status === '已完成' ? 'selected' : ''}>已完成</option>
                    <option value="已出貨" ${status === '已出貨' ? 'selected' : ''}>已出貨</option>
                </select>`;
            }

            let trHtml = '';
            if (line._isDiscount) {
                const discountAmt = line['小計價格'] || line['小計'] || 0;
                trHtml = `<tr>
                    <td>
                        <span class="badge badge-pending" style="background:var(--color-danger);color:#fff;padding:2px 6px;border-radius:4px;font-size:0.8rem">折扣</span>
                        <input type="hidden" class="od-name" data-line-idx="${lineIdx}" value="折扣">
                    </td>
                    <td>1 <input type="hidden" class="od-qty" data-line-idx="${lineIdx}" value="1"></td>
                    <td><span class="text-secondary">-</span></td>
                    <td>
                        <input type="number" class="form-control form-control-sm" style="color:var(--color-danger); font-weight:bold" id="od-subtotal-${lineIdx}" data-line-idx="${lineIdx}" value="${discountAmt}" step="any" placeholder="減免金額" onchange="OrderList.onDiscountChange(${lineIdx})" ${status === '已出貨' ? 'disabled' : ''}>
                    </td>
                    <td><input type="text" class="form-control form-control-sm od-note" data-line-idx="${lineIdx}" value="${note}" placeholder="說明" ${status === '已出貨' ? 'disabled' : ''}></td>
                    <td><input type="date" class="form-control form-control-sm od-date" data-line-idx="${lineIdx}" value="${toInputDate(date)}" ${status === '已出貨' ? 'disabled' : ''}></td>
                    <td>${statusHtml}</td>
                    <td>${status === '已出貨' ? '<span class="text-secondary text-sm">🔒</span>' : `<button class="btn-icon" onclick="OrderList.removeItem(${lineIdx})" title="刪除此列">✕</button>`}</td>
                </tr>`;
            } else if (isPending) {
                trHtml = `<tr>
                    <td>
                        <select class="form-control form-control-sm od-name" data-line-idx="${lineIdx}" onchange="OrderList.onItemChange(${lineIdx})">
                            ${buildItemOptions(name)}
                        </select>
                    </td>
                    <td><input type="number" class="form-control form-control-sm od-qty" data-line-idx="${lineIdx}" value="${qty}" onchange="OrderList.onQtyChange(${lineIdx})" step="any" placeholder="公克或數量"></td>
                    <td><span class="od-price text-secondary" id="od-price-${lineIdx}">${isWeight ? line._unitPriceStr : '$' + (line._unitPrice || 0)}</span></td>
                    <td><span class="od-subtotal fw-medium" id="od-subtotal-${lineIdx}">$${line['小計價格'] || line['小計'] || 0}</span></td>
                    <td><input type="text" class="form-control form-control-sm od-note" data-line-idx="${lineIdx}" value="${note}" placeholder="說明"></td>
                    <td><input type="date" class="form-control form-control-sm od-date" data-line-idx="${lineIdx}" value="${toInputDate(date)}"></td>
                    <td>${statusHtml}</td>
                    <td><button class="btn-icon" onclick="OrderList.removeItem(${lineIdx})" title="刪除此列">✕</button></td>
                </tr>`;
            } else if (status === '已出貨') {
                // 已出貨：全部鎖死為純文字，不可修改
                trHtml = `<tr style="opacity:0.7;">
                    <td>${name}</td>
                    <td>${qty}</td>
                    <td><span class="text-secondary">${isWeight ? line._unitPriceStr : '$' + (line._unitPrice || 0)}</span></td>
                    <td id="od-subtotal-${lineIdx}" data-val="${line['小計價格'] || line['小計'] || 0}"><span class="fw-medium">$${line['小計價格'] || line['小計'] || 0}</span></td>
                    <td><span class="text-secondary text-sm">${note}</span></td>
                    <td>${date}</td>
                    <td>${statusHtml}</td>
                    <td><span class="text-secondary text-sm">🔒</span></td>
                </tr>`;
            } else {
                // 製作中 / 已完成：品項名稱唯讀，數量與小計可編輯
                trHtml = `<tr>
                    <td>${name}</td>
                    <td><input type="number" class="form-control form-control-sm od-qty" data-line-idx="${lineIdx}" value="${qty}" step="any" placeholder="公克或數量"></td>
                    <td><span class="text-secondary">${isWeight ? line._unitPriceStr : '$' + (line._unitPrice || 0)}</span></td>
                    <td><input type="number" class="form-control form-control-sm" id="od-subtotal-${lineIdx}" data-line-idx="${lineIdx}" data-val="${line['小計價格'] || line['小計'] || 0}" value="${line['小計價格'] || line['小計'] || 0}" step="any" placeholder="小計金額"></td>
                    <td><input type="text" class="form-control form-control-sm od-note" data-line-idx="${lineIdx}" value="${note}" placeholder="說明"></td>
                    <td>${date}</td>
                    <td>${statusHtml}</td>
                    <td></td>
                </tr>`;
            }
            return trHtml;
        }).join('');

        updateDetailTotal();
    }

    function showDetail(idx) {
        currentDetailIdx = idx;
        const order = queryResult[idx];
        const orderId = order['訂單編號'];
        deletedRows = [];

        document.getElementById('od-modal-title').textContent = `訂單明細 - ${orderId} (${order['顧客名稱']})`;

        const originalLines = allSchedule.filter(s => s['訂單編號'] === orderId);
        detailLines = originalLines.map(l => {
            const name = l['品項'] || l['品項名稱'] || '';
            const cat = l['類別'] || '';
            const isDiscount = cat === '減免金額' || name === '折扣';
            const menuItem = menuData.find(m => m['菜名'] === name);
            const isWeight = !!(menuItem && String(menuItem['單價']).includes('*'));
            const unitPrice = isWeight ? menuItem['單價'] : parseInt(menuItem?.['單價']) || 0;
            return {
                ...l,
                _unitPriceStr: menuItem?.['單價'],
                _unitPrice: unitPrice,
                _isWeight: isWeight,
                _isDiscount: isDiscount
            };
        });

        renderDetailTable();
        document.getElementById('orderDetailModal').classList.add('show');
    }

    function addItem() {
        if (currentDetailIdx === null) return;
        const order = queryResult[currentDetailIdx];

        detailLines.push({
            '訂單編號': order['訂單編號'],
            '排單日期': order['訂單日期'],
            '顧客名稱': order['顧客名稱'],
            '品項名稱': '',
            '數量': 1,
            '預計出貨日期 (A)': '',
            '說明': '',
            '排程狀態': '待排程',
            '小計': 0,
            _unitPrice: 0,
            _isNew: true
        });
        renderDetailTable();
    }

    function addDiscount() {
        if (currentDetailIdx === null) return;
        const order = queryResult[currentDetailIdx];

        detailLines.push({
            '訂單編號': order['訂單編號'],
            '排單日期': order['訂單日期'],
            '顧客名稱': order['顧客名稱'],
            '品項名稱': '折扣',
            '數量': 1,
            '預計出貨日期 (A)': '',
            '說明': '',
            '排程狀態': '待排程',
            '小計': 0,
            '類別': '減免金額',
            _unitPrice: 0,
            _isNew: true,
            _isDiscount: true
        });
        renderDetailTable();
    }

    function onDiscountChange(lineIdx) {
        const subtotalEl = document.getElementById(`od-subtotal-${lineIdx}`);
        if (!subtotalEl) return;
        
        let val = parseFloat(subtotalEl.value) || 0;
        if (val > 0) val = -val; // 自動轉為負數
        subtotalEl.value = val;
        
        const line = detailLines[lineIdx];
        const subtotalKey = Object.keys(line).find(k => !k.startsWith('_') && k.includes('小計')) || '小計價格';
        line[subtotalKey] = val;
        
        updateDetailTotal();
    }

    function removeItem(lineIdx) {
        const line = detailLines[lineIdx];
        line._deleted = true;
        if (line['ID']) {
            deletedRows.push(line['ID']);
        }
        renderDetailTable();
    }

    function onItemChange(lineIdx) {
        const line = detailLines[lineIdx];
        const nameEl = document.querySelector(`.od-name[data-line-idx="${lineIdx}"]`);
        const name = nameEl.value;
        const menuItem = menuData.find(m => m['菜名'] === name);

        if (!menuItem) {
            line._unitPrice = 0;
            line._isWeight = false;
            line['小計'] = 0;
        } else {
            const isWeight = String(menuItem['單價']).includes('*');
            line._isWeight = isWeight;
            line._unitPriceStr = menuItem['單價'];
            line._unitPrice = isWeight ? menuItem['單價'] : parseInt(menuItem['單價']) || 0;
        }

        updateDetailSubtotal(lineIdx);
    }

    function onQtyChange(lineIdx) {
        updateDetailSubtotal(lineIdx);
    }

    function updateDetailSubtotal(lineIdx) {
        const line = detailLines[lineIdx];
        const qtyEl = document.querySelector(`.od-qty[data-line-idx="${lineIdx}"]`);
        const priceEl = document.getElementById(`od-price-${lineIdx}`);
        const subtotalEl = document.getElementById(`od-subtotal-${lineIdx}`);

        // 動態找出 line 中真正的小計欄位名稱（可能是「小計」或「小計價格」）
        const subtotalKey = Object.keys(line).find(k => !k.startsWith('_') && k.includes('小計')) || '小計價格';

        const qty = parseFloat(qtyEl?.value) || 0;

        let sub = 0;
        if (line._isWeight) {
            if (priceEl) priceEl.textContent = line._unitPriceStr;
            const trueUnitPrice = parseFloat(line._unitPriceStr) || 0;
            sub = Math.round(trueUnitPrice * qty);
        } else {
            if (priceEl) priceEl.textContent = `$${line._unitPrice || 0}`;
            sub = (line._unitPrice || 0) * parseInt(qty);
        }

        // 更新到正確的 key
        line[subtotalKey] = sub;

        // 更新畫面：待排程是 span，非待排程是 input
        if (subtotalEl) {
            if (subtotalEl.tagName === 'INPUT') {
                subtotalEl.value = sub || '';
            } else {
                subtotalEl.textContent = sub ? `$${sub.toLocaleString('zh-TW')}` : '-';
            }
        }
        updateDetailTotal();
    }

    function updateDetailTotal() {
        let total = 0;
        detailLines.forEach((l, idx) => {
            if (l._deleted) return;
            
            let sub = 0;
            const subEl = document.getElementById(`od-subtotal-${idx}`);
            if (subEl) {
                const rawVal = subEl.value !== undefined && subEl.tagName === 'INPUT'
                    ? subEl.value
                    : (subEl.dataset.val || subEl.textContent);
                const cleanVal = String(rawVal).replace(/[$,\s]/g, '');
                sub = parseFloat(cleanVal) || 0;
            } else {
                // 回報物件中的小計值
                const val = getValueByKeyword(l, ['小計', '價格']);
                sub = parseFloat(String(val).replace(/[$,\s]/g, '')) || 0;
            }
            total += sub;
        });

        if (total < 0) {
            showToast('警告：折扣後金額小於 0，已自動調整為 0', 'warning');
            total = 0;
        }

        const totalEl = document.getElementById('od-total');
        if (totalEl) {
            totalEl.textContent = `$${Math.round(total).toLocaleString('zh-TW')}`;
        }
        return total;
    }

    function closeDetail() {
        currentDetailIdx = null;
        detailLines = [];
        deletedRows = [];
        document.getElementById('orderDetailModal').classList.remove('show');
    }

    async function sendCompletionEmail(order, itemsText) {
        if (!order['Email']) return;
        const htmlBody = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
                <h2 style="color: #27ae60;">【小灶私廚】訂單製作完成通知 🎉</h2>
                <p>親愛的 <strong>${order['顧客名稱']}</strong> 您好，</p>
                <p>這是一封系統自動發送的信件，您的專屬訂單 <strong>${order['訂單編號']}</strong> 已經全部製作完成！可以跟我們聯繫安排取貨囉！</p>
                <hr style="border:0; border-top: 2px dashed #eee; margin:20px 0;">
                <p><strong>製作完成品項：</strong><br>
                ${itemsText}
                </p>
                <p style="font-size: 1.1rem; color: #e67e22; font-weight: bold; border-top: 1px solid #eee; padding-top: 10px;">
                    💰 訂單總金額：${formatAmount(order['訂單金額'])}
                </p>
                <hr style="border:0; border-top: 2px dashed #eee; margin:20px 0;">
                <p>接下來煩請您透過我們先前聯繫的管道（Instagram / LINE 或電話），與老闆確認最終的交貨與付款事宜。</p>
                <p>感謝您的耐心等候，希望您會喜歡這次為您悉心準備的美味！</p>
                <div style="text-align: center; margin-top: 30px; margin-bottom: 30px;">
                    <a href="https://www.instagram.com/jwkl_cuisine?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==" target="_blank" style="display:inline-block; padding:14px 28px; background:#e67e22; color:#fff; text-decoration:none; border-radius:8px; font-weight:bold; font-size:1.1rem; box-shadow: 0 4px 6px rgba(230,126,34,0.3);">👉 點我聯絡 小灶私廚 IG</a>
                </div>
                <p style="font-size: 0.8em; color: #aaa; text-align: center;">※本信件為系統自動發送，請勿直接回覆此信箱。※</p>
            </div>
        `;
        return Sheets.requestGAS({
            action: 'SEND_EMAIL',
            to: order['Email'],
            subject: `【小灶私廚】訂單製作完成約取通知 (${order['訂單編號']})`,
            htmlBody: htmlBody
        }).catch(err => console.error('發送完成信件失敗：', err));
    }

    async function saveDetail() {
        if (currentDetailIdx === null) return;
        const order = queryResult[currentDetailIdx];
        const orderId = order['訂單編號'];

        const updates = [];
        const inserts = [];
        
        let isNowCompleted = true;

        // 讀取畫面資料同步回細項
        document.querySelectorAll('.od-status').forEach(sel => {
            const idx = sel.dataset.lineIdx;
            const line = detailLines[idx];
            if (line._deleted) return;

            line['排程狀態'] = sel.value;

            // 動態找出排單表中實際使用的欄位名稱（可能是「數量」或「訂購數量」）
            const qtyKey = Object.keys(line).find(k => !k.startsWith('_') && k.includes('數量') && !k.includes('排')) || '數量';
            const subtotalKey = Object.keys(line).find(k => !k.startsWith('_') && k.includes('小計')) || '小計價格';
            const noteKey = Object.keys(line).find(k => !k.startsWith('_') && (k.includes('說明') || k.includes('備註'))) || '說明';
            const nameKey = Object.keys(line).find(k => !k.startsWith('_') && k.includes('品項')) || '品項名稱';

            // 數量：所有狀態的列都有 od-qty input
            const qtyEl = document.querySelector(`.od-qty[data-line-idx="${idx}"]`);
            if (qtyEl) line[qtyKey] = qtyEl.value;

            // 說明、日期
            const noteEl = document.querySelector(`.od-note[data-line-idx="${idx}"]`);
            if (noteEl) line[noteKey] = noteEl.value;
            const dateEl = document.querySelector(`.od-date[data-line-idx="${idx}"]`);
            if (dateEl) line['預計出貨日期 (A)'] = fromInputDate(dateEl.value || '');

            // 品項名稱：只有待排程的列有 od-name 下拉選單
            const nameEl = document.querySelector(`.od-name[data-line-idx="${idx}"]`);
            if (nameEl) line[nameKey] = nameEl.value;

            // 小計：非待排程的列改用 input#od-subtotal-N 讀取
            const subtotalEl = document.getElementById(`od-subtotal-${idx}`);
            if (subtotalEl && subtotalEl.tagName === 'INPUT') {
                const sv = parseFloat(subtotalEl.value);
                if (!isNaN(sv)) {
                    line[subtotalKey] = sv;
                }
            }

            if (sel.value !== '已完成' && sel.value !== '已出貨') {
                isNowCompleted = false;
            }
        });

        const newTotal = updateDetailTotal();

        detailLines.forEach(line => {
            if (line._deleted) return;

            if (line._isNew) {
                const fallbackHeaders = ['ID', '訂單編號', '排單日期', '顧客名稱', '品項名稱', '預計出貨日期 (A)', '數量', '單價', '小計', '說明', '排程狀態', '類別'];
                const headers = (allSchedule.length > 0) ? Object.keys(allSchedule[0]).filter(k => !k.startsWith('_')) : fallbackHeaders;
                
                const newRow = headers.map(k => {
                    if (k === 'ID') return generateUUID();
                    if (k === '訂單編號') return orderId;
                    if (k.includes('日期') && !k.includes('預計')) return line['排單日期'] || order['訂單日期'];
                    if (k.includes('姓名') || k.includes('顧客') || k.includes('客戶')) return line['顧客名稱'] || order['顧客名稱'];
                    if (k.includes('品項') || k.includes('商品名稱')) return line['品項名稱'];
                    if (k.includes('預計出貨') || k === '預計出貨日' || k === '出貨日' || k.includes('出貨日期')) return line['預計出貨日期 (A)'];
                    if (k.includes('數量') && !k.includes('訂單')) return line['數量'];
                    if (k.includes('單價')) {
                        if (line._isDiscount) return '-';
                        return line._unitPriceStr !== undefined && line._unitPriceStr !== '' ? line._unitPriceStr : (line._unitPrice !== undefined && line._unitPrice !== 0 ? line._unitPrice : '');
                    }
                    if (k.includes('小計') || k.includes('價格')) return line['小計'] || '';
                    if (k.includes('說明') || k.includes('備註')) return line['說明'] || '';
                    if (k.includes('狀態') || k.includes('排程') || k.includes('製作')) return line['排程狀態'];
                    if (k.includes('類別')) return line['類別'] || (line._isDiscount ? '減免金額' : '產品');
                    return line[k] || '';
                });
                inserts.push(newRow);
            } else {
                const lineHeaders = Object.keys(line).filter(k => !k.startsWith('_'));
                const lineRow = lineHeaders.map(k => line[k]);
                updates.push({ id: line['ID'], rowValues: lineRow });
            }
        });

        const remainingItemsCount = updates.length + inserts.length;

        showLoading(true);
        try {
            if (remainingItemsCount === 0) {
                // 所有明細都被刪除，連帶刪除整筆訂單主檔
                await Sheets.batchDeleteById(CONFIG.SHEETS.ORDER_MAIN, [order['ID']]);
                if (deletedRows.length) {
                    await Sheets.batchDeleteById(CONFIG.SHEETS.SCHEDULE, deletedRows);
                }
                showToast('所有明細均已刪除，該訂單已被移除', 'success');
            } else {
                const orderHeaders = Object.keys(order).filter(k => !k.startsWith('_'));
                // 修正：動態匹配「金額」關鍵字，不再寫死字串
                const orderRow = orderHeaders.map(k => k.includes('金額') ? newTotal : order[k] || '');

                const tasks = [
                    Sheets.updateById(CONFIG.SHEETS.ORDER_MAIN, order['ID'], orderRow)
                ];

                if (updates.length) tasks.push(Sheets.batchUpdateById(CONFIG.SHEETS.SCHEDULE, updates));
                if (inserts.length) tasks.push(Sheets.appendRows(CONFIG.SHEETS.SCHEDULE, inserts));
                if (deletedRows.length) {
                    tasks.push(Sheets.batchDeleteById(CONFIG.SHEETS.SCHEDULE, deletedRows));
                }

                await Promise.all(tasks);
                showToast('明細更新成功！總金額已同步', 'success');

                // 重要：在發信前，將最新計算的總金額同步回 order 物件
                order['訂單金額'] = newTotal;

                const wasCompleted = order._computedStatus === '已完成' || order._computedStatus === '已出貨';
                if (!wasCompleted && isNowCompleted && order['Email']) {
                    const itemsText = detailLines.filter(l => !l._deleted).map(l => {
                        const name = getValueByKeyword(l, ['品項', '商品名稱']);
                        const qty = getValueByKeyword(l, ['數量', 'qty']);
                        
                        // 判別是否為秤重商品
                        const menuItem = menuData.find(m => m['菜名'] === name);
                        const isWeight = menuItem && String(menuItem['單價']).includes('*');
                        const unit = isWeight ? '(g)' : '';
                        
                        return `✔️ ${name} x${qty}${unit}`;
                    }).join('<br>');
                    await sendCompletionEmail(order, itemsText);
                }
            }
            closeDetail();
            query();
        } catch (e) {
            showToast('更新失敗：' + e.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    return { init, query, toggleAll, saveChanges, showDetail, closeDetail, saveDetail, addItem, addDiscount, removeItem, onItemChange, onQtyChange, onDiscountChange };
})();
