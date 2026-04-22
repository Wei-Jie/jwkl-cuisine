@echo off
chcp 65001 > nul
echo.
echo  ┌─────────────────────────────────┐
echo  │   小灶私廚 訂單管理系統            │
echo  │   正在啟動本地伺服器...            │
echo  └─────────────────────────────────┘
echo.
echo  請稍候，瀏覽器將自動開啟...
echo  關閉此視窗即可停止伺服器。
echo.
npx.cmd --yes http-server -a localhost -p 8080 -c-1 -o
pause
