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
                <td class="fw-medium">
                    <div style="display:flex;align-items:center;gap:4px">
                        ${o['訂單編號']}
                        <button class="btn-icon" onclick="OrderList.showDetail(${idx})" title="查看明細">📝</button>
                    </div>
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
            const updates = []; // { sheet, data: { id, rowValues } }

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

                const orderHeaders = Object.keys(order).filter(k => !k.startsWith('_'));
                const orderRow = orderHeaders.map(k => {
                    if (k === '收款日期') return newPayDate;
                    return order[k] || '';
                });
                updates.push({ sheet: CONFIG.SHEETS.ORDER_MAIN, data: { id: order['ID'], rowValues: orderRow } });

                const scheduleLines = allSchedule.filter(s => s['訂單編號'] === orderId);
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
            if(line._deleted) return '';
            
            const status = line['排程狀態'] || '';
            const isPending = status === '待排程';
            
            // 尋找品項名稱與數量，考量各種標題可能性
            let name = '', qtyStr = '', note = '';
            Object.keys(line).forEach(k => {
                if (!name && (k.includes('品項'))) name = line[k];
                if (!qtyStr && (k.includes('數量'))) qtyStr = line[k];
                if (!note && (k.includes('說明') || k.includes('備註'))) note = line[k];
            });
            const qty = String(qtyStr).replace(/[^0-9.]/g, '') || '';
            const date = line['預計出貨日期 (A)'] || '';
            const isWeight = String(line._unitPriceStr || '').includes('*');

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
                    <option value="待排程" ${status==='待排程'?'selected':''}>待排程</option>
                    <option value="已完成" ${status==='已完成'?'selected':''}>已完成</option>
                    <option value="已出貨" ${status==='已出貨'?'selected':''}>已出貨</option>
                </select>`;
            }

            let trHtml = '';
            // 如果是待排程，可編輯
            if (isPending) {
                trHtml = `<tr>
                    <td>
                        <select class="form-control form-control-sm od-name" data-line-idx="${lineIdx}" onchange="OrderList.onItemChange(${lineIdx})">
                            ${buildItemOptions(name)}
                        </select>
                    </td>
                    <td><input type="number" class="form-control form-control-sm od-qty" data-line-idx="${lineIdx}" value="${qty}" onchange="OrderList.onQtyChange(${lineIdx})" min="1" placeholder="數量/g"></td>
                    <td><span class="od-price text-secondary" id="od-price-${lineIdx}">${isWeight ? line._unitPriceStr : '$' + (line._unitPrice || 0)}</span></td>
                    <td><span class="od-subtotal fw-medium" id="od-subtotal-${lineIdx}">$${line['小計價格'] || line['小計'] || 0}</span></td>
                    <td><input type="text" class="form-control form-control-sm od-note" data-line-idx="${lineIdx}" value="${note}" placeholder="說明"></td>
                    <td><input type="date" class="form-control form-control-sm od-date" data-line-idx="${lineIdx}" value="${toInputDate(date)}"></td>
                    <td>${statusHtml}</td>
                    <td><button class="btn-icon" onclick="OrderList.removeItem(${lineIdx})" title="刪除此列">✕</button></td>
                </tr>`;
            } else {
                trHtml = `<tr>
                    <td>${name}</td>
                    <td>${qty}</td>
                    <td><span class="text-secondary">${isWeight ? line._unitPriceStr : '$' + (line._unitPrice || 0)}</span></td>
                    <td><span class="od-subtotal fw-medium" id="od-subtotal-${lineIdx}" data-val="${line['小計價格'] || line['小計'] || 0}">$${line['小計價格'] || line['小計'] || 0}</span></td>
                    <td><span class="text-secondary text-sm">${note}</span></td>
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
            const menuItem = menuData.find(m => m['菜名'] === name);
            const isWeight = !!(menuItem && String(menuItem['單價']).includes('*'));
            const unitPrice = isWeight ? menuItem['單價'] : parseInt(menuItem?.['單價']) || 0;
            return {
                ...l,
                _unitPriceStr: menuItem?.['單價'],
                _unitPrice: unitPrice,
                _isWeight: isWeight
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
            '數量': '',
            '預計出貨日期 (A)': '',
            '說明': '',
            '排程狀態': '待排程',
            '小計': 0,
            _unitPrice: 0,
            _isNew: true
        });
        renderDetailTable();
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
        
        const qty = parseFloat(qtyEl?.value) || 0;
        
        if (line._isWeight) {
            priceEl.textContent = line._unitPriceStr;
            const trueUnitPrice = parseFloat(line._unitPriceStr) || 0;
            const sub = Math.round(trueUnitPrice * qty);
            line['小計'] = sub;
            subtotalEl.textContent = sub ? `$${sub.toLocaleString('zh-TW')}` : '-';
        } else {
            priceEl.textContent = `$${line._unitPrice || 0}`;
            const sub = (line._unitPrice || 0) * parseInt(qty);
            line['小計'] = sub;
            subtotalEl.textContent = sub ? `$${sub.toLocaleString('zh-TW')}` : '-';
        }
        updateDetailTotal();
    }

    function updateDetailTotal() {
        let total = 0;
        detailLines.forEach((l, idx) => {
            if(l._deleted) return;
            const isPending = l['排程狀態'] === '待排程';
            let sub = parseInt(l['小計']) || parseInt(l['小計價格']) || 0;
            const subEl = document.getElementById(`od-subtotal-${idx}`);
            if (subEl) {
                const valStr = subEl.dataset.val || subEl.textContent;
                const cleanVal = valStr.replace(/[$,\s]/g, '');
                if (!isNaN(parseInt(cleanVal))) sub = parseInt(cleanVal);
            }
            total += sub;
        });
        
        const totalEl = document.getElementById('od-total');
        if (totalEl) totalEl.textContent = `$${total.toLocaleString('zh-TW')}`;
        return total;
    }

    function closeDetail() {
        currentDetailIdx = null;
        detailLines = [];
        deletedRows = [];
        document.getElementById('orderDetailModal').classList.remove('show');
    }

    async function saveDetail() {
        if (currentDetailIdx === null) return;
        const order = queryResult[currentDetailIdx];
        const orderId = order['訂單編號'];
        
        const updates = [];
        const inserts = [];
        
        // 讀取畫面資料同步回細項
        document.querySelectorAll('.od-status').forEach(sel => {
            const idx = sel.dataset.lineIdx;
            const line = detailLines[idx];
            if(line._deleted) return;
            
            line['排程狀態'] = sel.value;
            const nameEl = document.querySelector(`.od-name[data-line-idx="${idx}"]`);
            if (nameEl) {
                line['品項名稱'] = nameEl.value;
                line['數量'] = document.querySelector(`.od-qty[data-line-idx="${idx}"]`)?.value ?? '';
                line['說明'] = document.querySelector(`.od-note[data-line-idx="${idx}"]`)?.value || '';
                line['預計出貨日期 (A)'] = fromInputDate(document.querySelector(`.od-date[data-line-idx="${idx}"]`)?.value || '');
            }
        });

        const newTotal = updateDetailTotal();

        detailLines.forEach(line => {
             if (line._deleted) return; 
             
             if (line._isNew) {
                 inserts.push([
                     generateUUID(), 
                     orderId, 
                     line['排單日期'] || order['訂單日期'], 
                     line['顧客名稱'] || order['顧客名稱'], 
                     line['品項名稱'],
                     line['預計出貨日期 (A)'], 
                     line['數量'], 
                     line._unitPriceStr || line._unitPrice || '', 
                     line['小計'] || '',
                     line['說明'] || '', 
                     line['排程狀態'], 
                     ''
                 ]);
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
                const orderRow = orderHeaders.map(k => k === '訂單金額' ? newTotal : order[k] || '');
                
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
            }
            closeDetail();
            query(); 
        } catch (e) {
            showToast('更新失敗：' + e.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    return { init, query, toggleAll, saveChanges, showDetail, closeDetail, saveDetail, addItem, removeItem, onItemChange, onQtyChange };
})();
