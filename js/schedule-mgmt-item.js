// ==========================================
// 模組七：品項排單管理by品項
// ==========================================

const ScheduleMgmtItem = (() => {
    let menuData = [];
    let scheduleData = [];
    let _scheduleHeaders = [];
    let selectedItems = []; // 改為複選陣列

    /** 全域點擊監聽：點擊外面時自動關閉下拉選單面板 */
    function handleGlobalClick(e) {
        const panel = document.getElementById('smi-dropdown-panel');
        const btn = document.getElementById('smi-dropdown-btn');
        if (panel && btn && panel.style.display === 'block') {
            if (!btn.contains(e.target) && !panel.contains(e.target)) {
                panel.style.display = 'none';
            }
        }
    }

    /** 初始化品項排單頁面 */
    async function init() {
        const page = document.getElementById('page-schedule-mgmt-item');
        if (!page) return;
        
        // 渲染極具質感的 SPA 頁面架構，並搭配小灶私廚風格的藍色與自訂動態指標卡片網格
        page.innerHTML = `
            <div class="page-header">
                <h1 class="page-title">品項排單管理</h1>
                <span class="text-secondary text-sm">依產品品項查詢排單明細與訂購數量統計，並可批次修改排程狀態</span>
            </div>

            <div class="card" style="margin-bottom: 20px;">
                <div class="filter-row">
                    <div class="form-group" style="min-width: 320px; position: relative;">
                        <label class="form-label">選擇產品品項 (可複選)</label>
                        <button type="button" class="form-control" id="smi-dropdown-btn" onclick="ScheduleMgmtItem.toggleDropdown(event)" style="text-align: left; display: flex; justify-content: space-between; align-items: center; background: var(--color-surface); cursor: pointer;">
                            <span id="smi-dropdown-label">-- 請選擇產品品項 (已選 0 項) --</span>
                            <span style="font-size: 10px; color: var(--color-text-secondary);">▼</span>
                        </button>
                        <!-- 下拉多選面板 -->
                        <div id="smi-dropdown-panel" class="card" style="display: none; position: absolute; top: 100%; left: 0; right: 0; z-index: 1000; padding: 12px; margin-top: 4px; box-shadow: var(--shadow); max-height: 250px; overflow-y: auto; width: 100%;">
                            <div style="display: flex; gap: 8px; margin-bottom: 8px; border-bottom: 1px solid var(--color-border); padding-bottom: 8px;">
                                <button type="button" class="btn btn-secondary btn-sm" onclick="ScheduleMgmtItem.selectPreset('all')" style="padding: 4px 10px; font-size: 12px;">全選</button>
                                <button type="button" class="btn btn-secondary btn-sm" onclick="ScheduleMgmtItem.selectPreset('none')" style="padding: 4px 10px; font-size: 12px;">清除</button>
                            </div>
                            <div id="smi-checkbox-list" style="display: flex; flex-direction: column; gap: 8px;"></div>
                        </div>
                    </div>
                    <button class="btn btn-primary" id="smi-query-btn" onclick="ScheduleMgmtItem.query()" style="height: 38px;">🔍 查詢排單</button>
                </div>
            </div>

            <!-- 排單明細表格卡片 -->
            <div class="card" id="smi-table-card" style="display: none;">
                <div class="card-header-row" style="margin-bottom: 16px;">
                    <h2 class="card-title" id="smi-results-title" style="margin-bottom: 0;">排單明細</h2>
                    <button class="btn btn-primary btn-sm" id="smi-save-batch-btn" onclick="ScheduleMgmtItem.saveBatch()" style="display: flex; align-items: center; gap: 6px; padding: 8px 16px; font-weight: 600;">
                        💾 儲存狀態異動
                    </button>
                </div>
                <div class="table-wrap">
                    <table class="data-table" style="min-width: 950px;">
                        <thead>
                            <tr>
                                <th style="width: 40px; text-align: center;">
                                    <input type="checkbox" id="smi-select-all" onclick="ScheduleMgmtItem.toggleSelectAll(this)" style="cursor: pointer; transform: scale(1.1);">
                                </th>
                                <th>訂單編號</th>
                                <th>訂單日期</th>
                                <th>客戶姓名</th>
                                <th>品項</th>
                                <th>訂購數量</th>
                                <th>商品單價</th>
                                <th>小計價格</th>
                                <th style="width: 150px;">排程狀態</th>
                            </tr>
                        </thead>
                        <tbody id="smi-tbody"></tbody>
                    </table>
                </div>
            </div>

            <!-- 下方指標區：各品項獨立統計動態網格 -->
            <div id="smi-summary-area" style="display: none; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; margin-top: 16px;">
                <!-- 由 JS 動態生成各品項卡片 -->
            </div>
        `;

        showLoading(true);
        try {
            // 讀取菜單列表，取得所有曾上架或歷史的菜名
            const menu = await App.getMenu();
            menuData = [...new Set(menu.map(m => m['菜名']).filter(Boolean))].sort();
            
            const listContainer = document.getElementById('smi-checkbox-list');
            if (listContainer) {
                listContainer.innerHTML = menuData.map(name => `
                    <label class="checkbox-label" style="display: flex; align-items: center; gap: 8px; font-weight: normal; cursor: pointer; user-select: none; margin-bottom: 0;">
                        <input type="checkbox" class="smi-item-checkbox" value="${escapeHtml(name)}" onchange="ScheduleMgmtItem.updateDropdownLabel()" style="cursor: pointer; width: 15px; height: 15px;">
                        <span>${escapeHtml(name)}</span>
                    </label>
                `).join('');

                // 若之前已有選取的品項，則自動勾選並查詢
                if (selectedItems && selectedItems.length > 0) {
                    document.querySelectorAll('.smi-item-checkbox').forEach(box => {
                        if (selectedItems.includes(box.value)) {
                            box.checked = true;
                        }
                    });
                    updateDropdownLabel();
                    query();
                }
            }

            // 移除舊的點擊監聽避免重複註冊，並重新註冊全域點擊事件
            document.removeEventListener('click', handleGlobalClick);
            document.addEventListener('click', handleGlobalClick);
        } catch (e) {
            showToast('載入產品清單失敗：' + e.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    /** 執行排單查詢 */
    async function query() {
        const checkedBoxes = document.querySelectorAll('.smi-item-checkbox:checked');
        const vals = [...checkedBoxes].map(box => box.value);
        if (!vals.length) {
            showToast('請至少選擇一個產品品項', 'warning');
            return;
        }

        selectedItems = vals;
        showLoading(true);

        try {
            // 載入排單表，並將表頭暫存以供後續寫回時進行欄位定位與還原
            const rows = await Sheets.getSheet(CONFIG.SHEETS.SCHEDULE);
            _scheduleHeaders = rows[0] || [];
            const allItems = rowsToObjects(rows);

            // 過濾條件：品項名稱在勾選名單內，且狀態為「待排程」或「已完成」
            scheduleData = allItems.filter(item => {
                const name = String(item['品項名稱'] || item['品項'] || '').trim();
                const status = String(getValueByKeyword(item, ['狀態', '排程']) || '').trim();
                return selectedItems.includes(name) && (status === CONFIG.STATUS.PENDING || status === CONFIG.STATUS.DONE);
            });

            // 重設表頭的全選勾選框狀態
            const selectAllCheckbox = document.getElementById('smi-select-all');
            if (selectAllCheckbox) selectAllCheckbox.checked = false;

            renderResults();
        } catch (e) {
            showToast('讀取排單資料失敗：' + e.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    /** 渲染排單查詢結果與統計數據 */
    function renderResults() {
        const tableCard = document.getElementById('smi-table-card');
        const summaryArea = document.getElementById('smi-summary-area');
        const titleEl = document.getElementById('smi-results-title');
        const tbody = document.getElementById('smi-tbody');

        if (!tableCard || !summaryArea || !tbody) return;

        const displayTitle = selectedItems.length === 1 
            ? `【${selectedItems[0]}】` 
            : `【已選 ${selectedItems.length} 個品項】`;
        titleEl.textContent = `${displayTitle}排單明細`;
        tableCard.style.display = 'block';

        if (!scheduleData.length) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center text-secondary">沒有符合條件的排單紀錄（需為「待排程」或「已完成」狀態）</td></tr>`;
            summaryArea.innerHTML = '';
            summaryArea.style.display = 'none';
            return;
        }

        // 依據訂單日期排序：最早排單的在最上方（改為升冪排序）
        const sortedData = [...scheduleData].sort((a, b) => {
            const dateA = new Date(a['排單日期'] || a['訂單日期'] || 0);
            const dateB = new Date(b['排單日期'] || b['訂單日期'] || 0);
            return dateA - dateB;
        });

        tbody.innerHTML = sortedData.map(d => {
            const id = d['ID'];
            const orderId = d['訂單編號'] || '-';
            const orderDate = d['排單日期'] || d['訂單日期'] || '-';
            const customerName = d['顧客名稱'] || d['客戶名稱'] || d['客戶姓名'] || '-';
            const itemName = d['品項名稱'] || d['品項'] || '-';
            
            // 採用強健的關鍵字定位取值，解決 Google Sheet 表頭如「數量」與「訂購數量」的細微名稱差異
            const qty = parseFloat(getValueByKeyword(d, ['數量', 'qty'])) || 0;
            const unitPrice = getValueByKeyword(d, ['單價', 'price']) || 0;
            const subtotal = getValueByKeyword(d, ['小計', 'subtotal']) || 0;
            const status = getValueByKeyword(d, ['狀態', '排程']) || '-';

            return `
                <tr>
                    <td style="text-align: center;">
                        <input type="checkbox" class="smi-row-checkbox" data-id="${escapeHtml(id)}" style="cursor: pointer; transform: scale(1.1);">
                    </td>
                    <td class="fw-medium">${escapeHtml(orderId)}</td>
                    <td>${escapeHtml(orderDate)}</td>
                    <td>${escapeHtml(customerName)}</td>
                    <td>${escapeHtml(itemName)}</td>
                    <td class="fw-bold">${qty}</td>
                    <td>${formatAmount(unitPrice)}</td>
                    <td class="fw-bold text-accent">${formatAmount(subtotal)}</td>
                    <td>
                        <select class="form-control form-control-sm smi-row-status" data-id="${escapeHtml(id)}" style="cursor: pointer; font-weight: 500;">
                            <option value="${CONFIG.STATUS.PENDING}" ${status === CONFIG.STATUS.PENDING ? 'selected' : ''}>⏳ 待排程</option>
                            <option value="${CONFIG.STATUS.DONE}" ${status === CONFIG.STATUS.DONE ? 'selected' : ''}>✅ 已完成</option>
                            <option value="${CONFIG.STATUS.SHIPPED}" ${status === CONFIG.STATUS.SHIPPED ? 'selected' : ''}>📦 已出貨</option>
                        </select>
                    </td>
                </tr>
            `;
        }).join('');

        // 各品項獨立統計計算
        const itemStats = {};
        selectedItems.forEach(item => {
            itemStats[item] = { pending: 0, total: 0, unit: '個' };
        });

        scheduleData.forEach(d => {
            const name = String(d['品項名稱'] || d['品項'] || '').trim();
            const qty = parseFloat(getValueByKeyword(d, ['數量', 'qty'])) || 0;
            const status = String(getValueByKeyword(d, ['狀態', '排程'])).trim();
            
            if (itemStats[name]) {
                const menuItem = menuData.find(m => m['菜名'] === name);
                const isWeight = menuItem && String(menuItem['單價']).includes('*');
                itemStats[name].unit = isWeight ? 'g' : '個';
                
                itemStats[name].total += qty;
                if (status === CONFIG.STATUS.PENDING) {
                    itemStats[name].pending += qty;
                }
            }
        });

        // 動態渲染各品項卡片網格
        summaryArea.innerHTML = Object.keys(itemStats).map(itemName => {
            const stats = itemStats[itemName];
            return `
                <div class="card" style="margin-bottom: 0; border-left: 5px solid var(--color-primary); box-shadow: var(--shadow-sm); background: linear-gradient(to right, #fdfdfd, #ffffff); padding: 16px;">
                    <div style="font-weight: 700; font-size: 14px; color: var(--color-text); border-bottom: 1px solid var(--color-border); padding-bottom: 8px; margin-bottom: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(itemName)}">
                        🥘 ${escapeHtml(itemName)}
                    </div>
                    <div style="display: flex; justify-content: space-between; gap: 12px;">
                        <div style="flex: 1;">
                            <div style="font-size: 11px; font-weight: 600; color: #7a5c00;">⏳ 待排程</div>
                            <div style="font-size: 20px; font-weight: 700; color: var(--color-warning); margin-top: 4px;">
                                ${stats.pending.toLocaleString('zh-TW')} <span style="font-size: 12px; font-weight: normal; color: var(--color-text-secondary);">${stats.unit}</span>
                            </div>
                        </div>
                        <div style="flex: 1; border-left: 1px dashed var(--color-border); padding-left: 12px;">
                            <div style="font-size: 11px; font-weight: 600; color: #137333;">📊 總需求 (待+已)</div>
                            <div style="font-size: 20px; font-weight: 700; color: var(--color-success); margin-top: 4px;">
                                ${stats.total.toLocaleString('zh-TW')} <span style="font-size: 12px; font-weight: normal; color: var(--color-text-secondary);">${stats.unit}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        summaryArea.style.display = 'grid';
    }

    /** 表格勾選框全選 / 全取消 */
    function toggleSelectAll(el) {
        const checked = el.checked;
        document.querySelectorAll('.smi-row-checkbox').forEach(box => {
            box.checked = checked;
        });
    }

    /** 批次儲存勾選項目的排程狀態異動 */
    async function saveBatch() {
        const checkedBoxes = document.querySelectorAll('.smi-row-checkbox:checked');
        if (!checkedBoxes.length) {
            showToast('請先勾選欲修改狀態的排單項目！', 'warning');
            return;
        }

        // 整理異動更新清單
        const updates = [];
        for (const box of checkedBoxes) {
            const id = box.dataset.id;
            const statusSelect = document.querySelector(`.smi-row-status[data-id="${id}"]`);
            const newStatus = statusSelect ? statusSelect.value : '';

            // 尋找此筆排單的原始資料物件
            const originalObj = scheduleData.find(d => String(d['ID']) === String(id));
            if (!originalObj || !newStatus) continue;

            // 依據原始的 _scheduleHeaders 表頭定義還原為資料列陣列，並更新排程狀態欄位
            const rowValues = _scheduleHeaders.map(h => {
                if (h === 'ID') return id;
                const hk = String(h).trim();
                if (hk.includes('狀態') || hk.includes('排程')) return newStatus;
                return originalObj[h] !== undefined ? originalObj[h] : '';
            });

            updates.push({ id: id, rowValues: rowValues });
        }

        if (!updates.length) return;

        const ok = await showConfirm(`確定要儲存這 ${updates.length} 筆勾選排單的排程狀態異動嗎？`);
        if (!ok) return;

        showLoading(true);
        try {
            // 執行 Google Sheets 批次更新
            await Sheets.batchUpdateById(CONFIG.SHEETS.SCHEDULE, updates);
            showToast(`成功更新 ${updates.length} 筆排程狀態！`, 'success');
            
            // 重新查詢頁面，以獲得最新數據並重新運算加總
            await query();
        } catch (e) {
            showToast('儲存排程狀態失敗：' + e.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    /** 切換下拉多選選單面板顯示/隱藏 */
    function toggleDropdown(e) {
        if (e) e.stopPropagation();
        const panel = document.getElementById('smi-dropdown-panel');
        if (panel) {
            panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
        }
    }

    /** 下拉多選快捷按鈕設定 (全選 / 清除) */
    function selectPreset(type) {
        const checkboxes = document.querySelectorAll('.smi-item-checkbox');
        checkboxes.forEach(box => {
            box.checked = (type === 'all');
        });
        updateDropdownLabel();
    }

    /** 更新下拉按鈕上的選取文字 */
    function updateDropdownLabel() {
        const checkedBoxes = document.querySelectorAll('.smi-item-checkbox:checked');
        const label = document.getElementById('smi-dropdown-label');
        if (label) {
            if (checkedBoxes.length === 0) {
                label.textContent = '-- 請選擇產品品項 (已選 0 項) --';
            } else {
                label.textContent = `已選擇 ${checkedBoxes.length} 個品項`;
            }
        }
    }

    return { init, query, toggleSelectAll, saveBatch, toggleDropdown, selectPreset, updateDropdownLabel };
})();
