const GuestTrack = (() => {

    function showLoading(visible) {
        const el = document.getElementById('loading');
        if (el) el.style.display = visible ? 'flex' : 'none';
    }

    async function query() {
        const phone = document.getElementById('track-phone').value.trim();
        const orderId = document.getElementById('track-id').value.trim();

        if (!phone || !orderId) {
            alert('請完整輸入聯絡電話與訂單編號。');
            return;
        }

        showLoading(true);
        const resultBox = document.getElementById('result-box');
        resultBox.style.display = 'none';

        try {
            const clientOrigin = (window.location && /^https?:\/\//.test(window.location.origin))
                ? window.location.origin
                : '';

            const payload = {
                action: 'TRACK_ORDER',
                clientOrigin: clientOrigin,
                phone: phone,
                orderId: orderId
            };
            const res = await Sheets.requestGAS(payload);

            if (res.status === 'success') {
                const statusStr = res.data.status;
                const statusEl = document.getElementById('result-status');
                const msgEl = document.getElementById('result-msg');

                resultBox.style.display = 'block';
                // 防禦性渲染：就算資料庫寫著舊版的待審核，對客人依舊顯示待確認
                const displayStatus = statusStr === '待審核' ? '待確認' : statusStr;
                statusEl.textContent = `狀態：${displayStatus}`;

                if (statusStr === '已接單') {
                    statusEl.style.color = '#27ae60';
                    msgEl.innerHTML = '您的預約已獲老闆確認！<br><br>請關注小灶私廚發出的 Email，當製作完成會發信通知您。';
                } else if (statusStr === '待確認' || statusStr === '待審核') {
                    statusEl.style.color = '#e67e22';
                    msgEl.innerHTML = '您的訂單正在等待老闆確認中，請稍候。<br>若有急需，可透過 IG 或 LINE 聯繫老闆。';
                } else {
                    statusEl.style.color = '#2c3e50';
                    msgEl.innerHTML = '請直接透過 Email 或 IG 關注進一步的消息。';
                }
            } else {
                throw new Error(res.error);
            }
        } catch (e) {
            alert('查詢失敗：' + e.message);
        } finally {
            showLoading(false);
        }
    }

    return { query };
})();
