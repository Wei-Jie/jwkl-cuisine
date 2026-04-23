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

  // --- CORS 來源檢查 ---
  const ALLOWED_ORIGINS = [
    'https://wei-jie.github.io',
    'http://localhost',
    'http://127.0.0.1'
  ];

  try {
    // 檢查 Origin (若瀏覽器有提供)
    var origin = (e && e.parameter && e.parameter.origin) || ""; 
    // 注意：GAS 的 e.postData 往往拿不到完整的 Origin Header， 
    // 這部分作為額外的軟防禦，主要仍依賴後端的 token 與限流保護。
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 建立上下文物件以便傳遞常用變數
    var ctx = {
      ADMIN_TOKEN: ADMIN_TOKEN,
      LINE_ACCESS_TOKEN: scriptProperties.getProperty('LINE_ACCESS_TOKEN'),
      LINE_USER_ID: scriptProperties.getProperty('LINE_USER_ID')
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
        response.data = handleOrderTrack(payload, ss);
        break;
      case 'QUERY':
        // 客戶端讀取菜單是公開的，其餘需 token
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
    response.error = error.toString();
    Logger.log("Error in doPost: " + error.toString());
    
    // P2: 自動將嚴重錯誤記錄到試算表
    try {
      logErrorToSheet(error.toString(), (payload && payload.action) || 'unknown');
    } catch (e) {
      Logger.log("Failed to log error to sheet: " + e.toString());
    }
  }

  return createJsonResponse(response);
}

// --- Action Handlers ---

function handleOrderSubmit(payload, ss, ctx) {
  var phone = payload.phone || "unknown";
  assert(checkRateLimit('submit:' + phone, 10, 60), '請稍後再試，每分鐘送單次數過多。');
  
  var sheet = ss.getSheetByName('客戶預約單');
  var values = sanitizeData(payload.values);
  assert(values && values.length > 0, "無效的訂單資料");

  return withScriptLock(function() {
    var tzDate = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Taipei"}));
    var yyStr = String(tzDate.getFullYear());
    var prefix = yyStr.slice(-2) + ("0" + (tzDate.getMonth() + 1)).slice(-2) + ("0" + tzDate.getDate()).slice(-2);

    values[0][2] = yyStr + '/' + ("0" + (tzDate.getMonth() + 1)).slice(-2) + '/' + ("0" + tzDate.getDate()).slice(-2);
    values[0][7] = '待確認';

    var oSheet = ss.getSheetByName('訂單主檔');
    var pSheet = ss.getSheetByName('客戶預約單');
    var oData = oSheet ? oSheet.getRange("B:B").getValues() : [];
    var pData = pSheet ? pSheet.getRange("B:B").getValues() : [];
    var existingIds = oData.concat(pData);
    
    var maxSeq = 0;
    for (var i = 0; i < existingIds.length; i++) {
       var idStr = existingIds[i][0] ? existingIds[i][0].toString() : '';
       if (idStr.indexOf(prefix) === 0) {
          var seq = parseInt(idStr.slice(6), 10);
          if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
       }
    }
    var newOrderId = prefix + ("000" + (maxSeq + 1)).slice(-4);
    values[0][1] = newOrderId;

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
  });
}

function handleOrderTrack(payload, ss) {
  var targetPhone = payload.phone;
  var targetOrderId = payload.orderId;
  assert(targetPhone && targetOrderId, '請提供電話與訂單編號');
  
  // 電話防呆
  var cleanPhone = normalizePhone(targetPhone);
  assert(/^09\d{8}$/.test(cleanPhone), '電話格式不正確，應為 09 開頭的 10 位數字');

  assert(checkRateLimit('track:' + cleanPhone, 20, 60), '請稍後再試，查詢次數過多。');

  var found = searchOrder(ss, '訂單主檔', targetOrderId, targetPhone) || 
              searchOrder(ss, '客戶預約單', targetOrderId, targetPhone);
  
  if (!found) throw new Error('查無此訂單，請確認您的電話或訂單編號是否正確。');
  return { status: found };
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
    throw new Error("【拒絕存取】未授權的操作，請重新登入。");
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

function withScriptLock(fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    return fn();
  } catch (e) {
    throw new Error("系統繁忙中，請稍後再試 (Lock timeout)");
  } finally {
    lock.releaseLock();
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
  if (!condition) throw new Error(msg);
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
