function doPost(e) {
  var response = { status: 'success', data: null, error: null };
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  // --- LINE 設定 ---
  const LINE_ACCESS_TOKEN = 'xO0OvpA7qtZQ9c0Q8il9RtDy/z5h+Gk1/Fb2YRfv/W1khwRK3VTcTLcd/BkyLUc/RfxDgUWnW91Pbz0+Pb1Iq18sYtuPjhVfgi0XFq8U1GDSqeMuD9I7U1HfRKWm2FVWZQQ/NpqwB2DJF0kkV0HnXQdB04t89/1O/w1cDnyilFU=';
  const LINE_USER_ID = 'U9f797bc74612c5ad127b83b498ba33ac';

  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("No payload received");
    }

    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 處理特定的複合型行動
    if (action === 'SUBMIT_CUSTOMER_ORDER') {
      var sheet = ss.getSheetByName('客戶預約單');
      var values = payload.values; // [[...]]
      if (values && values.length > 0) {
        sheet.getRange(sheet.getLastRow() + 1, 1, values.length, values[0].length).setValues(values);
        
        // 發送 LINE 通知
        var orderData = values[0];
        var msg = "\n🔔 【小灶私廚】收到新預約！\n" +
                  "------------------\n" +
                  "👤 顧客：" + orderData[3] + "\n" +
                  "📅 預計日期：" + orderData[2] + "\n" +
                  "💰 估計金額：$" + orderData[5] + "\n" +
                  "💬 備註：" + (orderData[6] || "無") + "\n" +
                  "📱 聯繫：" + (orderData[8] || "未留") + "\n" +
                  "------------------\n" +
                  "請至管理後台進行審核。";
        sendLinePush(LINE_ACCESS_TOKEN, LINE_USER_ID, msg);
      }
      return createJsonResponse(response);
    }

    // 通用型行動
    var sheetName = payload.sheetName;
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error("Sheet not found: " + sheetName);

    if (action === 'QUERY') {
      response.data = sheet.getDataRange().getDisplayValues();
    } 
    else if (action === 'APPEND') {
      var values = payload.values;
      if (values && values.length > 0) {
        sheet.getRange(sheet.getLastRow() + 1, 1, values.length, values[0].length).setValues(values);
      }
    } 
    else if (action === 'UPDATE_BY_ID') {
      var id = payload.id;
      var newValues = payload.rowValues;
      var rowIndex = findRowById(sheet, id);
      if (rowIndex !== -1) {
        sheet.getRange(rowIndex, 1, 1, newValues.length).setValues([newValues]);
      } else {
        throw new Error("UUID not found: " + id);
      }
    } 
    else if (action === 'BATCH_UPDATE') {
       var updates = payload.updates;
       var idToRowMap = createIdMap(sheet);
       for (var j = 0; j < updates.length; j++) {
          var rowIndex = idToRowMap[updates[j].id];
          if (rowIndex) {
             sheet.getRange(rowIndex, 1, 1, updates[j].rowValues.length).setValues([updates[j].rowValues]);
          }
       }
    }
    else if (action === 'BATCH_DELETE') {
       var idsToDelete = payload.ids;
       var idColValues = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
       var rowsToDelete = [];
       for (var i = 0; i < idColValues.length; i++) {
          if (idsToDelete.indexOf(idColValues[i][0]) !== -1) rowsToDelete.push(i + 1);
       }
       rowsToDelete.sort(function(a, b){ return b - a; }).forEach(function(r) {
           sheet.deleteRow(r);
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
