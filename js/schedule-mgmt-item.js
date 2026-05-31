// ==========================================
// 模組七：品項排單管理by品項
// ==========================================

const ScheduleMgmtItem = (() => {
    let menuData = [];
    let scheduleData = [];
    let _scheduleHeaders = [];
    let selectedItem = '';

    /** 初始化品項排單頁面 */
    async function init() {
        const page = document.getElementById('page-schedule-mgmt-item');
        if (!page) return;
        
        // 渲染極具質感的 SPA 頁面架構，並搭配小灶私廚風格的藍色與漸變 Metric Cards
        page.innerHTML = `
            <div class="page-header">
                <h1 class="page-title">品項排單管理</h1>
                <span class="text-secondary text-sm">依產品品項查詢排單明細與訂購數量統計，並可批次修改排程狀態</span>
            </div>

            <div class="card" style="margin-bottom: 20px;">
                <div class="filter-row">
                    <div class="form-group" style="min-width: 280px;">
                        <label class="form-label">選擇產品品項</label>
                        <select id="smi-item-select" class="form-control">
                            <option value="">-- 請選擇產品品項 --</option>
                        </select>
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
                    <table class="data-table">
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

            <!-- 下方指標加總區 (配合訂購數量進行加總運算) -->
            <div id="smi-summary-area" style="display: none; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-top: 16px;">
                <div class="card" style="margin-bottom: 0; background: linear-gradient(135deg, var(--color-warning-light) 0%, #ffffff 100%); border-left: 5px solid var(--color-warning); box-shadow: var(--shadow-sm);">
                    <div style="font-size: 13px; font-weight: 600; color: #7a5c00;">⏳ 「待排程」訂購數量加總</div>
                    <div id="smi-sum-pending" style="font-size: 28px; font-weight: 700; color: #7a5c00; margin-top: 8px;">0</div>
                </div>
                <div class="card" style="margin-bottom: 0; background: linear-gradient(135deg, var(--color-success-light) 0%, #ffffff 100%); border-left: 5px solid var(--color-success); box-shadow: var(--shadow-sm);">
                    <div style="font-size: 13px; font-weight: 600; color: #137333;">📊 「已完成 ＋ 待排程」訂購數量加總</div>
                    <div id="smi-sum-total" style="font-size: 28px; font-weight: 700; color: #137333; margin-top: 8px;">0</div>
                </div>
            </div>
        `;

        showLoading(true);
        try {
            // 讀取菜單列表，取得所有曾上架或歷史的菜名
            const menu = await App.getMenu();
            menuData = [...new Set(menu.map(m => m['菜名']).filter(Boolean))].sort();
            
            const select = document.getElementById('smi-item-select');
            if (select) {
                select.innerHTML = `<option value="">-- 請選擇產品品項 --</option>` + 
                    menuData.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');

                // 若之前已有選取的品項，則自動帶入
                if (selectedItem && menuData.includes(selectedItem)) {
                    select.value = selectedItem;
                    query();
                }
            }
        } catch (e) {
            showToast('載入產品清單失敗：' + e.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    /** 執行排單查詢 */
    async function query() {
        const select = document.getElementById('smi-item-select');
        const val = select ? select.value : '';
        if (!val) {
            showToast('請選擇產品品項', 'warning');
            return;
        }

        selectedItem = val;
        showLoading(true);

        try {
            // 載入排單表，並將表頭暫存以供後續寫回時進行欄位定位與還原
            const rows = await Sheets.getSheet(CONFIG.SHEETS.SCHEDULE);
            _scheduleHeaders = rows[0] || [];
            const allItems = rowsToObjects(rows);

            // 過濾條件：品項名稱與下拉完全相同，且狀態為「待排程」或「已完成」
            scheduleData = allItems.filter(item => {
                const name = String(item['品項名稱'] || item['品項'] || '').trim();
                const status = String(getValueByKeyword(item, ['狀態', '排程']) || '').trim();
                return name === selectedItem && (status === CONFIG.STATUS.PENDING || status === CONFIG.STATUS.DONE);
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

        titleEl.textContent = `【${selectedItem}】排單明細`;
        tableCard.style.display = 'block';

        if (!scheduleData.length) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center text-secondary">沒有符合條件的排單紀錄（需為「待排程」或「已完成」狀態）</td></tr>`;
            
            // 指標值歸零
            document.getElementById('smi-sum-pending').textContent = '0';
            document.getElementById('smi-sum-total').textContent = '0';
            summaryArea.style.display = 'grid';
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

        // 計算訂購數量加總 (採用強健的關鍵字定位取值)
        // 1. 「待排程」訂購數量加總
        const pendingSum = scheduleData
            .filter(d => String(getValueByKeyword(d, ['狀態', '排程'])).trim() === CONFIG.STATUS.PENDING)
            .reduce((sum, d) => sum + (parseFloat(getValueByKeyword(d, ['數量', 'qty'])) || 0), 0);

        // 2. 「已完成 ＋ 待排程」訂購數量加總
        const totalSum = scheduleData
            .reduce((sum, d) => sum + (parseFloat(getValueByKeyword(d, ['數量', 'qty'])) || 0), 0);

        // 更新至對應 Metric Cards，精緻化單位呈現
        document.getElementById('smi-sum-pending').textContent = `${pendingSum.toLocaleString('zh-TW')} 個/公克`;
        document.getElementById('smi-sum-total').textContent = `${totalSum.toLocaleString('zh-TW')} 個/公克`;
        
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

    return { init, query, toggleSelectAll, saveBatch };
})();
