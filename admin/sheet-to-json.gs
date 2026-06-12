/**
 * 下関市補助金データ変換ツール
 * シート「補助金マスタ」「要件」から subsidies.json を生成します。
 */
const MASTER_SHEET = '補助金マスタ';
const REQUIREMENTS_SHEET = '要件';
const LANGUAGES = ['ja', 'en', 'zh', 'ko', 'vi'];
const VALID_TYPES = ['yesno', 'choice'];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('補助金データ')
    .addItem('JSONを書き出す', 'exportSubsidiesJson')
    .addItem('GitHubへ送信する', 'pushJsonToGitHub')
    .addToUi();
}

function exportSubsidiesJson() {
  const data = buildSubsidiesData_();
  const json = JSON.stringify(data, null, 2);
  const blob = Utilities.newBlob(json, 'application/json', 'subsidies.json');
  const file = DriveApp.createFile(blob);
  SpreadsheetApp.getUi().alert(
    '書き出し完了',
    'Googleドライブに subsidies.json を作成しました。\n' + file.getUrl(),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function buildSubsidiesData_() {
  const spreadsheet = SpreadsheetApp.getActive();
  const masterRows = readObjects_(spreadsheet.getSheetByName(MASTER_SHEET), MASTER_SHEET);
  const requirementRows = readObjects_(spreadsheet.getSheetByName(REQUIREMENTS_SHEET), REQUIREMENTS_SHEET);
  const seenIds = {};

  const subsidies = masterRows.map((row, index) => {
    const rowNumber = index + 2;
    requireValue_(row.id, MASTER_SHEET, rowNumber, 'id');
    requireValue_(row.category, MASTER_SHEET, rowNumber, 'category');
    requireValue_(row.name_ja, MASTER_SHEET, rowNumber, 'name_ja');
    if (seenIds[row.id]) throw new Error('idが重複しています: ' + row.id);
    seenIds[row.id] = true;

    return {
      id: String(row.id),
      category: String(row.category),
      name: languageObject_(row, 'name'),
      summary: languageObject_(row, 'summary'),
      amount: languageObject_(row, 'amount'),
      contact: {
        name: stringValue_(row.contact_name),
        tel: stringValue_(row.contact_tel),
        dept: stringValue_(row.contact_dept)
      },
      sourceUrl: stringValue_(row.source_url),
      kiyouUrl: stringValue_(row.kiyou_url),
      status: stringValue_(row.status) || 'active',
      note: languageObject_(row, 'note'),
      requirements: []
    };
  });

  const byId = {};
  subsidies.forEach((subsidy) => { byId[subsidy.id] = subsidy; });

  requirementRows.forEach((row, index) => {
    const rowNumber = index + 2;
    ['subsidy_id', 'req_id', 'group', 'question_ja', 'type'].forEach((column) => {
      requireValue_(row[column], REQUIREMENTS_SHEET, rowNumber, column);
    });
    if (!byId[row.subsidy_id]) {
      throw new Error('要件シートに未登録のsubsidy_idがあります: ' + row.subsidy_id);
    }
    if (VALID_TYPES.indexOf(String(row.type)) === -1) {
      throw new Error('typeはyesnoまたはchoiceにしてください（要件シート ' + rowNumber + '行）');
    }

    const requirement = {
      id: String(row.req_id),
      group: String(row.group),
      question: languageObject_(row, 'question'),
      type: String(row.type),
      required: booleanValue_(row.required)
    };
    if (requirement.type === 'choice') {
      try {
        requirement.choices = JSON.parse(String(row.choices || '[]'));
      } catch (error) {
        throw new Error('choicesが正しいJSONではありません（要件シート ' + rowNumber + '行）');
      }
      if (!Array.isArray(requirement.choices) || requirement.choices.length === 0) {
        throw new Error('choice型にはchoicesが必要です（要件シート ' + rowNumber + '行）');
      }
    }
    const duplicate = byId[row.subsidy_id].requirements.some((item) => item.id === requirement.id);
    if (duplicate) throw new Error(row.subsidy_id + '内でreq_idが重複しています: ' + requirement.id);
    byId[row.subsidy_id].requirements.push(requirement);
  });

  subsidies.forEach((subsidy) => {
    if (subsidy.requirements.length === 0) throw new Error('要件がありません: ' + subsidy.id);
  });

  const timeZone = spreadsheet.getSpreadsheetTimeZone() || 'Asia/Tokyo';
  return {
    version: Utilities.formatDate(new Date(), timeZone, 'yyyy.MM.dd'),
    lastUpdated: Utilities.formatDate(new Date(), timeZone, 'yyyy-MM-dd'),
    subsidies: subsidies
  };
}

function pushJsonToGitHub() {
  const properties = PropertiesService.getScriptProperties();
  const token = properties.getProperty('GITHUB_TOKEN');
  const owner = properties.getProperty('GITHUB_OWNER');
  const repo = properties.getProperty('GITHUB_REPO');
  const branch = properties.getProperty('GITHUB_BRANCH') || 'main';
  if (!token || !owner || !repo) {
    throw new Error('スクリプトプロパティに GITHUB_TOKEN、GITHUB_OWNER、GITHUB_REPO を設定してください。');
  }

  const path = 'data/subsidies.json';
  const apiUrl = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path;
  const headers = {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  const existing = UrlFetchApp.fetch(apiUrl + '?ref=' + encodeURIComponent(branch), {
    method: 'get',
    headers: headers,
    muteHttpExceptions: true
  });
  let sha = '';
  if (existing.getResponseCode() === 200) sha = JSON.parse(existing.getContentText()).sha;
  if (existing.getResponseCode() !== 200 && existing.getResponseCode() !== 404) {
    throw new Error('GitHubの既存ファイル確認に失敗しました: ' + existing.getContentText());
  }

  const json = JSON.stringify(buildSubsidiesData_(), null, 2);
  const payload = {
    message: 'Update subsidy data from Google Sheets',
    content: Utilities.base64Encode(json, Utilities.Charset.UTF_8),
    branch: branch
  };
  if (sha) payload.sha = sha;

  const response = UrlFetchApp.fetch(apiUrl, {
    method: 'put',
    headers: headers,
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error('GitHubへの送信に失敗しました: ' + response.getContentText());
  }
  SpreadsheetApp.getUi().alert('GitHubへ subsidies.json を送信しました。');
}

function readObjects_(sheet, sheetName) {
  if (!sheet) throw new Error('シート「' + sheetName + '」がありません。');
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1)
    .filter((row) => row.some((cell) => cell !== ''))
    .map((row) => {
      const object = {};
      headers.forEach((header, index) => { object[header] = row[index]; });
      return object;
    });
}

function languageObject_(row, prefix) {
  const object = {};
  LANGUAGES.forEach((language) => {
    const value = stringValue_(row[prefix + '_' + language]);
    if (value) object[language] = value;
  });
  return object;
}

function requireValue_(value, sheetName, rowNumber, column) {
  if (String(value || '').trim() === '') {
    throw new Error('必須項目が空です: ' + sheetName + ' ' + rowNumber + '行 ' + column);
  }
}

function stringValue_(value) {
  return String(value || '').trim();
}

function booleanValue_(value) {
  return ['true', '1', 'yes', 'はい'].indexOf(String(value).trim().toLowerCase()) !== -1;
}
