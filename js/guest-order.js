const GuestOrder = (() => {
    let menuData = [];
    let itemCount = 0;

    async function init() {
        showLoading(true);
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
        
        // 依照分類分組
        const categories = [...new Set(menuData.map(m => m['分類']))];
        let optionsHtml = `<option value="">選擇品項</option>`;
        
        categories.forEach(cat => {
            const items = menuData.filter(m => m['分類'] === cat);
            optionsHtml += `<optgroup label="${cat}">`;
            items.forEach(m => {
                const priceStr = String(m['單價']).includes('*') ? '(1.4乘上重量)' : `(單價${m['單價']}元)`;
                optionsHtml += `<option value="${m['菜名']}">${m['菜名']} ${priceStr}</option>`;
            });
            optionsHtml += `</optgroup>`;
        });
        
        div.innerHTML = `
            <select class="form-control form-control-sm" id="item-name-${id}" onchange="GuestOrder.updateTotal()">
                ${optionsHtml}
            </select>
            <input type="number" class="form-control form-control-sm" id="item-qty-${id}" value="1" min="1" step="1" onchange="GuestOrder.updateTotal()" placeholder="數量">
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
        let hasWeightItem = false;
        const rows = document.querySelectorAll('.item-row');
        rows.forEach(row => {
            const id = row.id.split('-').pop();
            const name = document.getElementById(`item-name-${id}`).value;
            const qty = parseFloat(document.getElementById(`item-qty-${id}`).value) || 0;
            const menuItem = menuData.find(m => m['菜名'] === name);
            if (menuItem) {
                if (String(menuItem['單價']).includes('*')) {
                    hasWeightItem = true;
                } else {
                    total += (parseInt(menuItem['單價']) || 0) * qty;
                }
            }
        });
        
        const totalText = total.toLocaleString('zh-TW');
        if (hasWeightItem) {
            document.getElementById('summary-total').textContent = `$${totalText} + 秤重商品金額(待確認)`;
        } else {
            document.getElementById('summary-total').textContent = `$${totalText}`;
        }
    }

    async function submit() {
        const name = document.getElementById('cust-name').value.trim();
        const phoneInput = document.getElementById('cust-phone').value.trim();
        const sns = document.getElementById('cust-sns').value.trim();
        const email = document.getElementById('cust-email').value.trim();
        const note = document.getElementById('order-note').value.trim();
        
        // 1. 基礎必填驗證
        if (!name || !phoneInput || !sns) {
            alert('請填寫完整資訊（姓名、電話、社群帳號）。');
            return;
        }

        // 2. 特殊符號過濾 (包含 HTML 標籤與試算表敏感符號 + =)
        const specialChars = /[+=\<\>\/\"\'\&\;]/g;
        if (specialChars.test(name) || specialChars.test(sns) || specialChars.test(note)) {
            alert('欄位內容包含不合法指令或符號（如 + = < > 等），請重新輸入。');
            return;
        }

        // 3. 電話驗證 (09 開頭 10 碼)
        const phoneRegex = /^09\d{8}$/;
        if (!phoneRegex.test(phoneInput)) {
            alert('請輸入 09 開頭的完整 10 碼數字。');
            return;
        }

        // 4. Email 驗證
        if (email && !email.includes('@')) {
            alert('Email 格式不正確，必須包含 @ 符號。');
            return;
        }

        const dateObj = new Date();
        const date = `${dateObj.getFullYear()}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${String(dateObj.getDate()).padStart(2, '0')}`;
        
        const phone = "'" + phoneInput; // 強制轉字串避免試算表去零

        const items = [];
        const rows = document.querySelectorAll('.item-row');
        rows.forEach(row => {
            const id = row.id.split('-').pop();
            const itemName = document.getElementById(`item-name-${id}`).value;
            const qtyInput = document.getElementById(`item-qty-${id}`).value;
            const qty = parseInt(qtyInput) || 0;
            
            if (itemName && qty > 0) {
                items.push({ name: itemName, qty: qty });
            }
        });

        if (items.length === 0) {
            alert('請至少選擇一個有效品項與數量。');
            return;
        }

        const ok = confirm('確定送出預約確認嗎？');
        if (!ok) return;

        showLoading(true);
        try {
            // 新結構: (ID, 訂單編號, 日期, 姓名, 明細, 金額, 備註, 狀態, 電話, SNS, Email)
            const payload = {
                action: 'SUBMIT_CUSTOMER_ORDER',
                sheetName: CONFIG.SHEETS.PENDING,
                values: [[
                    generateUUID(),
                    '', // 訂單編號保留給後端產生
                    date, // 訂單日期 (原本 index 3 移至此)
                    name,
                    JSON.stringify(items),
                    document.getElementById('summary-total').textContent, // 包含待確認文字
                    note,
                    '待確認',
                    phone,
                    sns,
                    email
                ]]
            };

            const res = await Sheets.requestGAS(payload);
            if (res.status === 'success') {
                const orderId = res.data ? res.data.orderId : '尚未產生';
                alert(`預約已送出！\n您的預約單號為：【 ${orderId} 】\n請妥善保管此單號以便前往查詢頁面追蹤進度。老闆將盡快確認。`);
                window.location.href = 'track.html';
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
