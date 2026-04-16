const GuestOrder = (() => {
    let menuData = [];
    let itemCount = 0;

    async function init() {
        showLoading(true);
        document.getElementById('order-date').value = todayInputStr();
        try {
            const rows = await Sheets.getSheet(CONFIG.SHEETS.MENU);
            menuData = rowsToObjects(rows);
            // 預設跑出一列
            addItem();
        } catch (e) {
            console.error(e);
            alert('系統忙碌中，請稍後再試。');
        } finally {
            showLoading(false);
        }
    }

    function addItem() {
        itemCount++;
        const id = itemCount;
        const container = document.getElementById('order-items');
        const div = document.createElement('div');
        div.className = 'item-row';
        div.id = `item-row-${id}`;
        
        const options = menuData.map(m => `<option value="${m['菜名']}">${m['菜名']}</option>`).join('');
        
        div.innerHTML = `
            <select class="form-control form-control-sm" id="item-name-${id}" onchange="GuestOrder.updateTotal()">
                <option value="">選擇品項</option>
                ${options}
            </select>
            <input type="number" class="form-control form-control-sm" id="item-qty-${id}" value="1" min="1" step="any" onchange="GuestOrder.updateTotal()" placeholder="數量">
            <button class="btn-icon" onclick="GuestOrder.removeItem(${id})">✕</button>
        `;
        container.appendChild(div);
    }

    function removeItem(id) {
        const el = document.getElementById(`item-row-${id}`);
        if (el) el.remove();
        updateTotal();
    }

    function updateTotal() {
        let total = 0;
        const rows = document.querySelectorAll('.item-row');
        rows.forEach(row => {
            const id = row.id.split('-').pop();
            const name = document.getElementById(`item-name-${id}`).value;
            const qty = parseFloat(document.getElementById(`item-qty-${id}`).value) || 0;
            const menuItem = menuData.find(m => m['菜名'] === name);
            if (menuItem && !String(menuItem['單價']).includes('*')) {
                total += (parseInt(menuItem['單價']) || 0) * qty;
            }
        });
        document.getElementById('summary-total').textContent = `$${total.toLocaleString('zh-TW')}`;
    }

    async function submit() {
        const name = document.getElementById('cust-name').value;
        const contact = document.getElementById('cust-contact').value;
        const date = fromInputDate(document.getElementById('order-date').value);
        const note = document.getElementById('order-note').value;
        
        if (!name || !contact || !date) {
            alert('請填寫完整資訊。');
            return;
        }

        const items = [];
        const rows = document.querySelectorAll('.item-row');
        rows.forEach(row => {
            const id = row.id.split('-').pop();
            const itemName = document.getElementById(`item-name-${id}`).value;
            const qty = document.getElementById(`item-qty-${id}`).value;
            if (itemName && qty) items.push({ name: itemName, qty: qty });
        });

        if (items.length === 0) {
            alert('請至少選擇一個品項。');
            return;
        }

        const ok = confirm('確定送出預約審核嗎？');
        if (!ok) return;

        showLoading(true);
        try {
            const payload = {
                action: 'SUBMIT_CUSTOMER_ORDER',
                values: [[
                    generateUUID(),
                    formatDate(new Date()), // 提交時間
                    date,
                    name,
                    JSON.stringify(items),
                    document.getElementById('summary-total').textContent.replace('$', ''),
                    note,
                    '待審核',
                    contact
                ]]
            };

            const res = await Sheets.requestGAS(payload);
            if (res.status === 'success') {
                alert('預約已送出！老闆將盡快連繫您。');
                window.location.href = 'menu.html';
            } else {
                throw new Error(res.error);
            }
        } catch (e) {
            alert('提交失敗：' + e.message);
        } finally {
            showLoading(false);
        }
    }

    return { init, addItem, removeItem, updateTotal, submit };
})();

document.addEventListener('DOMContentLoaded', GuestOrder.init);

function showLoading(visible) {
    const el = document.getElementById('loading');
    if (el) el.style.display = visible ? 'flex' : 'none';
}
