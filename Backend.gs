// 用來觸發首次寄信授權的函數 (僅供管理員點擊執行一次)
function setupMailAuth() {
  try {
    // 您也可以在這邊填寫您自己的信箱，如果執行成功，會收到一封測試信
    // MailApp.sendEmail("您的信箱", "授權測試成功", "這是一封來自系統的授權測試信件！");
    var userEmail = Session.getActiveUser().getEmail();
    if (userEmail) {
       MailApp.sendEmail(userEmail, "小灶私廚 - 寄信授權成功", "看見這封信，代表系統已經擁有自動寄信的安全權限囉！");
       Logger.log("授權已完成！已發送測試信至您的信箱: " + userEmail);
    } else {
       Logger.log("授權已完成！(無登入信箱)");
    }
  } catch (e) {
    Logger.log("需要進一步授權: " + e.toString());
  }
}

function doPost(e) {
  var response = { status: 'success', data: null, error: null };
  const scriptProperties = PropertiesService.getScriptProperties();
  const ADMIN_TOKEN = scriptProperties.getProperty('ADMIN_TOKEN');
  const REQUEST_ID = Utilities.getUuid();

  // --- 安全相關常數 ---
  const SECURITY_CONFIG = {
    LOCK_WAIT_MS: 10000,
    RATE_LIMIT_SUBMIT: { limit: 10, windowSec: 60 },
    RATE_LIMIT_TRACK: { limit: 20, windowSec: 60 }
  };

  // --- CORS 來源白名單（軟防禦） ---
  const ALLOWED_ORIGINS = [
    'https://wei-jie.github.io',
    'http://localhost',
    'http://127.0.0.1'
  ];

  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw knownError("No payload received");
    }

    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 注意：GAS 通常無法穩定取得真正 Origin Header，這裡使用客戶端回傳值作為軟防禦
    var reqOrigin = payload.clientOrigin || (e && e.parameter && e.parameter.origin) || '';
    
    // 放寬檢查：只要來源包含白名單中的關鍵網址即可
    var isAllowed = !reqOrigin || ALLOWED_ORIGINS.some(function(o) {
      return reqOrigin.toLowerCase().indexOf(o.toLowerCase()) !== -1;
    });

    if (!isAllowed) {
      throw knownError('【拒絕存取】來源未授權: ' + reqOrigin);
    }

    // 建立上下文物件以便傳遞常用變數
    var ctx = {
      ADMIN_TOKEN: ADMIN_TOKEN,
      LINE_ACCESS_TOKEN: scriptProperties.getProperty('LINE_ACCESS_TOKEN'),
      LINE_USER_ID: scriptProperties.getProperty('LINE_USER_ID'),
      SECURITY_CONFIG: SECURITY_CONFIG
    };

    // --- 路由與分發 ---
    switch (action) {
      case 'PING':
        response.data = { status: 'ok', serverTime: new Date().toISOString() };
        break;
      case 'SUBMIT_CUSTOMER_ORDER':
        response.data = handleOrderSubmit(payload, ss, ctx);
        break;
      case 'TRACK_ORDER':
        response.data = handleOrderTrack(payload, ss, ctx);
        break;
      case 'QUERY':
        if (payload.sheetName !== '菜單') {
          verifyAdmin(payload.token, ctx.ADMIN_TOKEN);
        }
        response.data = handleQuery(payload, ss);
        break;
      case 'SEND_EMAIL':
        verifyAdmin(payload.token, ctx.ADMIN_TOKEN);
        handleEmailSend(payload);
        break;
      case 'APPEND':
      case 'UPDATE_BY_ID':
      case 'BATCH_UPDATE':
      case 'BATCH_DELETE':
        verifyAdmin(payload.token, ctx.ADMIN_TOKEN);
        response.data = handleCrudAction(action, payload, ss);
        break;
      default:
        throw new Error("Unknown action: " + action);
    }

  } catch (error) {
    response.status = 'error';
    var isKnownError = error && error.name === 'KnownError';
    // 已知錯誤回傳明確訊息；未知錯誤才收斂
    response.error = isKnownError ? error.message : "系統忙碌中，請稍後再試。";
    response.errorType = isKnownError ? 'known' : 'unknown';
    response.requestId = REQUEST_ID;
    Logger.log("Error in doPost [" + REQUEST_ID + "]: " + error.toString());
    
    // 自動將嚴重錯誤記錄到試算表
    try {
      logErrorToSheet("[" + REQUEST_ID + "] " + error.toString(), (payload && payload.action) || 'unknown');
    } catch (e) {
      Logger.log("Failed to log error to sheet: " + e.toString());
    }
  }

  return createJsonResponse(response);
}

// --- Action Handlers ---

function handleOrderSubmit(payload, ss, ctx) {
  validateSubmitPayload(payload);
  var row = payload.values[0];
  var phone = normalizePhone(payload.phone || row[8] || '');
  assert(
    checkRateLimit(
      'submit:' + phone,
      ctx.SECURITY_CONFIG.RATE_LIMIT_SUBMIT.limit,
      ctx.SECURITY_CONFIG.RATE_LIMIT_SUBMIT.windowSec
    ),
    '請稍後再試，每分鐘送單次數過多。'
  );
  
  var sheet = ss.getSheetByName('客戶預約單');
  var values = sanitizeData(payload.values);
  assert(values && values.length > 0, "無效的訂單資料");

  return withScriptLock(function() {
    var newOrderId = getNextOrderIdFromConfig(ss);
    values[0][1] = newOrderId;
    
    // 重新取得當前台北時間日期字串，供訂單內容使用 (欄位索引 2 為日期, 7 為狀態)
    var tzDate = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Taipei"}));
    values[0][2] = Utilities.formatDate(tzDate, "Asia/Taipei", "yyyy/MM/dd");
    values[0][7] = '待確認';

    sheet.getRange(sheet.getLastRow() + 1, 1, values.length, values[0].length).setValues(values);

    // 發送通知 (異步概念)
    var orderData = values[0];
    
    // 去除訊息顯示用的單引號 (防注入前綴)
    function cleanMsg(val) {
      if (typeof val === 'string' && val.charAt(0) === "'") return val.slice(1);
      return val;
    }
    
    // 檢查金額是否已含 $
    var rawAmount = cleanMsg(orderData[5]);
    var displayAmount = (String(rawAmount).indexOf('$') === -1) ? '$' + rawAmount : rawAmount;

    var msg = "\n🔔 【小灶私廚】收到新預約！\n------------------\n👤 顧客：" + cleanMsg(orderData[3]) + 
              "\n📅 預定日期：" + cleanMsg(orderData[2]) + "\n💰 估計金額：" + displayAmount + 
              "\n💬 備註：" + (cleanMsg(orderData[6]) || "無") + "\n📱 聯繫：" + (cleanMsg(orderData[8]) || "未留") + 
              "\n------------------\n請至管理後台進行確認。";
    sendLinePush(ctx.LINE_ACCESS_TOKEN, ctx.LINE_USER_ID, msg);

    return { orderId: newOrderId };
  }, ctx.SECURITY_CONFIG.LOCK_WAIT_MS);
}

function handleOrderTrack(payload, ss, ctx) {
  var targetPhone = payload.phone;
  var targetOrderId = payload.orderId;
  assert(targetPhone && targetOrderId, '請提供電話與訂單編號');
  
  // 電話防呆
  var cleanPhone = normalizePhone(targetPhone);
  assert(/^09\d{8}$/.test(cleanPhone), '電話格式不正確，應為 09 開頭的 10 位數字');

  assert(
    checkRateLimit(
      'track:' + cleanPhone,
      ctx.SECURITY_CONFIG.RATE_LIMIT_TRACK.limit,
      ctx.SECURITY_CONFIG.RATE_LIMIT_TRACK.windowSec
    ),
    '請稍後再試，查詢次數過多。'
  );

  var found = searchOrder(ss, '訂單主檔', targetOrderId, targetPhone) || 
              searchOrder(ss, '客戶預約單', targetOrderId, targetPhone);
  
  if (!found) throw knownError('查無此訂單，請確認您的電話或訂單編號是否正確。');
  return { status: found };
}

/**
 * 從 SystemConfig 分頁獲取下一個訂單編號
 * 格式: YYMMDDXXXX (例如 2404290001)
 */
function getNextOrderIdFromConfig(ss) {
  var configSheet = ss.getSheetByName('SystemConfig');
  assert(configSheet, "找不到 SystemConfig 分頁，請確認分頁名稱正確。");

  // 取得台北時間
  var tzDate = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Taipei"}));
  var todayStr = Utilities.formatDate(tzDate, "Asia/Taipei", "yyyy/MM/dd");
  var prefix = Utilities.formatDate(tzDate, "Asia/Taipei", "yyMMdd");

  // 動態尋找欄位索引
  var headers = configSheet.getRange(1, 1, 1, configSheet.getLastColumn()).getValues()[0];
  var dateIdx = -1;
  var seqIdx = -1;

  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i]).trim();
    if (h === 'last_order_date') dateIdx = i;
    if (h === 'last_sequence') seqIdx = i;
  }

  assert(dateIdx !== -1 && seqIdx !== -1, "SystemConfig 缺少必要欄位: last_order_date 或 last_sequence");

  // 讀取目前的日期與序號 (在第二行)
  var configData = configSheet.getRange(2, 1, 1, headers.length).getValues()[0];
  var lastDate = configData[dateIdx];
  
  // 處理 lastDate
  var lastDateStr = "";
  if (Object.prototype.toString.call(lastDate) === '[object Date]') {
    lastDateStr = Utilities.formatDate(lastDate, "Asia/Taipei", "yyyy/MM/dd");
  } else {
    lastDateStr = String(lastDate);
  }

  var lastSeq = parseInt(configData[seqIdx]) || 0;

  var newSeq;
  if (lastDateStr === todayStr) {
    newSeq = lastSeq + 1;
  } else {
    newSeq = 1; // 新的一天，重置序號
  }

  // 回寫更新對應欄位
  configSheet.getRange(2, dateIdx + 1).setValue(todayStr);
  configSheet.getRange(2, seqIdx + 1).setValue(newSeq);

  return prefix + ("000" + newSeq).slice(-4);
}


function handleQuery(payload, ss) {
  var sheet = ss.getSheetByName(payload.sheetName);
  assert(sheet, "Sheet not found: " + payload.sheetName);
  var rawData = sheet.getDataRange().getValues();
  return rawData.map(function(row) {
    return row.map(function(cell) {
      if (Object.prototype.toString.call(cell) === '[object Date]') {
        return cell.getFullYear() + '/' + ('0' + (cell.getMonth()+1)).slice(-2) + '/' + ('0' + cell.getDate()).slice(-2);
      }
      return cell;
    });
  });
}

function handleCrudAction(action, payload, ss) {
  var sheet = ss.getSheetByName(payload.sheetName);
  assert(sheet, "Sheet not found: " + payload.sheetName);

  if (action === 'APPEND') {
    var values = sanitizeData(payload.values);
    if (values && values.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, values.length, values[0].length).setValues(values);
    }
  } else if (action === 'UPDATE_BY_ID') {
    var rowIndex = findRowById(sheet, payload.id);
    assert(rowIndex !== -1, "UUID not found: " + payload.id);
    var newValues = sanitizeData([payload.rowValues])[0];
    sheet.getRange(rowIndex, 1, 1, newValues.length).setValues([newValues]);
  } else if (action === 'BATCH_UPDATE') {
    batchUpdateRows(sheet, payload.updates);
  } else if (action === 'BATCH_DELETE') {
    batchDeleteRows(sheet, payload.ids);
  }
  return null;
}

function handleEmailSend(payload) {
  assert(payload.to && payload.subject && payload.htmlBody, "缺少郵件必要欄位");
  MailApp.sendEmail({
    to: payload.to,
    subject: payload.subject,
    htmlBody: payload.htmlBody
  });
}

// --- 輔助邏輯函式 ---

function verifyAdmin(token, adminToken) {
  if (!token || token !== adminToken) {
    throw knownError("【拒絕存取】未授權的操作，請重新登入。");
  }
}

/**
 * Schema Adapter: 取得欄位名稱與索引的映射表
 * 解決「電話」vs「手機」等欄位微差問題
 */
function getHeaderMap(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastRow() === 0 ? 1 : sheet.getLastColumn()).getValues()[0];
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i]).trim();
    if (h.includes("ID") || h === "id") map.uuid = i;
    if (h.includes("編號")) map.id = i;
    if (h.includes("電話") || h.includes("手機")) map.phone = i;
    if (h.includes("狀態")) map.status = i;
    if (h.includes("姓名") || h.includes("顧客")) map.name = i;
    if (h.includes("金額")) map.amount = i;
    if (h.includes("日期")) {
       if (h.includes("出貨")) map.shipDate = i;
       else map.orderDate = i;
    }
  }
  return map;
}

function searchOrder(ss, sheetName, orderId, phone) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return null;
  
  var hMap = getHeaderMap(sheet);
  assert(hMap.id !== undefined && hMap.phone !== undefined, "表格結構不完整(缺少編號或電話): " + sheetName);
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (String(row[hMap.id]) === String(orderId) && phoneEquals(row[hMap.phone], phone)) {
      if (sheetName === '訂單主檔') return '已接單';
      return row[hMap.status] !== undefined ? row[hMap.status] : '待確認';
    }
  }
  return null;
}

function batchUpdateRows(sheet, updates) {
  var dataRange = sheet.getDataRange();
  var data = dataRange.getValues();
  var idToRowMap = {};
  for (var i = 0; i < data.length; i++) {
    if (data[i][0]) idToRowMap[data[i][0]] = i;
  }
  var updated = false;
  for (var j = 0; j < updates.length; j++) {
    var rIndex = idToRowMap[updates[j].id];
    if (rIndex !== undefined) {
      var newRow = sanitizeData([updates[j].rowValues])[0];
      for (var c = 0; c < data[0].length; c++) {
        data[rIndex][c] = (c < newRow.length) ? newRow[c] : '';
      }
      updated = true;
    }
  }
  if (updated) dataRange.setValues(data);
}

function batchDeleteRows(sheet, idsToDelete) {
  var dataRange = sheet.getDataRange();
  var data = dataRange.getValues();
  var newData = data.filter(function(row, i) {
    return i === 0 || idsToDelete.indexOf(row[0]) === -1;
  });
  if (newData.length < data.length) {
    dataRange.clearContent();
    sheet.getRange(1, 1, newData.length, newData[0].length).setValues(newData);
  }
}

// --- 安全與工具函式 ---

function normalizePhone(input) {
  if (!input) return '';
  var s = String(input).trim();
  if (s.charAt(0) === "'") s = s.slice(1);
  return s.replace(/\D/g, '');
}

function phoneEquals(a, b) {
  return normalizePhone(a) === normalizePhone(b);
}

function withScriptLock(fn, waitMs) {
  var lock = LockService.getScriptLock();
  var locked = false;
  try {
    lock.waitLock(waitMs || 10000);
    locked = true;
    return fn();
  } catch (e) {
    throw knownError("系統繁忙中，請稍後再試 (Lock timeout)");
  } finally {
    if (locked) lock.releaseLock();
  }
}

function checkRateLimit(key, limit, windowSec) {
  var cache = CacheService.getScriptCache();
  var raw = cache.get(key);
  var count = raw ? parseInt(raw, 10) : 0;
  if (count >= limit) return false;
  cache.put(key, String(count + 1), windowSec);
  return true;
}

function assert(condition, msg) {
  if (!condition) throw knownError(msg);
}

function knownError(msg) {
  var err = new Error(msg);
  err.name = 'KnownError';
  return err;
}

function isAllowedOrigin(origin, allowedOrigins) {
  var o = normalizeOrigin(origin);
  if (!o) return false;
  for (var i = 0; i < allowedOrigins.length; i++) {
    if (o === normalizeOrigin(allowedOrigins[i])) return true;
  }
  return false;
}

function normalizeOrigin(value) {
  try {
    return new URL(String(value)).origin.toLowerCase();
  } catch (e) {
    return '';
  }
}

function validateSubmitPayload(payload) {
  assert(payload && payload.values && payload.values.length > 0, '缺少送單資料');
  var row = payload.values[0];
  assert(row && row.length >= 11, '送單資料欄位不足');

  var customer = String(row[3] || '').trim();
  var rawPhone = row[8] || '';
  var itemsRaw = row[4] || '[]';
  var phone = normalizePhone(rawPhone);

  assert(customer, '顧客姓名不可為空');
  assert(/^09\d{8}$/.test(phone), '電話格式錯誤，應為 09 開頭的 10 位數字');

  var items = [];
  try {
    items = JSON.parse(itemsRaw);
  } catch (e) {
    throw knownError('品項格式錯誤');
  }
  assert(items && items.length > 0, '至少需要一個品項');
}

function sanitizeData(dataArray) {
  if (!dataArray) return dataArray;
  return dataArray.map(function(row) {
    return row.map(function(cell) {
      if (typeof cell === 'string') {
        var firstChar = cell.charAt(0);
        if ('=+-@'.indexOf(firstChar) !== -1) return "'" + cell;
      }
      return cell;
    });
  });
}

// --- 工具函式 ---

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function findRowById(sheet, id) {
  var idColValues = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
  for (var i = 0; i < idColValues.length; i++) {
    if (idColValues[i][0] == id) return i + 1;
  }
  return -1;
}

function createIdMap(sheet) {
  var idColValues = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
  var map = {};
  for (var i = 0; i < idColValues.length; i++) {
    if (idColValues[i][0]) map[idColValues[i][0]] = i + 1;
  }
  return map;
}

// --- P2: 監控與日誌 ---

function logErrorToSheet(errorMsg, action) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var logSheet = ss.getSheetByName('系統日誌');
  
  if (!logSheet) {
    logSheet = ss.insertSheet('系統日誌');
    logSheet.appendRow(['時間', '操作項目', '錯誤內容', '狀態']);
    logSheet.getRange("1:1").setFontWeight("bold").setBackground("#f3f3f3");
    logSheet.setFrozenRows(1);
  }
  
  var time = new Date().toLocaleString("zh-TW", {timeZone: "Asia/Taipei"});
  logSheet.appendRow([time, action, errorMsg, '嚴重']);
}

function sendLinePush(token, userId, message) {
  var url = "https://api.line.me/v2/bot/message/push";
  var payload = {
    "to": userId,
    "messages": [{ "type": "text", "text": message }]
  };
  var options = {
    "method": "post",
    "headers": {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token
    },
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };
  UrlFetchApp.fetch(url, options);
}

function doOptions(e) {
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT);
}
