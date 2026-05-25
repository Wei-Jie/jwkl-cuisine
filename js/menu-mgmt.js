// ==============================
// 模組三：菜單管理
// ==============================

const MenuMgmt = (() => {
    let allMenu = [];
    let queryResult = [];
    let sheetId = null;
    const HEADERS = ['分類', '菜名', '單價', '最小訂購數量', '備註', '預估成本', '狀態'];
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
                            <th style="width:10%">分類</th>
                            <th style="width:18%">菜名</th>
                            <th style="width:12%">單價</th>
                            <th style="width:10%">最小數量</th>
                            <th style="width:12%">狀態</th>
                            <th style="width:12%">成本</th>
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
            tbody.innerHTML = `<tr><td colspan="8" class="text-center text-secondary">查無資料</td></tr>`;
            return;
        }

        tbody.innerHTML = queryResult.map((m, idx) => {
            const status = String(m['狀態'] || '上架').trim();
            return `
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
                <td>
                    <select class="form-control form-control-sm" data-field="狀態" style="color: ${status === '上架' ? '#2ecc71' : '#e74c3c'}; font-weight: bold;">
                        <option value="上架" ${status === '上架' ? 'selected' : ''}>上架</option>
                        <option value="下架" ${status === '下架' ? 'selected' : ''}>下架</option>
                    </select>
                </td>
                <td><input type="text" class="form-control form-control-sm" data-field="預估成本" value="${m['預估成本'] || ''}"></td>
                <td><input type="text" class="form-control form-control-sm" data-field="備註" value="${m['備註'] || ''}"></td>
            </tr>`;
        }).join('');
    }

    function addRow() {
        const wrap = document.getElementById('mm-result-wrap');
        wrap.classList.remove('hidden');
        const tbody = document.getElementById('mm-tbody');
        const idx = queryResult.length;

        const newItem = { _rowIndex: null, _isNew: true, '分類': CATEGORIES[0], '菜名': '', '單價': '', '最小訂購數量': 1, '預估成本': '', '備註': '', '圖片網址': '', '狀態': '上架' };
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
            <td>
                <select class="form-control form-control-sm" data-field="狀態" style="color: #2ecc71; font-weight: bold;">
                    <option value="上架" selected>上架</option>
                    <option value="下架">下架</option>
                </select>
            </td>
            <td><input type="text" class="form-control form-control-sm" data-field="預估成本" placeholder="如: 30%"></td>
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
        const existingIds = [];
        const newIdxs = [];
        checked.forEach(cb => {
            const idx = parseInt(cb.dataset.idx);
            const item = queryResult[idx];
            if (item._isNew) newIdxs.push(idx);
            else existingIds.push(item['ID']);
        });

        showLoading(true);
        try {
            if (existingIds.length) {
                await Sheets.batchDeleteById(CONFIG.SHEETS.MENU, existingIds);
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

            const item = queryResult[idx];
            
            let imgUrl = item['圖片網址'] || '';
            // 防禦性檢查：若原有圖片網址被誤植為狀態名稱，則儲存時自動清除以修復資料
            if (imgUrl === '上架' || imgUrl === '下架') {
                imgUrl = '';
            }

            // 欄位順序: ID, 分類, 菜名, 單價, 最小訂購數量, 備註, 預估成本, 圖片網址, 狀態
            const rowValues = [
                item['ID'] || generateUUID(),
                getValue('分類'),
                getValue('菜名'),
                getValue('單價'),
                getValue('最小訂購數量'),
                getValue('備註'),
                getValue('預估成本'),
                imgUrl,
                getValue('狀態')
            ];

            if (item._isNew) {
                toAppend.push(rowValues);
            } else {
                toUpdate.push({ id: item['ID'], rowValues: rowValues });
            }
        });

        showLoading(true);
        try {
            const tasks = [];
            if (toAppend.length) tasks.push(Sheets.appendRows(CONFIG.SHEETS.MENU, toAppend));
            if (toUpdate.length) tasks.push(Sheets.batchUpdateById(CONFIG.SHEETS.MENU, toUpdate));
            
            await Promise.all(tasks);
            
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
