// ==============================
// 模組：後台密碼驗證
// ==============================
const Auth = (() => {
    let token = sessionStorage.getItem('admin_token') || null;

    function signIn() {
        const input = document.getElementById('admin-password').value;
        if (!input) {
            showToast('請輸入密碼', 'error');
            return;
        }
        token = input;
        sessionStorage.setItem('admin_token', token);
        document.getElementById('loginPrompt').style.display = 'none';
        App.onLogin(); // 這裡會觸發抓取資料，若密碼錯會在 sheets.js 接到後端報錯
    }

    function signOut() {
        token = null;
        sessionStorage.removeItem('admin_token');
        document.getElementById('loginPrompt').style.display = 'flex';
        document.getElementById('admin-password').value = '';
        App.onLogout();
    }

    function isLoggedIn() {
        return !!token;
    }

    function getToken() { 
        return token; 
    }

    function init() {
        if (isLoggedIn()) {
            document.getElementById('loginPrompt').style.display = 'none';
            // 給予 DOM 一點時間準備好
            setTimeout(App.onLogin, 100);
        } else {
            document.getElementById('loginPrompt').style.display = 'flex';
        }
    }

    return { init, signIn, signOut, isLoggedIn, getToken };
})();

// 給使用者方便：按 Enter 直接登入
document.addEventListener('DOMContentLoaded', () => {
    const pwdInput = document.getElementById('admin-password');
    if (pwdInput) {
        pwdInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') Auth.signIn();
        });
    }
});
