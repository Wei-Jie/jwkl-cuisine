const GuestTrack = (() => {
    async function track() {
        const orderId = document.getElementById('order-id').value.trim();
        const rawPhone = document.getElementById('cust-phone').value.trim();

        if (!orderId || !rawPhone) {
            alert('請輸入訂單編號與聯絡電話');
            return;
        }

        // 自動過濾電話中的連字號或其他非數字字元 (容錯處理)
        const cleanPhone = rawPhone.replace(/\D/g, '');
        if (!/^09\d{8}$/.test(cleanPhone)) {
            alert('電話格式不正確，應為 09 開頭的 10 位數字');
            return;
        }

        showLoading(true);
        try {
            const payload = {
                action: 'TRACK_ORDER',
                orderId: orderId,
                phone: cleanPhone
            };

            const res = await Sheets.requestGAS(payload);
            
            const resultDiv = document.getElementById('track-result');
            const statusEl = document.getElementById('order-status');
            
            if (res.status === 'success') {
                resultDiv.classList.remove('d-none');
                statusEl.textContent = res.data.status;
                
                // 根據狀態給予顏色
                statusEl.className = 'status-badge';
                if (res.data.status === '已接單') statusEl.classList.add('status-confirmed');
                else if (res.data.status === '已完成') statusEl.classList.add('status-done');
                else statusEl.classList.add('status-pending');
                
            } else {
                resultDiv.classList.add('d-none');
                alert('查詢失敗：' + res.error);
            }
        } catch (e) {
            alert('查詢發生錯誤，請稍後再試。');
        } finally {
            showLoading(false);
        }
    }

    return { track };
})();

function showLoading(visible) {
    const el = document.getElementById('loading');
    if (el) el.style.display = visible ? 'flex' : 'none';
}
