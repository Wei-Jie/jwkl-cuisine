// ==============================
// 模組五：支出紀錄
// ==============================

const ExpenseMgmt = (() => {
    function init() {
        const page = document.getElementById('page-expense');
        
        page.innerHTML = `
        <div class="page-header">
            <h1 class="page-title">支出紀錄</h1>
        </div>
        <div class="card">
            <div class="form-row-3">
                <div class="form-group">
                    <label class="form-label">日期 <span class="required">*</span></label>
                    <input type="date" id="ex-date" class="form-control" value="${todayInputStr()}">
                </div>
                <div class="form-group">
                    <label class="form-label">分類 <span class="required">*</span></label>
                    <select id="ex-cat" class="form-control">
                        <option value="食材">食材</option>
                        <option value="包裝耗材">包裝耗材</option>
                        <option value="水電瓦斯">水電瓦斯</option>
                        <option value="運費">運費</option>
                        <option value="雜支">雜支</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">支出金額 <span class="required">*</span></label>
                    <input type="number" id="ex-amount" class="form-control" placeholder="請輸入金額" min="0">
                </div>
            </div>
            <div class="form-row-1 mb-16">
                <div class="form-group">
                    <label class="form-label">支出項目說明 <span class="required">*</span></label>
                    <input type="text" id="ex-item" class="form-control" placeholder="例如：好市多買牛肉、網購紙盒...">
                </div>
            </div>
            <div class="form-row-1 mb-16">
                <div class="form-group">
                    <label class="form-label">備註（選填）</label>
                    <input type="text" id="ex-note" class="form-control" placeholder="其他補充說明">
                </div>
            </div>
            <div class="action-row" style="margin-top:24px">
                <button class="btn btn-primary" onclick="ExpenseMgmt.saveExpense()">💾 儲存支出紀錄</button>
            </div>
        </div>
        
        <div class="card" id="ex-recent-card" style="display:none">
            <h2 class="card-title">最近 5 筆紀錄</h2>
            <div class="table-wrap">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width:15%">日期</th>
                            <th style="width:15%">分類</th>
                            <th style="width:30%">項目</th>
                            <th class="text-right" style="width:15%">金額</th>
                            <th style="width:25%">備註</th>
                        </tr>
                    </thead>
                    <tbody id="ex-recent-body"></tbody>
                </table>
            </div>
        </div>
        `;
        
        loadRecentExpenses();
    }

    async function loadRecentExpenses() {
        try {
            const rows = await Sheets.getSheet(CONFIG.SHEETS.EXPENSES);
            const objects = rowsToObjects(rows);
            if (objects.length > 0) {
                document.getElementById('ex-recent-card').style.display = 'block';
                // 取最後 5 筆，反轉顯示
                const recent = objects.slice(-5).reverse();
                const tbody = document.getElementById('ex-recent-body');
                tbody.innerHTML = recent.map(o => `
                    <tr>
                        <td>${o['日期']}</td>
                        <td><span class="tag">${o['分類']}</span></td>
                        <td>${o['支出項目']}</td>
                        <td class="text-right fw-medium text-danger">$${Number(o['金額']).toLocaleString('zh-TW')}</td>
                        <td class="text-secondary text-sm">${o['備註']}</td>
                    </tr>
                `).join('');
            }
        } catch (e) {
            console.log('尚未有支出紀錄表或無資料');
        }
    }

    async function saveExpense() {
        const dateInput = document.getElementById('ex-date').value;
        const cat = document.getElementById('ex-cat').value;
        const item = document.getElementById('ex-item').value.trim();
        const amount = parseInt(document.getElementById('ex-amount').value);
        const note = document.getElementById('ex-note').value.trim();

        if (!dateInput || !item || isNaN(amount) || amount <= 0) {
            showToast('請完整填寫必填欄位 (日期, 項目, 金額大於0)', 'error');
            return;
        }

        const date = fromInputDate(dateInput);

        showLoading(true);
        try {
            await Sheets.appendRows(CONFIG.SHEETS.EXPENSES, [
                [date, item, amount, cat, note]
            ]);
            showToast('支出紀錄儲存成功！', 'success');
            
            // 清空部分欄位方便連續輸入
            document.getElementById('ex-item').value = '';
            document.getElementById('ex-amount').value = '';
            document.getElementById('ex-note').value = '';
            
            // 重新載入最近紀錄
            loadRecentExpenses();
        } catch (e) {
            showToast('儲存失敗：' + e.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    return { init, saveExpense };
})();
