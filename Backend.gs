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
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  // --- LINE 密碼與後台密碼 (透過 GAS 專案設定安全讀取) ---
  const scriptProperties = PropertiesService.getScriptProperties();
  const LINE_ACCESS_TOKEN = scriptProperties.getProperty('LINE_ACCESS_TOKEN');
  const LINE_USER_ID = scriptProperties.getProperty('LINE_USER_ID');
  const ADMIN_TOKEN = scriptProperties.getProperty('ADMIN_TOKEN');

  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("No payload received");
    }

    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // [資安防護] 清洗公式注入：若字串以 = + - @ 開頭，自動追加單引號
    function sanitizeData(dataArray) {
       if (!dataArray) return dataArray;
       for (var r = 0; r < dataArray.length; r++) {
         for (var c = 0; c < dataArray[r].length; c++) {
           var cell = dataArray[r][c];
           if (typeof cell === 'string') {
             var firstChar = cell.charAt(0);
             if (firstChar === '=' || firstChar === '+' || firstChar === '-' || firstChar === '@') {
               dataArray[r][c] = "'" + cell;
             }
           }
         }
       }
       return dataArray;
    }

    // 處理特定的複合型行動 (開放對外)
    if (action === 'SUBMIT_CUSTOMER_ORDER') {
      var sheet = ss.getSheetByName('客戶預約單');
      var values = sanitizeData(payload.values); // [[...]]
      var newOrderId = "";
      if (values && values.length > 0) {
        // [產生訂單編號與伺服器強制校時]
        var tzDate = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Taipei"}));
        var yyStr = String(tzDate.getFullYear());
        var yy = yyStr.slice(-2);
        var mm = ("0" + (tzDate.getMonth() + 1)).slice(-2);
        var dd = ("0" + tzDate.getDate()).slice(-2);
        var prefix = yy + mm + dd;

        var hh = ("0" + tzDate.getHours()).slice(-2);
        var mins = ("0" + tzDate.getMinutes()).slice(-2);
        
        // 強制校時，以系統台灣時間為準
        var tzDate = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Taipei"}));
        var yyStr = String(tzDate.getFullYear());
        var mm = ("0" + (tzDate.getMonth() + 1)).slice(-2);
        var dd = ("0" + tzDate.getDate()).slice(-2);
        
        // 覆寫日期欄位與狀態，標註為台灣日期
        values[0][2] = yyStr + '/' + mm + '/' + dd; // 訂單日期
        values[0][7] = '待確認'; // 狀態

        var maxSeq = 0;
        // 爬取保留字號
        var oSheet = ss.getSheetByName('訂單主檔');
        var pSheet = ss.getSheetByName('客戶預約單');
        var oData = oSheet ? oSheet.getRange("B:B").getValues() : [];
        var pData = pSheet ? pSheet.getRange("B:B").getValues() : [];
        
        var existingIds = oData.concat(pData);
        for (var i = 0; i < existingIds.length; i++) {
           var idStr = existingIds[i][0] ? existingIds[i][0].toString() : '';
           if (idStr.indexOf(prefix) === 0) {
              var seq = parseInt(idStr.slice(6), 10);
              if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
           }
        }
        maxSeq++;
        newOrderId = prefix + ("000" + maxSeq).slice(-4);
        
        // 寫入訂單編號
        values[0][1] = newOrderId;

        sheet.getRange(sheet.getLastRow() + 1, 1, values.length, values[0].length).setValues(values);
        
        // 發送 LINE 通知 (索引對齊新結構)
        var orderData = values[0];
        var msg = "\n🔔 【小灶私廚】收到新預約！\n" +
                  "------------------\n" +
                  "👤 顧客：" + orderData[3] + "\n" +
                  "📅 預定日期：" + orderData[2] + "\n" +
                  "💰 估計金額：" + orderData[5] + "\n" +
                  "💬 備註：" + (orderData[6] || "無") + "\n" +
                  "📱 聯繫：" + (orderData[8] || "未留") + "\n" +
                  "------------------\n" +
                  "請至管理後台進行確認。";
        sendLinePush(LINE_ACCESS_TOKEN, LINE_USER_ID, msg);
      }
      response.data = { orderId: newOrderId };
      return createJsonResponse(response);
    }
    
    // --- 查詢追蹤訂單 (供客戶自助查詢，不需 token) ---
    if (action === 'TRACK_ORDER') {
      var targetPhone = payload.phone;
      var targetOrderId = payload.orderId;
      var found = null;

      function getHeaderMap(row) {
        var map = {};
        for (var i = 0; i < row.length; i++) {
          var h = String(row[i]).trim();
          if (h.includes("編號")) map.id = i;
          if (h.includes("電話")) map.phone = i;
          if (h.includes("狀態")) map.status = i;
        }
        return map;
      }

      // 查訂單主檔 (已接單/完成)
      var oSheet = ss.getSheetByName('訂單主檔');
      if (oSheet) {
          var oData = oSheet.getDataRange().getValues();
          if (oData.length > 1) {
            var oMap = getHeaderMap(oData[0]);
            for(var i=1; i<oData.length; i++){
                var row = oData[i];
                var orderId = row[oMap.id] || "";
                var phone = row[oMap.phone] || "";
                if(orderId.toString() === targetOrderId.toString() && phone.toString().indexOf(targetPhone) !== -1){
                    found = '已接單';
                    break;
                }
            }
          }
      }

      // 查預約單 (待確認)
      if (!found) {
          var pSheet = ss.getSheetByName('客戶預約單');
          if (pSheet) {
              var pData = pSheet.getDataRange().getValues();
              if (pData.length > 1) {
                var pMap = getHeaderMap(pData[0]);
                for(var i=1; i<pData.length; i++){
                    var row = pData[i];
                    var orderId = row[pMap.id] || "";
                    var phone = row[pMap.phone] || "";
                    if(orderId.toString() === targetOrderId.toString() && phone.toString().indexOf(targetPhone) !== -1){
                        found = row[pMap.status] || '待確認';
                        break;
                    }
                }
              }
          }
      }

      if (!found) {
          throw new Error('查無此訂單，請確認您的電話或訂單編號是否正確。');
      }

      response.data = { status: found };
      return createJsonResponse(response);
    }

    // --- 特例：公開唯讀請求 ---
    var isPublicMenuQuery = (action === 'QUERY' && payload.sheetName === '菜單');
    var isEmailSend = (action === 'SEND_EMAIL');

    // --- 內部管理行動 (需驗證密碼) ---
    if (!isPublicMenuQuery && !isEmailSend) {
       if (!payload.token || payload.token !== ADMIN_TOKEN) {
          throw new Error("【拒絕存取】未授權的操作，請重新登入。");
       }
    }

    var sheetName = payload.sheetName;
    var sheet = null;
    if (!isEmailSend) {
      sheet = ss.getSheetByName(sheetName);
      if (!sheet) throw new Error("Sheet not found: " + sheetName);
    }

    // [效能優化 1] 查詢時，改用 getValues 並手動轉日期，避開 getDisplayValues 渲染引擎造成的 3 倍延遲
    if (action === 'QUERY') {
      var rawData = sheet.getDataRange().getValues();
      response.data = rawData.map(function(row) {
          return row.map(function(cell) {
              if (Object.prototype.toString.call(cell) === '[object Date]') {
                  return cell.getFullYear() + '/' + 
                         ('0' + (cell.getMonth()+1)).slice(-2) + '/' + 
                         ('0' + cell.getDate()).slice(-2);
              }
              return cell;
          });
      });
    } 
    else if (action === 'APPEND') {
      var values = sanitizeData(payload.values);
      if (values && values.length > 0) {
        sheet.getRange(sheet.getLastRow() + 1, 1, values.length, values[0].length).setValues(values);
      }
    } 
    else if (action === 'UPDATE_BY_ID') {
      var id = payload.id;
      var newValues = sanitizeData([payload.rowValues])[0];
      var rowIndex = findRowById(sheet, id);
      if (rowIndex !== -1) {
        sheet.getRange(rowIndex, 1, 1, newValues.length).setValues([newValues]);
      } else {
        throw new Error("UUID not found: " + id);
      }
    } 
    else if (action === 'BATCH_UPDATE') {
       // [效能優化 2] 全記憶體處理，將原本「迴圈內 N 次更新」改為「1 次整張表覆寫」
       var updates = payload.updates;
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
       if (updated) {
          dataRange.setValues(data);
       }
    }
    else if (action === 'BATCH_DELETE') {
       // [效能優化 3] 拋棄 deleteRow，改用陣列過濾後覆寫整表，刪除 100 筆資料也是 1 秒內完成
       var idsToDelete = payload.ids;
       var dataRange = sheet.getDataRange();
       var data = dataRange.getValues();
       
       var newData = [];
       for (var i = 0; i < data.length; i++) {
          // 保留表頭，或是不在刪除名單內的資料列
          if (i === 0 || idsToDelete.indexOf(data[i][0]) === -1) {
             newData.push(data[i]);
          }
       }
       
       if (newData.length < data.length) {
          dataRange.clearContent();
          sheet.getRange(1, 1, newData.length, newData[0].length).setValues(newData);
       }
    }
    else if (action === 'SEND_EMAIL') {
       if (!payload.token || payload.token !== ADMIN_TOKEN) {
           throw new Error("【拒絕存取】未授權的操作，請重新登入。");
       }
       MailApp.sendEmail({
           to: payload.to,
           subject: payload.subject,
           htmlBody: payload.htmlBody
       });
    }
    else {
      throw new Error("Unknown action: " + action);
    }
  } catch (error) {
    response.status = 'error';
    response.error = error.toString();
  }

  return createJsonResponse(response);
}

// 輔助函式
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
