// ==============================
// 全域設定
// ==============================
const CONFIG = {
    CLIENT_ID: '76458665152-36qnj39f9qb1t3ujg030jagqrmepvihr.apps.googleusercontent.com',
    SPREADSHEET_ID: '1Lm6KlXy87KYDpDulfNJy7SCp3QCmJ3gkZeUJn2xIu9Q',
    SCOPES: 'https://www.googleapis.com/auth/spreadsheets',
    SHEETS: {
        ORDER_MAIN: '訂單主檔',
        ORDER_STATUS: '訂單狀態',
        SCHEDULE: '排單表',
        MENU: '菜單',
        EXPENSES: '支出紀錄'
    },
    // 排程狀態常數
    STATUS: {
        PENDING: '待排程',
        DONE: '已完成',
        SHIPPED: '已出貨'
    }
};
