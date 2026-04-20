// ==============================
// 模組五：支出紀錄
// ==============================

const ExpenseMgmt = (() => {
    let recentExpenses = [];
    let sheetId = null;
    const CATEGORIES = ['食材', '包裝耗材', '水電瓦斯', '運費', '雜支'];

    function init() {
        sheetId = App.getSheetId(CONFIG.SHEETS.EXPENSES);
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
                        ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
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
                <button class="btn btn-primary" onclick="ExpenseMgmt.saveExpense()">➕ 新增支出</button>
            </div>
        </div>
        
        <div class="card" id="ex-recent-card" style="display:none">
            <div class="card-header-row">
                <div class="result-info">
                    <h2 class="card-title" style="margin:0">歷史紀錄管理</h2>
                    <label class="checkbox-label" style="margin-left:12px">
                        <input type="checkbox" id="ex-select-all" onchange="ExpenseMgmt.toggleAll(this.checked)">
                        <span>全選</span>
                    </label>
                    <span id="ex-count" class="text-secondary text-sm"></span>
                </div>
                <div class="btn-group">
                    <button class="btn btn-danger btn-sm" onclick="ExpenseMgmt.deleteSelected()">🗑 刪除勾選</button>
                    <button class="btn btn-primary btn-sm" onclick="ExpenseMgmt.saveAll()">💾 儲存異動</button>
                </div>
            </div>
            <div class="table-wrap">
                <table class="data-table" id="ex-table" style="min-width: 800px;">
                    <thead>
                        <tr>
                            <th style="width:40px"></th>
                            <th style="width:15%">日期</th>
                            <th style="width:15%">分類</th>
                            <th style="width:25%">項目</th>
                            <th style="width:15%">金額</th>
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
                // 取最後 30 筆，反轉顯示 (新的在上面)
                recentExpenses = objects.slice(-30).reverse();
                document.getElementById('ex-count').textContent = `(顯示最新的 ${recentExpenses.length} 筆)`;
                renderTable();
            } else {
                document.getElementById('ex-recent-card').style.display = 'none';
                recentExpenses = [];
            }
        } catch (e) {
            console.log('尚未有支出紀錄表或無資料', e);
        }
    }

    function renderTable() {
        const tbody = document.getElementById('ex-recent-body');
        document.getElementById('ex-select-all').checked = false;

        tbody.innerHTML = recentExpenses.map((o, idx) => `
            <tr data-idx="${idx}">
                <td><input type="checkbox" class="ex-cb" data-idx="${idx}"></td>
                <td><input type="date" class="form-control form-control-sm" data-field="日期" value="${toInputDate(o['日期']) || ''}"></td>
                <td>
                    <select class="form-control form-control-sm" data-field="分類">
                        ${CATEGORIES.map(c => `<option value="${c}" ${o['分類'] === c ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>
                </td>
                <td><input type="text" class="form-control form-control-sm" data-field="支出項目" value="${o['支出項目'] || ''}"></td>
                <td><input type="number" class="form-control form-control-sm" data-field="金額" value="${o['金額'] || ''}" min="0"></td>
                <td><input type="text" class="form-control form-control-sm" data-field="備註" value="${o['備註'] || ''}"></td>
            </tr>
        `).join('');
    }

    function toggleAll(checked) {
        document.querySelectorAll('.ex-cb').forEach(cb => cb.checked = checked);
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
                [generateUUID(), date, item, amount, cat, note]
            ]);
            showToast('新增支出紀錄成功！', 'success');
            
            // 清空部分欄位
            document.getElementById('ex-item').value = '';
            document.getElementById('ex-amount').value = '';
            document.getElementById('ex-note').value = '';
            
            await loadRecentExpenses();
        } catch (e) {
            showToast('儲存失敗：' + e.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    async function deleteSelected() {
        const checked = [...document.querySelectorAll('.ex-cb:checked')];
        if (!checked.length) { showToast('請先勾選要刪除的紀錄', 'error'); return; }

        const ok = await showConfirm(`確定要刪除已勾選的 ${checked.length} 筆紀錄嗎？此動作無法復原。`);
        if (!ok) return;

        const idsToDelete = [];
        checked.forEach(cb => {
            const idx = parseInt(cb.dataset.idx);
            idsToDelete.push(recentExpenses[idx]['ID']);
        });

        showLoading(true);
        try {
            await Sheets.batchDeleteById(CONFIG.SHEETS.EXPENSES, idsToDelete);
            showToast('刪除成功！', 'success');
            await loadRecentExpenses();
        } catch (e) {
            showToast('刪除失敗：' + e.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    async function saveAll() {
        const checked = [...document.querySelectorAll('.ex-cb:checked')];
        if (!checked.length) { showToast('請先勾選要儲存異動的紀錄', 'error'); return; }

        const toUpdate = [];
        const tbody = document.getElementById('ex-recent-body');

        checked.forEach(cb => {
            const idx = parseInt(cb.dataset.idx);
            const tr = tbody.querySelector(`tr[data-idx="${idx}"]`);
            if (!tr) return;

            const getValue = (field) => {
                const el = tr.querySelector(`[data-field="${field}"]`);
                return el ? el.value.trim() : '';
            };

            const item = recentExpenses[idx];
            const dateStr = fromInputDate(getValue('日期'));
            const row = [item['ID'], dateStr, getValue('支出項目'), getValue('金額'), getValue('分類'), getValue('備註')];
            
            toUpdate.push({ id: item['ID'], rowValues: row });
        });

        showLoading(true);
        try {
            await Sheets.batchUpdateById(CONFIG.SHEETS.EXPENSES, toUpdate);
            showToast('儲存異動成功！', 'success');
            await loadRecentExpenses();
        } catch (e) {
            showToast('儲存失敗：' + e.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    return { init, saveExpense, toggleAll, deleteSelected, saveAll };
})();
