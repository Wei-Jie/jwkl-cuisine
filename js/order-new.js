// ==============================
// 模組一：新增訂單
// ==============================

const OrderNew = (() => {
    let menuData = [];
    let itemCount = 0;

    async function init() {
        showLoading(true);
        try {
            const allMenu = await App.getMenu();
            // 核心過濾：後台新增訂單也只顯示上架商品
            menuData = allMenu.filter(m => {
                const status = String(m['狀態'] || '上架').trim();
                return status === '上架';
            });
            renderPage();
        } catch (e) {
            showToast('載入菜單失敗：' + e.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    async function renderPage() {
        const page = document.getElementById('page-order-new');

        // 取得今日已有的訂單編號，產生新編號 (需同時檢查主檔與預約單)
        let newOrderId = '';
        try {
            const [mainRows, pendingRows] = await Promise.all([
                Sheets.getSheet(CONFIG.SHEETS.ORDER_MAIN),
                Sheets.getSheet(CONFIG.SHEETS.PENDING)
            ]);

            const mainIds = rowsToObjects(mainRows).map(o => o['訂單編號'] || o['編號']);
            const pendingIds = rowsToObjects(pendingRows).map(o => o['訂單編號'] || o['編號']);

            const allIds = [...new Set([...mainIds, ...pendingIds])];
            newOrderId = generateOrderId(allIds);
        } catch (e) {
            console.error('取單號失敗:', e);
            newOrderId = generateOrderId([]);
        }

        page.innerHTML = `
        <div class="page-header">
            <h1 class="page-title">新增訂單</h1>
        </div>
        <div class="card">
            <div class="form-row-3">
                <div class="form-group">
                    <label class="form-label">訂單日期</label>
                    <input type="date" id="on-date" class="form-control" value="${todayInputStr()}" readonly>
                </div>
                <div class="form-group">
                    <label class="form-label">訂單編號</label>
                    <input type="text" id="on-id" class="form-control" value="${newOrderId}" readonly>
                </div>
                <div class="form-group">
                    <label class="form-label">顧客名稱 *</label>
                    <input type="text" id="on-customer" class="form-control" placeholder="請輸入顧客名稱">
                </div>
                <div class="form-group">
                    <label class="form-label">聯絡電話</label>
                    <input type="text" id="on-phone" class="form-control" placeholder="0912...">
                </div>
                <div class="form-group">
                    <label class="form-label">SNS (LINE/IG)</label>
                    <input type="text" id="on-sns" class="form-control" placeholder="帳號或ID">
                </div>
                <div class="form-group">
                    <label class="form-label">Email</label>
                    <input type="email" id="on-email" class="form-control" placeholder="信箱">
                </div>
            </div>
            <div class="form-row-1">
                <div class="form-group">
                    <label class="form-label">預計出貨日（選填）</label>
                    <input type="date" id="on-ship-date" class="form-control" style="max-width:200px">
                </div>
            </div>
        </div>

        <div class="card">
            <div class="card-header-row">
                <h2 class="card-title">品項清單</h2>
                <button class="btn btn-ghost btn-sm" id="on-clear-all" onclick="OrderNew.clearAll()">
                    <span class="icon">🗑</span> 清空全部
                </button>
            </div>
            <div class="items-table-wrap">
                <table class="items-table" id="on-items-table">
                    <thead>
                        <tr>
                            <th style="width:30%">品項</th>
                            <th style="width:10%">數量</th>
                            <th style="width:10%">單價</th>
                            <th style="width:10%">小計</th>
                            <th style="width:30%">說明</th>
                            <th style="width:5%"></th>
                        </tr>
                    </thead>
                    <tbody id="on-items-body"></tbody>
                </table>
            </div>
            <button class="btn btn-outline btn-sm mt-12" onclick="OrderNew.addItem()">
                ＋ 新增品項
            </button>
        </div>

        <div class="card">
            <div class="total-row">
                <span class="total-label">訂單總金額</span>
                <span class="total-amount" id="on-total">$0</span>
            </div>
            <div class="action-row">
                <button class="btn btn-secondary" onclick="OrderNew.resetForm()">重設</button>
                <button class="btn btn-primary" onclick="OrderNew.save()">💾 儲存訂單</button>
            </div>
        </div>`;

        itemCount = 0;
        addItem(); // 預設一個空品項列
    }

    function buildItemOptions(selectedName = '') {
        const categories = [...new Set(menuData.map(m => m['分類']))];
        let opts = `<option value="">請選擇品項</option>`;
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

    function addItem(itemData = null) {
        itemCount++;
        const id = itemCount;
        const tbody = document.getElementById('on-items-body');
        if (!tbody) return;

        const tr = document.createElement('tr');
        tr.id = `on-item-${id}`;
        tr.innerHTML = `
            <td>
                <select class="form-control form-control-sm" id="on-item-name-${id}" onchange="OrderNew.onItemChange(${id})">
                    ${buildItemOptions(itemData?.name || '')}
                </select>
            </td>
            <td>
                <input type="number" class="form-control form-control-sm" id="on-item-qty-${id}" onchange="OrderNew.onQtyChange(${id})" min="1" step="any" placeholder="公克或數量">
            </td>
            <td><span id="on-item-price-${id}" class="text-secondary">-</span></td>
            <td><span id="on-item-subtotal-${id}" class="fw-medium">-</span></td>
            <td><span id="on-item-note-${id}" class="text-secondary text-sm"></span></td>
            <td>
                <button class="btn-icon" onclick="OrderNew.removeItem(${id})" title="刪除此列">✕</button>
            </td>`;
        tbody.appendChild(tr);

        if (itemData?.name) {
            onItemChange(id, itemData.qty);
        }
    }

    function onItemChange(id, presetQty = null) {
        const nameEl = document.getElementById(`on-item-name-${id}`);
        const qtyEl = document.getElementById(`on-item-qty-${id}`);
        const priceEl = document.getElementById(`on-item-price-${id}`);
        const noteEl = document.getElementById(`on-item-note-${id}`);

        const name = nameEl.value;
        const menuItem = menuData.find(m => m['菜名'] === name);

        if (!menuItem) {
            qtyEl.innerHTML = '<option value="">-</option>';
            priceEl.textContent = '-';
            noteEl.textContent = '';
            updateSubtotal(id);
            return;
        }

        const minQty = parseFloat(menuItem['最小訂購數量']) || 1;
        const isWeight = String(menuItem['單價']).includes('*');
        const price = isWeight ? menuItem['單價'] : parseFloat(menuItem['單價'].toString().replace(/[^0-9.]/g, '')) || 0;

        // 直接設定初始數量值
        qtyEl.value = presetQty || minQty;

        priceEl.textContent = isWeight ? '秤重計價' : `$${price}`;
        noteEl.textContent = menuItem['備註'] || '';

        updateSubtotal(id);
        updateTotal();
    }

    function onQtyChange(id) {
        updateSubtotal(id);
        updateTotal();
    }

    function updateSubtotal(id) {
        const nameEl = document.getElementById(`on-item-name-${id}`);
        const qtyEl = document.getElementById(`on-item-qty-${id}`);
        const subtotalEl = document.getElementById(`on-item-subtotal-${id}`);

        const name = nameEl?.value;
        const qty = parseFloat(qtyEl?.value) || 0;
        const menuItem = menuData.find(m => m['菜名'] === name);

        if (!menuItem || !qty) { if (subtotalEl) subtotalEl.textContent = '-'; return; }

        const isWeight = String(menuItem['單價']).includes('*');
        if (isWeight) {
            subtotalEl.textContent = '秤重後計算';
        } else {
            const price = parseInt(menuItem['單價']) || 0;
            subtotalEl.textContent = `$${(price * qty).toLocaleString('zh-TW')}`;
        }
    }

    function updateTotal() {
        let total = 0;
        document.querySelectorAll('[id^="on-item-subtotal-"]').forEach(el => {
            const val = el.textContent.replace(/[$,]/g, '');
            const n = parseInt(val);
            if (!isNaN(n)) total += n;
        });
        const totalEl = document.getElementById('on-total');
        if (totalEl) totalEl.textContent = `$${total.toLocaleString('zh-TW')}`;
    }

    function removeItem(id) {
        const tr = document.getElementById(`on-item-${id}`);
        if (tr) tr.remove();
        updateTotal();
    }

    function clearAll() {
        const tbody = document.getElementById('on-items-body');
        if (tbody) tbody.innerHTML = '';
        updateTotal();
    }

    function resetForm() { renderPage(); }

    async function save() {
        const customer = document.getElementById('on-customer')?.value?.trim();
        const phoneInput = document.getElementById('on-phone')?.value?.trim() || '';
        const sns = document.getElementById('on-sns')?.value?.trim() || '';
        const email = document.getElementById('on-email')?.value?.trim() || '';

        if (!customer) { showToast('請輸入顧客名稱', 'error'); return; }

        const phone = phoneInput.startsWith('0') ? "'" + phoneInput : phoneInput;
        const orderId = document.getElementById('on-id')?.value;
        const orderDateVal = document.getElementById('on-date')?.value;
        const orderDate = fromInputDate(orderDateVal);
        const shipDate = fromInputDate(document.getElementById('on-ship-date')?.value || '');

        // 收集品項
        const items = [];
        let total = 0;
        document.querySelectorAll('[id^="on-item-name-"]').forEach(nameEl => {
            const id = nameEl.id.replace('on-item-name-', '');
            const name = nameEl.value;
            const qty = parseInt(document.getElementById(`on-item-qty-${id}`)?.value) || 0;
            if (!name || !qty) return;

            const menuItem = menuData.find(m => m['菜名'] === name);
            if (!menuItem) return;

            const isWeight = String(menuItem['單價']).includes('*');
            const unitPrice = isWeight ? menuItem['單價'] : parseInt(menuItem['單價']) || 0;
            const subtotal = isWeight ? '' : unitPrice * qty;
            if (!isWeight) total += subtotal;

            items.push([
                generateUUID(), orderId, orderDate, customer, name,
                shipDate, qty, unitPrice, subtotal || '',
                '', CONFIG.STATUS.PENDING, ''
            ]);
        });

        if (!items.length) { showToast('請至少新增一個品項', 'error'); return; }

        showLoading(true);
        try {
            // 使用 Promise.all 並發寫入訂單與排單表以節省一半的等待時間
            await Promise.all([
                Sheets.appendRows(CONFIG.SHEETS.ORDER_MAIN, [
                    [generateUUID(), orderId, orderDate, total || '', customer, '', phone, sns, email]
                ]),
                Sheets.appendRows(CONFIG.SHEETS.SCHEDULE, items)
            ]);

            showToast(`訂單 ${orderId} 已儲存！`, 'success');
            renderPage(); // 重設頁面並產生新訂單編號
        } catch (e) {
            showToast('儲存失敗：' + e.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    return { init, addItem, removeItem, clearAll, resetForm, save, onItemChange, onQtyChange };
})();
