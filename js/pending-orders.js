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
                                <th>聯絡方式</th>
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
                itemsHtml = items.map(it => `${escapeHtml(it.name)} x${escapeHtml(it.qty)}`).join('<br>');
            } catch (e) { itemsHtml = '解析錯誤'; }

            return `
                <tr>
                    <td class="text-sm">${escapeHtml(d['提交時間'])}</td>
                    <td>${escapeHtml(d['訂單日期'])}</td>
                    <td class="fw-medium">${escapeHtml(d['顧客名稱'])}</td>
                    <td class="text-secondary">${escapeHtml(d['聯絡方式']) || '-'}</td>
                    <td class="fw-bold text-accent">$${escapeHtml(d['總金額'])}</td>
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
            // 1. 產生正式訂單編號
            const orderRows = await Sheets.getSheet(CONFIG.SHEETS.ORDER_MAIN);
            const currentOrders = rowsToObjects(orderRows);
            const orderDateObj = new Date(d['訂單日期']);
            const finalOrderId = d['訂單編號'] || generateOrderId(currentOrders.map(o => o['訂單編號']), orderDateObj);

            const items = JSON.parse(d['品項明細']);
            const scheduleItems = items.map(it => {
                const menuItem = menuData.find(m => m['菜名'] === it.name);
                const isWeight = menuItem && String(menuItem['單價']).includes('*');
                const unitPrice = menuItem ? (isWeight ? menuItem['單價'] : parseInt(menuItem['單價']) || 0) : 0;
                const subtotal = isWeight ? '' : unitPrice * parseFloat(it.qty);

                return [
                    generateUUID(),
                    finalOrderId,
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
                    finalOrderId,
                    d['訂單日期'],
                    d['總金額'],
                    d['顧客名稱'],
                    '',
                    (d['電話'] && d['電話'].startsWith('0')) ? "'" + d['電話'] : (d['電話'] || ''),
                    d['SNS'] || '',
                    d['Email'] || ''
                ]]),
                Sheets.appendRows(CONFIG.SHEETS.SCHEDULE, scheduleItems),
                // 3. 更新原預約單狀態
                Sheets.updateById(CONFIG.SHEETS.PENDING, d['ID'], [
                    d['ID'], finalOrderId, d['提交時間'], d['訂單日期'], d['顧客名稱'],
                    d['品項明細'], d['總金額'], d['備註'], '已轉正', d['電話'], d['SNS'], d['Email']
                ])
            ]);

            // 4. 發送通知信
            if (d['Email']) {
                const emailHtml = `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
                        <h2 style="color: #e67e22;">【小灶私廚】預約成功通知 🎉</h2>
                        <p>親愛的 <strong>${d['顧客名稱']}</strong> 您好，</p>
                        <p>這是一封系統自動發送的確認信，您的專屬訂單編號 <strong>${finalOrderId}</strong> 已經被老闆核准，準備為您排單製作囉！</p>
                        <hr style="border:0; border-top: 2px dashed #eee; margin:20px 0;">
                        <h3 style="color: #2c3e50;">📅 預計取餐與出貨日：${d['訂單日期']}</h3>
                        <p><strong>估計金額：</strong>$${Number(d['總金額']).toLocaleString('zh-TW')} <br>
                        <span style="font-size: 0.85em; color: #7f8c8d;">(此金額為送單時粗估，實際秤重與特殊要求等最終請以老闆報價為準)</span></p>
                        <p><strong>您的訂購內容：</strong><br>
                        ${items.map(it => `🍽️ ${it.name} <span style="color:#e67e22">x${it.qty}</span>`).join('<br>')}
                        </p>
                        ${d['備註'] ? `<p><strong>特別備註：</strong>${d['備註']}</p>` : ''}
                        <hr style="border:0; border-top: 2px dashed #eee; margin:20px 0;">
                        <p>後續如果有任何出貨進度詢問或是微調需求，隨時歡迎透過我們的官方 Instagram 與老闆聯繫確認！</p>
                        <div style="text-align: center; margin-top: 30px; margin-bottom: 30px;">
                            <a href="https://www.instagram.com/jwkl_cuisine?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==" target="_blank" style="display:inline-block; padding:14px 28px; background:#e67e22; color:#fff; text-decoration:none; border-radius:8px; font-weight:bold; font-size:1.1rem; box-shadow: 0 4px 6px rgba(230,126,34,0.3);">👉 點我前往 小灶私廚 IG</a>
                        </div>
                        <p style="font-size: 0.8em; color: #aaa; text-align: center;">※本信件為系統自動發送，請勿直接回覆此信箱。※</p>
                    </div>
                `;
                await Sheets.requestGAS({
                    action: 'SEND_EMAIL',
                    to: d['Email'],
                    subject: `【小灶私廚】預約訂單已成立 (${finalOrderId})`,
                    htmlBody: emailHtml
                });
            }

            showToast(`訂單 ${finalOrderId} 核准成功！`, 'success');
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
