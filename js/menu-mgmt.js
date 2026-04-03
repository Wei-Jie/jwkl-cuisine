// ==============================
// 模組三：菜單管理
// ==============================

const MenuMgmt = (() => {
    let allMenu = [];
    let queryResult = [];
    let sheetId = null;
    const HEADERS = ['分類', '菜名', '單價', '最小訂購數量', '備註'];
    const CATEGORIES = ['麵食', '小菜', '料理包', '滷味'];

    function init() {
        sheetId = App.getSheetId(CONFIG.SHEETS.MENU);
        const page = document.getElementById('page-menu-mgmt');
        page.innerHTML = `
        <div class="page-header">
            <h1 class="page-title">菜單管理</h1>
        </div>
        <div class="card">
            <div class="filter-row">
                <div class="form-group">
                    <label class="form-label">分類</label>
                    <select id="mm-category" class="form-control" style="max-width:160px">
                        <option value="">全部</option>
                        ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                </div>
                <button class="btn btn-primary" onclick="MenuMgmt.query()">🔍 查詢</button>
                <button class="btn btn-outline" onclick="MenuMgmt.addRow()">➕ 新增品項</button>
            </div>
        </div>
        <div id="mm-result-wrap" class="card hidden">
            <div class="card-header-row">
                <div class="result-info">
                    <label class="checkbox-label">
                        <input type="checkbox" id="mm-select-all" onchange="MenuMgmt.toggleAll(this.checked)">
                        <span>全選</span>
                    </label>
                    <span id="mm-count" class="text-secondary text-sm"></span>
                </div>
                <div class="btn-group">
                    <button class="btn btn-danger btn-sm" onclick="MenuMgmt.deleteSelected()">🗑 刪除勾選</button>
                    <button class="btn btn-primary btn-sm" onclick="MenuMgmt.save()">💾 儲存異動</button>
                </div>
            </div>
            <div class="table-wrap">
                <table class="data-table" id="mm-table">
                    <thead>
                        <tr>
                            <th style="width:40px"></th>
                            <th style="width:12%">分類</th>
                            <th style="width:20%">菜名</th>
                            <th style="width:12%">單價</th>
                            <th style="width:12%">最小訂購數量</th>
                            <th>備註</th>
                        </tr>
                    </thead>
                    <tbody id="mm-tbody"></tbody>
                </table>
            </div>
        </div>`;
    }

    async function query() {
        const cat = document.getElementById('mm-category').value;
        showLoading(true);
        try {
            const rows = await Sheets.getSheet(CONFIG.SHEETS.MENU);
            allMenu = rowsToObjects(rows);
            queryResult = cat ? allMenu.filter(m => m['分類'] === cat) : [...allMenu];
            App.clearMenuCache();
            renderTable();
        } catch (e) {
            showToast('讀取菜單失敗：' + e.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    function renderTable() {
        const wrap = document.getElementById('mm-result-wrap');
        const tbody = document.getElementById('mm-tbody');
        document.getElementById('mm-count').textContent = `共 ${queryResult.length} 筆`;
        document.getElementById('mm-select-all').checked = false;
        wrap.classList.remove('hidden');

        if (!queryResult.length) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-secondary">查無資料</td></tr>`;
            return;
        }

        tbody.innerHTML = queryResult.map((m, idx) => `
            <tr data-idx="${idx}" data-row="${m._rowIndex}" data-new="${m._isNew || false}">
                <td><input type="checkbox" class="mm-cb" data-idx="${idx}"></td>
                <td>
                    <select class="form-control form-control-sm" data-field="分類">
                        ${CATEGORIES.map(c => `<option value="${c}" ${m['分類'] === c ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>
                </td>
                <td><input type="text" class="form-control form-control-sm" data-field="菜名" value="${m['菜名'] || ''}"></td>
                <td><input type="text" class="form-control form-control-sm" data-field="單價" value="${m['單價'] || ''}"></td>
                <td><input type="number" class="form-control form-control-sm" data-field="最小訂購數量" value="${m['最小訂購數量'] || 1}" min="1"></td>
                <td><input type="text" class="form-control form-control-sm" data-field="備註" value="${m['備註'] || ''}"></td>
            </tr>`).join('');
    }

    function addRow() {
        const wrap = document.getElementById('mm-result-wrap');
        wrap.classList.remove('hidden');
        const tbody = document.getElementById('mm-tbody');
        const idx = queryResult.length;

        const newItem = { _rowIndex: null, _isNew: true, '分類': CATEGORIES[0], '菜名': '', '單價': '', '最小訂購數量': 1, '備註': '' };
        queryResult.push(newItem);

        const tr = document.createElement('tr');
        tr.dataset.idx = idx;
        tr.dataset.new = 'true';
        tr.innerHTML = `
            <td><input type="checkbox" class="mm-cb" data-idx="${idx}" checked></td>
            <td><select class="form-control form-control-sm" data-field="分類">
                ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select></td>
            <td><input type="text" class="form-control form-control-sm" data-field="菜名" placeholder="輸入菜名"></td>
            <td><input type="text" class="form-control form-control-sm" data-field="單價" placeholder="如: 240 或 1.4*重量"></td>
            <td><input type="number" class="form-control form-control-sm" data-field="最小訂購數量" value="1" min="1"></td>
            <td><input type="text" class="form-control form-control-sm" data-field="備註"></td>`;
        tbody.appendChild(tr);
        document.getElementById('mm-count').textContent = `共 ${queryResult.length} 筆`;
        tr.scrollIntoView({ behavior: 'smooth' });
    }

    function toggleAll(checked) {
        document.querySelectorAll('.mm-cb').forEach(cb => cb.checked = checked);
    }

    async function deleteSelected() {
        const checked = [...document.querySelectorAll('.mm-cb:checked')];
        if (!checked.length) { showToast('請先勾選要刪除的品項', 'error'); return; }

        const ok = await showConfirm(`確定要刪除已勾選的 ${checked.length} 個品項嗎？此動作無法復原。`);
        if (!ok) return;

        // 分離新增列（尚未存入 Sheets）和已存在列
        const existingRows = [];
        const newIdxs = [];
        checked.forEach(cb => {
            const idx = parseInt(cb.dataset.idx);
            const item = queryResult[idx];
            if (item._isNew) newIdxs.push(idx);
            else existingRows.push(item._rowIndex - 1); // 0-indexed
        });

        showLoading(true);
        try {
            if (existingRows.length) {
                await Sheets.deleteRows(sheetId, existingRows);
            }
            showToast('刪除成功！', 'success');
            App.clearMenuCache();
            await query();
        } catch (e) {
            showToast('刪除失敗：' + e.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    async function save() {
        const checked = [...document.querySelectorAll('.mm-cb:checked')];
        if (!checked.length) { showToast('請先勾選要儲存的品項', 'error'); return; }

        // 收集勾選列的資料
        const toAppend = [];   // 新增
        const toUpdate = [];   // 更新

        const tbody = document.getElementById('mm-tbody');

        checked.forEach(cb => {
            const idx = parseInt(cb.dataset.idx);
            const tr = tbody.querySelector(`tr[data-idx="${idx}"]`);
            if (!tr) return;

            const getValue = (field) => {
                const el = tr.querySelector(`[data-field="${field}"]`);
                return el ? el.value.trim() : '';
            };

            const row = [getValue('分類'), getValue('菜名'), getValue('單價'), getValue('最小訂購數量'), getValue('備註')];
            const item = queryResult[idx];

            if (item._isNew) {
                toAppend.push(row);
            } else {
                // 更新整列（A~E欄）
                toUpdate.push({ range: `${CONFIG.SHEETS.MENU}!A${item._rowIndex}:E${item._rowIndex}`, values: [row] });
            }
        });

        showLoading(true);
        try {
            if (toAppend.length) await Sheets.appendRows(CONFIG.SHEETS.MENU, toAppend);
            if (toUpdate.length) await Sheets.batchUpdate(toUpdate);
            showToast('儲存成功！', 'success');
            App.clearMenuCache();
            await query();
        } catch (e) {
            showToast('儲存失敗：' + e.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    return { init, query, addRow, toggleAll, deleteSelected, save };
})();
