const GuestTrack = (() => {
    async function track() {
        // 修正 ID 以對齊 track.html
        const orderId = document.getElementById('track-id').value.trim();
        const rawPhone = document.getElementById('track-phone').value.trim();

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
            
            const resultBox = document.getElementById('result-box');
            const statusEl = document.getElementById('result-status');
            
            if (res.status === 'success') {
                resultBox.style.display = 'block';
                statusEl.textContent = '目前狀態：' + res.data.status;
                
                // 根據狀態給予顏色 (CSS class 需要存在於 style.css 或 HTML style 中)
                statusEl.style.color = (res.data.status === '已接單' || res.data.status === '已完成') ? '#27ae60' : '#e67e22';
                
            } else {
                resultBox.style.display = 'none';
                alert('查詢失敗：' + res.error);
            }
        } catch (e) {
            console.error(e);
            alert('查詢發生錯誤，請稍後再試。');
        } finally {
            showLoading(false);
        }
    }

    return { query: track };
})();

function showLoading(visible) {
    const el = document.getElementById('loading');
    if (el) el.style.display = visible ? 'flex' : 'none';
}
