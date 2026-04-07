// ==============================
// Google OAuth 認證管理
// ==============================

const Auth = (() => {
    function getToken() { return 'GAS_MODE'; }
    function isLoggedIn() { return true; }

    function init() {
        updateUI(true);
        App.onLogin();
    }

    function signIn() { }
    function signOut() { }

    function updateUI(loggedIn) {
        document.getElementById('loginPrompt')?.classList.add('hidden');
        document.getElementById('signInBtn')?.classList.add('hidden');
        document.getElementById('userInfo')?.classList.remove('hidden');
        document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    }

    return { init, signIn, signOut, getToken, isLoggedIn };
})();

// DOM 載入後自動登入
window.addEventListener('load', () => {
    Auth.init();
});
