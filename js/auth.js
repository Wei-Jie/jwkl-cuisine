// ==============================
// Google OAuth 認證管理
// ==============================

const Auth = (() => {
    let tokenClient = null;
    let accessToken = null;
    let tokenExpiry = null;

    function getToken() { return accessToken; }
    function isLoggedIn() { return !!accessToken && Date.now() < tokenExpiry; }

    /** 初始化（在 GIS 載入後呼叫） */
    function init() {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CONFIG.CLIENT_ID,
            scope: CONFIG.SCOPES,
            callback: onTokenResponse
        });
    }

    function onTokenResponse(resp) {
        if (resp.error) {
            showToast('登入失敗：' + resp.error, 'error');
            return;
        }
        accessToken = resp.access_token;
        tokenExpiry = Date.now() + (resp.expires_in - 60) * 1000;
        // 55 分鐘後自動更新 token
        setTimeout(() => { if (isLoggedIn()) tokenClient.requestAccessToken({ prompt: '' }); }, (resp.expires_in - 65) * 1000);

        updateUI(true);
        App.onLogin();
    }

    function signIn() {
        if (!tokenClient) { showToast('Google 服務尚未載入，請稍後再試', 'error'); return; }
        tokenClient.requestAccessToken({ prompt: 'select_account' });
    }

    function signOut() {
        if (accessToken) google.accounts.oauth2.revoke(accessToken, () => {});
        accessToken = null;
        tokenExpiry = null;
        updateUI(false);
        App.onLogout();
    }

    function updateUI(loggedIn) {
        document.getElementById('loginPrompt').classList.toggle('hidden', loggedIn);
        document.getElementById('signInBtn').classList.toggle('hidden', loggedIn);
        document.getElementById('userInfo').classList.toggle('hidden', !loggedIn);
        document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    }

    return { init, signIn, signOut, getToken, isLoggedIn };
})();

// GIS 載入完成後初始化
window.addEventListener('load', () => {
    if (window.google?.accounts?.oauth2) {
        Auth.init();
    } else {
        // 等待 GIS 載入
        const check = setInterval(() => {
            if (window.google?.accounts?.oauth2) {
                clearInterval(check);
                Auth.init();
            }
        }, 200);
    }
});
