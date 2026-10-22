/**
 * ============================================================================
 * 🧪 아르봇(ARBOT, 툴민 논증 챗봇) - 최종 통합 백엔드 스크립트
 * (★ 학생 수업 환경 최적화: Flash 모델 기본값 및 자동 탐색 엔진 탑재)
 * (★ 대시보드 F2 탐구주제 필터링 + B~F 6열 구조 반영: 2026-07-23)
 * ============================================================================
 */

let CACHED_MODEL_NAME = "";

// ============================================================================
// 환경설정·기본설정 탭의 고정 칸. 값은 B열, 설명은 A열(이름표)·C열(메모)이다. 행을 끼우거나 지우면 주소가 밀리니 숨기기만 할 것.
// 위치를 바꿀 때는 이 상수들과 Guide.html 의 시트 구조 표, tests/gas_harness.js 의 가짜 시트만 고치면 된다(코드 곳곳에 주소를 쓰지 않는다).
//   환경설정:  B1 기본 Gemini API 키 · B2 백업 스프레드시트 ID(선택) · B3 사용할 Gemini 모델(비우면 자동)
//   기본설정:  B1 금지어 · B2 학급 목록 · B3 모둠 목록 · B4 탐구 주제 목록 (쉼표로 구분)
// ============================================================================
var ENV_KEY_CELL_ = 'B1';
var ENV_BACKUP_CELL_ = 'B2';
var ENV_MODEL_CELL_ = 'B3';
var ENV_MODEL_LABEL_CELL_ = 'A3';
var ENV_RANGE_ = 'B1:B3';        // 키 · 백업 ID · 모델 (위에서부터)
var CFG_BANNED_CELL_ = 'B1';
var CFG_CLASSES_CELL_ = 'B2';
var CFG_GROUPS_CELL_ = 'B3';
var CFG_TOPICS_CELL_ = 'B4';
var CFG_ALL_RANGE_ = 'B1:B4';    // 금지어 · 학급 · 모둠 · 주제 (위에서부터)
var CFG_LISTS_RANGE_ = 'B2:B4';  // 학급 · 모둠 · 주제 (위에서부터)

// ============================================================================
// [JSON API] 외부에 별도로 호스팅된 프론트엔드(정적 웹앱)가 이 GAS 웹 앱을
// API 서버처럼 호출한다. 화면(HTML)은 더 이상 이 프로젝트가 렌더링하지 않는다.
//   - GET  {웹앱URL}?_action=getInitialData
//   - GET  {웹앱URL}?_action=testConnection
//   - POST {웹앱URL}  body(text/plain, JSON 문자열): { ...payload, _action: "processChatMessage" }
//   - POST {웹앱URL}  body(text/plain, JSON 문자열): { ...payload, _action: "teacherAnalyze" }
// CORS 프리플라이트(OPTIONS)를 피하기 위해 프론트엔드는 항상 GET 또는
// Content-Type: text/plain 인 POST만 사용해야 한다 (커스텀 헤더 금지).
// 라우팅 키를 "action"이 아니라 "_action"으로 쓰는 이유: 교사 설정 중
// "행동 지침" 필드 이름도 action이라서, 겹치는 이름을 쓰면 저장 시 서로
// 덮어써지는 충돌이 생긴다 (실제로 한 번 겪은 버그).
// ============================================================================

// GET 은 상태 확인용 한 줄만 돌려준다. 비밀번호·수업 입장 코드가 주소창(쿼리스트링)에 남지 않도록
// 모든 기능은 POST 로만 받는다.
function doGet(e) {
  return jsonResponse({ success: true, service: "argumentation-chatbot", note: "이 주소는 POST 요청만 처리해요." });
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ success: false, error: "요청 본문이 올바른 JSON이 아닙니다." });
  }
  if (!body || typeof body !== "object") {
    return jsonResponse({ success: false, error: "요청 본문이 올바른 JSON이 아닙니다." });
  }
  return jsonResponse(routeAction(body._action, body));
}

// 핵심 탭(환경설정·기본설정·채팅기록)이 지워지거나 이름이 바뀌었을 때, 'Cannot read properties of null' 같은 내부 오류 문구 대신
// 무엇을 해야 하는지 알려 준다. (탭이 없어도 되는 곳 — 초기화, 세부설정 탭 등 — 은 getSheetByName 을 직접 쓴다)
function requireSheet_(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error("스프레드시트에서 '" + name + "' 탭을 찾을 수 없어요. 탭 이름이 바뀌었거나 지워졌는지 확인해 주세요. (선생님께 알려 주세요)");
  return sh;
}

// ---------------------------------------------------------------------------
// 접근 통제 (두 겹)
//  1) 교사 전용 action: 교사 비밀번호(pin)가 맞아야 한다. 비밀번호가 아직 없으면 **모두 거부**한다(기본이 닫힌 상태).
//     학생 링크에 이 웹앱 주소가 들어 있으므로, 비밀번호가 선택 사항이면 누구나 API 키·학생 대화를 읽을 수 있기 때문이다.
//     최초 설정은 웹이 아니라 스프레드시트 메뉴(setTeacherPinFromMenu)에서만 한다 — 시트 편집 권한이 있는 사람만 할 수 있다.
//  2) 학생 입구(getInitialData·processChatMessage): 교사가 정한 '수업 입장 코드'(accessCode)가 맞아야 한다.
//     주소만 아는 외부인이 대화방을 쓰거나 학급·모둠 목록을 보지 못하게 하고, 코드를 바꾸면 이미 퍼진 링크도 무효가 된다.
// ---------------------------------------------------------------------------
var TEACHER_ACTIONS_ = ["teacherAnalyze", "getChatOverview", "listGeminiModels", "testGeminiModel", "getTeacherSettings",
  "getTopicMaterials", "saveTopicMaterial", "saveTeacherSettings", "setTeacherPin", "getApiKeys", "saveApiKeys", "resetApiKeyStatus",
  "getProfiles", "saveProfile", "deleteProfile", "saveTopicSetting", "getAccessCode", "setAccessCode"];
var STUDENT_ACTIONS_ = ["getInitialData", "processChatMessage", "getSessionFeedback"]; // 수업 입장 코드가 필요한 공개 action
// 이 GAS 코드의 API 버전. testConnection 이 알려 주고, 교사 콘솔은 자기가 요구하는 버전(REQUIRED_API_VERSION)보다 낮으면
// "시트의 GAS 가 옛 버전이에요"를 안내한다 (콘솔은 모두가 공유하지만 GAS 는 시트마다 따로 배포되기 때문).
// 콘솔이 새 action 을 쓰기 시작하면 이 숫자와 콘솔의 REQUIRED_API_VERSION 을 함께 올린다. (버전 1 = 이 값이 없던 옛 코드)
var API_VERSION_ = 4; // 3: getChatOverview (결과 분석의 학급 → 주제 → 모둠 단추가 기록 유무를 표시), 4: getSessionFeedback (탐구 시간이 끝나면 학생에게 100자 피드백) + 날짜별 분석 (getChatOverview 의 dates, teacherAnalyze 의 dateValue)
var PIN_HASH_PROP_ = "TEACHER_PIN_HASH";
var PIN_SALT_PROP_ = "TEACHER_PIN_SALT";
var PIN_MIN_LENGTH_ = 8;
var ACCESS_CODE_PROP_ = "STUDENT_ACCESS_CODE"; // 정규화된(대문자·공백 없음) 코드를 Script Properties 에 둔다. 교사가 학생에게 알려 줘야 해서 해시가 아니라 원문이다.
var ACCESS_CODE_ALPHABET_ = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32자: 헷갈리는 I·O·0·1 제외
var ACCESS_CODE_LENGTH_ = 6;
var ACCESS_CODE_MIN_ = 6, ACCESS_CODE_MAX_ = 12; // 4자리 숫자는 몇 분 만에 맞힐 수 있어 허용하지 않는다

function hashPin_(pin, salt) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + "|" + pin, Utilities.Charset.UTF_8);
  return bytes.map(function(b) { return ("0" + (b & 0xff).toString(16)).slice(-2); }).join("");
}

function isTeacherPinSet_() {
  return !!PropertiesService.getScriptProperties().getProperty(PIN_HASH_PROP_);
}

var SETUP_NEEDED_MSG_ = "교사 비밀번호를 먼저 정해 주세요. 스프레드시트 상단 메뉴 '🗣️ 아르봇(ARBOT) → 🔐 교사 비밀번호 설정'에서 정할 수 있어요.";

// 통과하면 null, 아니면 거부 응답을 돌려준다. 비밀번호가 아직 없으면 거부한다(needSetup).
function checkTeacherAuth_(params) {
  var props = PropertiesService.getScriptProperties();
  var stored = props.getProperty(PIN_HASH_PROP_);
  if (!stored) return { success: false, needSetup: true, error: SETUP_NEEDED_MSG_ };
  var pin = (params && params.pin != null) ? String(params.pin) : "";
  if (pin && hashPin_(pin, props.getProperty(PIN_SALT_PROP_) || "") === stored) return null;
  if (pin) Utilities.sleep(800); // 틀린 시도는 느리게 만들어 무차별 대입을 늦춘다
  return { success: false, needPin: true, error: pin ? "교사 비밀번호가 맞지 않아요." : "교사 비밀번호가 필요해요." };
}

// 비밀번호를 저장한다 (길이만 검사). 웹에서는 현재 비밀번호를 확인한 뒤에만(routeAction), 최초 설정은 시트 메뉴에서만 부른다.
function setTeacherPin_(p) {
  var newPin = String((p && p.newPin) || "");
  if (newPin.length < PIN_MIN_LENGTH_) return { success: false, error: "비밀번호는 " + PIN_MIN_LENGTH_ + "자 이상으로 정해 주세요." };
  var salt = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperties({ TEACHER_PIN_SALT: salt, TEACHER_PIN_HASH: hashPin_(newPin, salt) });
  return { success: true };
}

// 비밀번호를 잊었을 때: Apps Script 편집기에서 이 함수를 직접 실행하면 비밀번호가 해제된다 (스크립트 소유자만 가능).
// 해제하면 교사 기능이 다시 잠기므로, 시트 메뉴 '🔐 교사 비밀번호 설정'으로 새로 정한다.
function resetTeacherPin() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(PIN_HASH_PROP_);
  props.deleteProperty(PIN_SALT_PROP_);
  Logger.log("교사 비밀번호를 해제했습니다. 시트 메뉴 '🔐 교사 비밀번호 설정'에서 새로 정해 주세요.");
}

// ---- 수업 입장 코드 ----
function normalizeAccessCode_(v) {
  return String(v == null ? "" : v).replace(/[\s\-]+/g, "").toUpperCase();
}
function isValidAccessCode_(c) {
  return new RegExp("^[A-Z0-9]{" + ACCESS_CODE_MIN_ + "," + ACCESS_CODE_MAX_ + "}$").test(c);
}
// 무작위 코드: UUID(v4)의 무작위 16진수 두 자리(0~255)를 32로 나눈 나머지로 글자를 고른다 (256 이 32 의 배수라 치우침이 없다)
function generateAccessCode_() {
  var hex = Utilities.getUuid().replace(/-/g, ""), out = "";
  for (var i = 0; i < ACCESS_CODE_LENGTH_; i++) out += ACCESS_CODE_ALPHABET_.charAt(parseInt(hex.substr(i * 2, 2), 16) % ACCESS_CODE_ALPHABET_.length);
  return out;
}
function readAccessCode_() {
  return String(PropertiesService.getScriptProperties().getProperty(ACCESS_CODE_PROP_) || "");
}
// 없으면 만든다 (교사 전용 경로·시트 메뉴에서만 부른다: 학생 입구가 코드를 만들어 주면 안 된다)
function ensureAccessCode_() {
  var code = readAccessCode_();
  if (code) return code;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    code = readAccessCode_();
    if (!code) { code = generateAccessCode_(); PropertiesService.getScriptProperties().setProperty(ACCESS_CODE_PROP_, code); }
  } finally { lock.releaseLock(); }
  return code;
}
// [API] 교사 전용: 현재 코드 (없으면 만들어서)
function getAccessCode() {
  return { success: true, code: ensureAccessCode_() };
}
// [API] 교사 전용: { regenerate: true } 로 새로 만들거나 { code } 로 직접 정한다. 바꾸면 이전 코드는 즉시 무효가 된다.
function setAccessCode(p) {
  var code;
  if (p && p.regenerate === true) code = generateAccessCode_();
  else {
    code = normalizeAccessCode_(p && p.code);
    if (!isValidAccessCode_(code)) return { success: false, error: "코드는 영문 대문자·숫자 " + ACCESS_CODE_MIN_ + "~" + ACCESS_CODE_MAX_ + "자로 정해 주세요. (짧은 숫자 코드는 쉽게 맞힐 수 있어서 쓸 수 없어요)" };
  }
  PropertiesService.getScriptProperties().setProperty(ACCESS_CODE_PROP_, code);
  return { success: true, code: code };
}
// 학생 입구용. 통과하면 null. 코드가 아직 없으면 거부한다(기본이 닫힌 상태). 틀린 시도는 느리게 만든다.
function checkAccessCode_(params) {
  var stored = readAccessCode_();
  if (!stored) return { success: false, needCode: true, error: "선생님이 아직 수업 입장 코드를 정하지 않았어요. 선생님께 알려 주세요." };
  var given = normalizeAccessCode_(params && params.accessCode);
  if (given && given === stored) return null;
  if (given) Utilities.sleep(1000);
  return { success: false, needCode: true, error: given ? "수업 입장 코드가 맞지 않아요. 선생님이 알려 준 코드를 다시 확인해 주세요." : "수업 입장 코드를 입력해 주세요." };
}

// ---- 학생 입구 입력 검증 (processChatMessage 로 들어가기 전, routeAction 에서) ----
var CHAT_MAX_QUESTION_ = 1000;   // 학생 한 번의 발화 최대 글자 수
var CHAT_MAX_FIELD_ = 100;       // 학급·모둠·주제 이름 최대 글자 수
var CHAT_MAX_HISTORY_ = 60;      // 서버가 받는 이전 대화 최대 개수(오래된 것부터 버림)
var CHAT_MAX_HISTORY_TEXT_ = 6000;
var RATE_GROUP_PER_MIN_ = 20;    // 한 모둠이 1분에 보낼 수 있는 요청 수
var RATE_ALL_PER_MIN_ = 200;     // 전체 학생이 1분에 보낼 수 있는 요청 수 (API 할당량 보호)

// 고정 창(window) 방식의 간단한 횟수 제한. 캐시는 원자적이지 않아 근사치지만 남용을 막기에는 충분하다. 넘으면 true.
function rateLimited_(key, max, windowSec) {
  var cache = CacheService.getScriptCache(), now = new Date().getTime(), st = null;
  try { var raw = cache.get(key); st = raw ? JSON.parse(raw) : null; } catch (e) {}
  if (!st || now - st.t0 >= windowSec * 1000) st = { t0: now, n: 0 };
  st.n++;
  try { cache.put(key, JSON.stringify(st), windowSec); } catch (e2) {}
  return st.n > max;
}

// 통과하면 null (필요하면 params.history 를 정리해 둔다), 아니면 거부 응답.
// noQuestion: 학생 글이 없는 요청(탐구 마무리 피드백)은 userQuestion 을 보지 않는다. 학급·모둠·주제·기록·횟수 제한은 똑같이 검사한다.
function validateChatRequest_(p, noQuestion) {
  var asText = function(v, max) { return typeof v === "string" && v.trim().length > 0 && v.length <= max; };
  if (!noQuestion && !asText(p.userQuestion, CHAT_MAX_QUESTION_)) {
    return { success: false, error: typeof p.userQuestion === "string" && p.userQuestion.length > CHAT_MAX_QUESTION_
      ? "한 번에 쓸 수 있는 글은 " + CHAT_MAX_QUESTION_ + "자까지예요. 조금 나눠서 보내 주세요." : "보낼 내용을 입력해 주세요." };
  }
  if (!asText(p.classValue, CHAT_MAX_FIELD_) || !asText(p.groupValue, CHAT_MAX_FIELD_) || !asText(p.topicValue, CHAT_MAX_FIELD_)) {
    return { success: false, error: "학급·모둠·탐구 주제를 확인할 수 없어요. 화면을 새로고침해 다시 입장해 주세요." };
  }
  // 시트의 학급·모둠·주제 목록에 있는 값만 받는다 (다른 모둠을 사칭하거나 기록을 어지럽히는 요청 차단).
  // 맞는 항목은 시트에 적힌 그대로의 이름으로 바꿔 기록한다 — 앞뒤 공백·대소문자만 다른 이름으로 경고 횟수 세기를 피하지 못하게.
  var lists = requireSheet_("기본설정").getRange(CFG_LISTS_RANGE_).getValues();
  var canonical = function(listCell, v) {
    var want = normalizeTopic_(v), items = String(listCell || "").split(",");
    for (var i = 0; i < items.length; i++) { var t = items[i].trim(); if (t && normalizeTopic_(t) === want) return t; }
    return null;
  };
  var cls = canonical(lists[0][0], p.classValue), grp = canonical(lists[1][0], p.groupValue), tpc = canonical(lists[2][0], p.topicValue);
  if (!cls || !grp || !tpc) {
    return { success: false, error: "선택한 학급·모둠·탐구 주제가 목록에 없어요. 화면을 새로고침해 다시 입장해 주세요." };
  }
  p.classValue = cls; p.groupValue = grp; p.topicValue = tpc;
  // 이전 대화: 형식이 맞는 것만, 최근 것만, 항목당 길이 제한
  var clean = [];
  (Array.isArray(p.history) ? p.history : []).forEach(function(h) {
    if (h && (h.role === "ai" || h.role === "user") && typeof h.text === "string" && h.text) {
      clean.push({ role: h.role, text: h.text.slice(0, CHAT_MAX_HISTORY_TEXT_) });
    }
  });
  p.history = clean.slice(-CHAT_MAX_HISTORY_);
  // 횟수 제한 (모둠별 + 전체)
  var gKey = "rlg_" + keyHash_(normalizeTopic_(p.classValue) + "|" + normalizeTopic_(p.groupValue));
  if (rateLimited_(gKey, RATE_GROUP_PER_MIN_, 60) || rateLimited_("rl_all", RATE_ALL_PER_MIN_, 60)) {
    return { success: false, error: "요청이 너무 빨라요. 잠깐 쉬었다가 다시 보내 주세요." };
  }
  return null;
}

// 오류 문구에 API 키가 든 URL(...?key=AIza...)이 섞여 나가지 않게 가린다
function maskSecrets_(msg) {
  return String(msg == null ? "" : msg).replace(/key=[^&\s"']+/g, "key=***");
}

// 화면에 보여 줄 키: 앞 4자와 뒤 4자만. 보내 온 값이 이 모양(••••)이면 '바꾸지 않음'으로 본다.
var KEY_MASK_ = "••••";
function maskKey_(k) {
  k = String(k || "");
  return k.length > 8 ? k.slice(0, 4) + KEY_MASK_ + k.slice(-4) : (k ? KEY_MASK_ : "");
}
function isMaskedKey_(v) { return String(v == null ? "" : v).indexOf(KEY_MASK_) !== -1; }

function routeAction(action, params) {
  try {
    params = params || {};
    if (TEACHER_ACTIONS_.indexOf(action) !== -1) {
      var denied = checkTeacherAuth_(params);
      if (denied) return denied;
    }
    if (STUDENT_ACTIONS_.indexOf(action) !== -1) {
      var codeDenied = checkAccessCode_(params);
      if (codeDenied) return codeDenied;
      if (action === "processChatMessage" || action === "getSessionFeedback") {
        var invalid = validateChatRequest_(params, action === "getSessionFeedback");
        if (invalid) return invalid;
      }
    }
    switch (action) {
      case "testConnection":
        // 비밀번호가 아직 없거나 틀리면 시트 이름·주소도 알려 주지 않는다
        var activeSs = SpreadsheetApp.getActiveSpreadsheet();
        var pinSet = isTeacherPinSet_();
        var authorized = pinSet && checkTeacherAuth_(params) === null;
        return { success: true, version: API_VERSION_, pinSet: pinSet, needSetup: !pinSet, authorized: authorized,
          sheetName: authorized ? activeSs.getName() : "", sheetUrl: authorized ? activeSs.getUrl() : "" };
      case "setTeacherPin":
        return setTeacherPin_(params);
      case "getAccessCode":
        return getAccessCode();
      case "setAccessCode":
        return setAccessCode(params);
      case "getApiKeys":
        return getApiKeys();
      case "saveApiKeys":
        return saveApiKeys(params);
      case "resetApiKeyStatus":
        return resetApiKeyStatus();
      case "getInitialData":
        return { success: true, data: getInitialData() };
      case "processChatMessage":
        return processChatMessage(params);
      case "getSessionFeedback":
        return getSessionFeedback(params);
      case "teacherAnalyze":
        return apiAnalyze(params.classValue, params.groupValue, params.topicValue, params.useMaterial, params.rubricName, params.dateValue);
      case "getChatOverview":
        return apiChatOverview();
      case "listGeminiModels":
        return listGeminiModels(params);
      case "testGeminiModel":
        return testGeminiModel(params);
      case "getTeacherSettings":
        return { success: true, data: getTeacherSettings() };
      case "getTopicMaterials":
        return getTopicMaterials();
      case "saveTopicMaterial":
        return saveTopicMaterial(params);
      case "saveTeacherSettings":
        return saveTeacherSettings(params);
      case "getProfiles":
        return getProfiles();
      case "saveProfile":
        return saveProfile(params);
      case "deleteProfile":
        return deleteProfile(params);
      case "saveTopicSetting":
        return saveTopicSetting(params);
      default:
        return { success: false, error: "알 수 없는 action 입니다: " + action };
    }
  } catch (err) {
    return { success: false, error: maskSecrets_(err.message) };
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** 스프레드시트를 열 때 상단 메뉴를 만든다 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🗣️ 아르봇(ARBOT)')
    .addItem('📖 사용 가이드', 'showGuide_')
    .addItem('ℹ️ 정보', 'showAbout_')
    .addSeparator()
    .addItem('🔐 교사 비밀번호 설정', 'setTeacherPinFromMenu')
    .addItem('🔑 수업 입장 코드 보기', 'showAccessCodeFromMenu')
    .addItem('🔄 주제 세부설정 맞추기', 'syncTopicRowsFromMenu')
    .addItem('🩺 시트 구조 점검', 'checkSheetStructureFromMenu')
    .addSeparator()
    .addItem('⚠️ 설정·기록 초기화…', 'resetSheetToDefaultsFromMenu')
    .addToUi();
}

// 시트 메뉴: 교사 비밀번호 설정/재설정. 이 시트를 열 수 있는(편집 권한이 있는) 사람만 실행할 수 있다.
// 웹 콘솔은 비밀번호가 정해지기 전에는 아무것도 열어 주지 않으므로, 처음에는 반드시 이 메뉴로 정한다.
function setTeacherPinFromMenu() {
  var ui = SpreadsheetApp.getUi();
  var first = ui.prompt('🔐 교사 비밀번호 설정',
    '교사 콘솔에 들어갈 때 쓸 비밀번호를 정해 주세요. (' + PIN_MIN_LENGTH_ + '자 이상)\n이미 정해 둔 비밀번호가 있으면 새 비밀번호로 바뀝니다.', ui.ButtonSet.OK_CANCEL);
  if (first.getSelectedButton() !== ui.Button.OK) return;
  var pin = String(first.getResponseText() || '');
  if (pin.length < PIN_MIN_LENGTH_) { ui.alert('다시 정해 주세요', '비밀번호는 ' + PIN_MIN_LENGTH_ + '자 이상이어야 해요.', ui.ButtonSet.OK); return; }
  var again = ui.prompt('비밀번호 확인', '같은 비밀번호를 한 번 더 입력해 주세요.', ui.ButtonSet.OK_CANCEL);
  if (again.getSelectedButton() !== ui.Button.OK) return;
  if (String(again.getResponseText() || '') !== pin) { ui.alert('다시 정해 주세요', '두 번 입력한 비밀번호가 달라요.', ui.ButtonSet.OK); return; }
  var r = setTeacherPin_({ newPin: pin });
  if (!r.success) { ui.alert('설정하지 못했어요', r.error, ui.ButtonSet.OK); return; }
  var code = ensureAccessCode_();
  ui.alert('비밀번호를 정했어요',
    '이제 교사 콘솔에서 이 비밀번호로 들어갈 수 있어요. 잊어버리지 않게 적어 두세요.\n\n학생이 대화방에 들어갈 때 쓰는 수업 입장 코드는 ' + code + ' 예요. (교사 콘솔의 "학생 배부 링크 & QR"에서 바꿀 수 있어요)', ui.ButtonSet.OK);
}

// 시트 메뉴: 주제 목록(기본설정 B4)에 맞춰 '주제 세부설정' 탭에 주제별 줄을 만든다.
// 교사 콘솔에서 주제 목록을 저장하면 자동으로 맞춰지므로, 시트에서 목록 칸을 직접 고쳤을 때 쓴다. 값이 든 줄은 지우지 않는다.
function syncTopicRowsFromMenu() {
  var ui = SpreadsheetApp.getUi();
  var r = syncTopicRows_();
  if (!r.success) { ui.alert('🔄 주제 세부설정 맞추기', '맞추지 못했어요: ' + r.error, ui.ButtonSet.OK); return; }
  var lines = [];
  if (r.added) lines.push("새로 만든 줄 " + r.added + "개: " + r.addedTopics.join(', '));
  if (r.removed) lines.push("주제 목록에서 빠진 주제의 빈 줄 " + r.removed + "개를 지웠어요.");
  if (!lines.length) lines.push("이미 주제 목록과 맞아요. 바꿀 것이 없어요.");
  ui.alert('🔄 주제 세부설정 맞추기', lines.join('\n') + "\n\n빈 칸은 '(기본)' 줄을 따라요. 주제별로 페르소나·루브릭·제한 시간을 정하려면 그 줄의 칸을 채우세요. 값이 든 줄은 지우지 않아요.", ui.ButtonSet.OK);
}

// 시트 메뉴: 수업 입장 코드 확인 (없으면 만들어 보여 준다)
function showAccessCodeFromMenu() {
  var ui = SpreadsheetApp.getUi();
  ui.alert('🔑 수업 입장 코드', '학생이 대화방에 들어갈 때 입력하는 코드예요:\n\n' + ensureAccessCode_() + '\n\n바꾸려면 교사 콘솔의 "학생 배부 링크 & QR"에서 새 코드를 만드세요.', ui.ButtonSet.OK);
}

/**
 * 메뉴 > 사용 가이드: 시트 구조와 사용법을 설명하는 창(Guide.html).
 * 순수 안내문이라 시트·설정·스크립트 속성을 읽거나 쓰지 않는다. 시트를 보며 읽을 수 있게 모달리스 창으로 띄운다.
 * 시트 탭·칸을 바꾸면 Guide.html 의 '시트 구조' 표도 함께 고친다(tests/gas_guide.test.js 가 탭 이름이 빠졌는지 확인한다).
 */
function showGuide_() {
  var html = HtmlService.createHtmlOutputFromFile('Guide').setWidth(800).setHeight(640);
  SpreadsheetApp.getUi().showModelessDialog(html, '📖 아르봇(ARBOT) 사용 가이드');
}

/** 메뉴 > 정보 클릭 시 뜨는 안내창 */
function showAbout_() {
  var ui = SpreadsheetApp.getUi();
  var msg =
    '버전 v2.0 (2026.10) · API v' + API_VERSION_ + '\n\n' +
    '제작\n두리쌤\n\n' +
    '이용 조건\n' +
    '· 교육 목적으로 자유롭게 사용하실 수 있습니다.\n' +
    '· 재배포 시 출처(제작자 표기)를 유지해주세요.\n' +
    '· 코드를 임의로 수정한 버전을 다시 배포하지 말아주세요.\n' +
    '· 수정이 필요하시면 아래 연락처로 요청해주세요.\n\n' +
    '데이터 안내\n' +
    '· 학생 대화 기록(학급·모둠·주제·대화 내용)은 선생님의 스프레드시트에만 저장됩니다.\n' +
    '· 답변과 논증 분석을 만들기 위해 학생 대화와 탐구 자료가 Google Gemini API로 전달됩니다(선생님이 넣은 API 키로).\n' +
    '· 무료 등급 키를 쓰면 Google이 전달된 내용을 서비스 개선에 쓸 수 있습니다. 학생에게 이름·연락처 같은 개인정보를 쓰지 않도록 안내해 주세요.\n' +
    '· 제작자는 이 데이터에 접근하지 않습니다.\n\n' +
    '문의\n' +
    '· Instagram: trdoolee\n' +
    '· 간단한 질문 위주로 답변드리며, 답변이 늦어질 수 있습니다.';
  ui.alert('🗣️ 아르봇(ARBOT)', msg, ui.ButtonSet.OK);
}

// ---------------------------------------------------------
// [JSON API 전용] 교사 관리 콘솔의 "기본 설정"·"주제 설정" 메뉴에서 사용.
// 환경설정·기본설정(공통 목록)과 세부설정 탭의 기본 줄을 웹에서 한번에 읽고/쓸 수 있게 한다.
// ---------------------------------------------------------
function getTeacherSettings() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var env = requireSheet_('환경설정').getRange(ENV_RANGE_).getValues();
  var config = requireSheet_('기본설정').getRange(CFG_ALL_RANGE_).getValues();
  // 페르소나·루브릭·제한 시간·기억 쌍은 '세부설정' 탭의 기본 줄에 있다 (옛 콘솔과 같은 이름으로 돌려준다)
  var base = readBaseValues_();

  var primaryKey = String(env[0][0] || '').trim();
  return {
    geminiApiKey: maskKey_(primaryKey), // 키 원문은 화면으로 내려보내지 않는다 (앞4자…뒤4자만)
    geminiApiKeySet: !!primaryKey,
    backupSheetId: env[1][0] || '',
    geminiModel: env[2][0] || '',

    bannedWords: config[0][0] || '',
    classList: config[1][0] || '',
    groupList: config[2][0] || '',
    topicList: config[3][0] || '',

    role: base.persona.role,
    action: base.persona.action,
    restrict: base.persona.restrict,
    exception: base.persona.exception,
    extra: base.persona.extra,
    characterId: base.persona.characterId,
    characterName: base.persona.characterName,
    greeting: base.persona.greeting,
    templateKey: base.persona.templateKey,
    timeLimitMinutes: positiveInt_(base.topic.timeLimitMinutes) || '',
    windowPairs: positiveInt_(base.topic.windowPairs) || '',

    rubricRole: base.rubric.role,
    rubricCriteria: base.rubric.criteria,
    rubricLevel: base.rubric.level,
    rubricGuideline: base.rubric.guideline
  };
}

function saveTeacherSettings(s) {
  // 안전장치: 핵심 칸(역할·학급 목록·API 키·평가 기준)이 전부 비어 있는 요청은
  // 아직 시트 내용을 불러오지 못한 채 눌린 저장일 가능성이 매우 높으므로 거부한다.
  // (빈 폼이 시트를 통째로 지워버린 사고가 실제로 있었다)
  if (!s.role && !s.classList && !s.groupList && !s.topicList && !s.bannedWords && !s.geminiApiKey && !s.rubricCriteria) {
    return { success: false, error: "비어 있는 설정은 저장할 수 없어요. 먼저 '불러오기'로 시트의 설정을 불러온 뒤 수정해 주세요." };
  }

  // 화면은 키를 가려서(앞4자••••뒤4자) 보여 주므로, 가려진 값이 그대로 돌아오면 '바꾸지 않음'이다. 새 키는 형식을 검사한다.
  var keyChange = false;
  if (s.geminiApiKey !== undefined && s.geminiApiKey !== null) {
    var newKey = String(s.geminiApiKey).trim();
    if (isMaskedKey_(newKey)) { /* 그대로 둔다 */ }
    else if (newKey === '') keyChange = true; // 비워서 저장하면 키를 지운다
    else if (!isSafeKey_(newKey)) return { success: false, error: "API 키 형식이 올바르지 않아요. (영문·숫자·_-. 만, 10자 이상)" };
    else keyChange = true;
  }
  if (s.backupSheetId !== undefined && s.backupSheetId !== null) {
    var bid = String(s.backupSheetId).trim();
    if (bid && !/^[A-Za-z0-9_-]{20,100}$/.test(bid)) return { success: false, error: "백업 스프레드시트 ID 형식이 올바르지 않아요. (주소창의 /d/ 와 /edit 사이 글자)" };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var envSheet = requireSheet_('환경설정');
  var configSheet = requireSheet_('기본설정');

  // 요청에 키가 실제로 들어 있는 칸만 쓴다. 안 넘어온 칸은 시트 값을 그대로 둔다.
  var put = function(sheet, cell, key) {
    // =,+,-,@ 로 시작하는 글이 시트 수식으로 해석되지 않도록 텍스트로 고정해서 쓴다
    if (s[key] !== undefined && s[key] !== null) sheet.getRange(cell).setValue(safeCell_(String(s[key]).trim()));
  };

  if (keyChange) put(envSheet, ENV_KEY_CELL_, 'geminiApiKey');
  put(envSheet, ENV_BACKUP_CELL_, 'backupSheetId');
  // 사용할 Gemini 모델 (비우면 자동 선택). 이름표 칸이 비어 있으면 첫 저장 때 적어 둔다.
  if (s.geminiModel !== undefined && s.geminiModel !== null && (s.geminiModel === '' || /^(gemini|gemma)[a-z0-9.-]*$/i.test(s.geminiModel))) {
    if (!envSheet.getRange(ENV_MODEL_LABEL_CELL_).getValue()) envSheet.getRange(ENV_MODEL_LABEL_CELL_).setValue('Gemini 모델 (비우면 자동 선택)');
    envSheet.getRange(ENV_MODEL_CELL_).setValue(s.geminiModel);
  }

  // 시트 전체에 하나뿐인 공통 설정 (기본설정 탭에는 이것들만 남는다)
  put(configSheet, CFG_BANNED_CELL_, 'bannedWords');
  put(configSheet, CFG_CLASSES_CELL_, 'classList');
  put(configSheet, CFG_GROUPS_CELL_, 'groupList');
  put(configSheet, CFG_TOPICS_CELL_, 'topicList');

  // 옛 콘솔 호환: 페르소나·캐릭터·루브릭·제한 시간·기억 쌍이 요청에 있으면 세부설정 탭의 '기본' 줄에 쓴다
  var pick = function(map) {
    var o = {};
    Object.keys(map).forEach(function(k) { if (s[k] !== undefined && s[k] !== null) o[map[k]] = s[k]; });
    return Object.keys(o).length ? o : null;
  };
  var personaVals = pick({ role: 'role', action: 'action', restrict: 'restrict', exception: 'exception', extra: 'extra',
    characterId: 'characterId', characterName: 'characterName', greeting: 'greeting', templateKey: 'templateKey' });
  var rubricVals = pick({ rubricRole: 'role', rubricCriteria: 'criteria', rubricLevel: 'level', rubricGuideline: 'guideline' });
  var topicVals = pick({ timeLimitMinutes: 'timeLimitMinutes', windowPairs: 'windowPairs' });
  if (personaVals || rubricVals || topicVals) ensureProfileTabs_();
  if (personaVals) { var r1 = saveProfileRow_('persona', BASE_NAME_, BASE_NAME_, personaVals, true); if (!r1.success) return r1; }
  if (rubricVals) { var r2 = saveProfileRow_('rubric', BASE_NAME_, BASE_NAME_, rubricVals, true); if (!r2.success) return r2; }
  if (topicVals) { var r3 = saveTopicSetting(Object.assign({ topic: TOPIC_DEFAULT_ }, topicVals)); if (!r3.success) return r3; }
  clearSettingsCache_();

  var result = { success: true };
  // 주제 목록을 저장했다면 '주제 세부설정' 탭도 목록에 맞춘다(새 주제의 줄을 만든다). 목록 저장은 이미 끝났으므로,
  // 맞추기에 실패해도 저장은 성공으로 두고 이유를 알려 준다(다음에 연결 화면을 불러올 때 다시 맞춘다).
  if (s.topicList !== undefined && s.topicList !== null) {
    var sync = syncTopicRows_();
    result.topicRows = { added: sync.added, removed: sync.removed };
    if (!sync.success) result.topicRows.error = sync.error;
  }
  return result;
}

// ============================================================================
// 주제별 설정: '페르소나 세부설정' · '루브릭 세부설정' · '주제 세부설정' 탭
//  - 페르소나 세부설정: 한 줄 = AI 한 벌(템플릿·역할·행동 지침·절대 제한·예외 대처·추가 참고·캐릭터). 2행 '기본'이 기준.
//  - 루브릭 세부설정:   한 줄 = 평가 기준 한 벌(평가자 역할·요소별 판정·종합 루브릭·피드백 지침). 2행 '기본'이 기준.
//  - 주제 세부설정:     한 줄 = 주제 하나가 쓰는 페르소나·루브릭 + 제한 시간·기억할 대화 쌍. 2행 '(기본)'이 기준.
//  규칙 하나: 기본이 아닌 줄의 빈 칸은 같은 탭의 기본 줄 값을 따른다. 주제 줄이 없는 주제는 기본값을 쓴다.
//  이 탭들이 시트에 없으면 처음 실행될 때 기본 상태(소크라테스 발문형 내용의 '기본' 줄 + 템플릿 원본)로 만든다.
//  모델은 시트 전체에서 하나만 쓴다(환경설정 B3, 비면 자동).
// ============================================================================
var PERSONA_SHEET_ = '페르소나 세부설정';
var RUBRIC_SHEET_ = '루브릭 세부설정';
var TOPIC_CFG_SHEET_ = '주제 세부설정';
var BASE_NAME_ = '기본';
var TOPIC_DEFAULT_ = '(기본)';
var NO_RUBRIC_ = '-'; // 채팅기록 I열: 이 대화는 평가하지 않는다
var NO_RUBRIC_WORD_ = '없음'; // 주제 세부설정에서 평가 안 함을 뜻하는 글자
var PERSONA_COLS_ = ['name', 'templateKey', 'role', 'action', 'restrict', 'exception', 'extra', 'characterId', 'characterName', 'greeting', 'kind'];
var RUBRIC_COLS_ = ['name', 'role', 'criteria', 'level', 'guideline', 'kind'];
var TOPIC_CFG_COLS_ = ['topic', 'persona', 'rubric', 'timeLimitMinutes', 'windowPairs'];
var PERSONA_HEADERS_ = ['이름', '템플릿', '역할', '행동 지침', '절대 제한', '예외 대처', '추가 참고', '캐릭터 ID', '캐릭터 이름', '첫 인사말', '구분'];
var RUBRIC_HEADERS_ = ['이름', '평가자 역할', '요소별 판정 기준', '종합 평가 루브릭', '피드백 작성 지침', '구분'];
var TOPIC_CFG_HEADERS_ = ['주제', '페르소나', '루브릭', '제한 시간(분)', '기억할 대화 쌍'];
var TEMPLATE_KEYS_ = ['socratic', 'cer', 'advanced', 'debate', 'qna'];
var TEMPLATE_KIND_ = '템플릿'; // 페르소나·루브릭 세부설정의 '구분' 열: 미리 넣어 둔 원본 줄. 화면에서 고치거나 지울 수 없다(고치면 새 이름으로 따로 저장).
var TEMPLATE_SEED_PROP_ = 'PROFILE_TEMPLATES_SEEDED'; // 템플릿 줄을 이 시트에 넣었는지 기억한다(지운 줄을 되살리지 않으려고)
var TEMPLATE_SEED_VERSION_ = '1'; // 템플릿을 새로 추가할 때 올리면 빠진 줄만 다시 채운다
var CORE_CACHE_KEY_ = 'cfg_core_v1'; // 페르소나 표 + 주제 표 (채팅·학생 화면이 매번 읽는 것). 루브릭은 분석할 때만 읽는다.
var CORE_CACHE_SECONDS_ = 300;
var DEFAULT_TIME_LIMIT_ = 20;
var DEFAULT_WINDOW_PAIRS_ = 3;
var PROFILE_TEXT_MAX_ = 10000;
var NAME_MAX_ = 30;

function clearSettingsCache_() {
  try { CacheService.getScriptCache().remove(CORE_CACHE_KEY_); } catch (e) {}
}

function positiveInt_(v, max) {
  var n = parseInt(String(v == null ? '' : v).trim(), 10);
  if (!(n > 0)) return 0;
  return max && n > max ? max : n;
}

// 표(2행부터)를 객체 배열로 읽는다. 첫 칸(이름)이 빈 줄은 건너뛴다. 모든 값은 앞뒤 공백을 뗀 문자열.
function readTable_(sheetName, colKeys) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return [];
  var out = [];
  sh.getRange(2, 1, sh.getLastRow() - 1, colKeys.length).getValues().forEach(function(r, i) {
    var o = { row: i + 2 };
    colKeys.forEach(function(k, j) { o[k] = r[j] == null ? '' : String(r[j]).trim(); });
    if (o[colKeys[0]]) out.push(o);
  });
  return out;
}

function findByName_(rows, key, name) {
  var want = normalizeTopic_(name);
  if (!want) return null;
  for (var i = 0; i < rows.length; i++) if (normalizeTopic_(rows[i][key]) === want) return rows[i];
  return null;
}

// 시트에 쓸 한 줄을 만든다: 이름 칸은 날짜·수식으로 바뀌지 않게 텍스트로 고정, 숫자 칸은 숫자, 나머지는 수식 방지
function profileRowArray_(cols, o) {
  return cols.map(function(k) {
    var v = o[k] == null ? '' : o[k];
    if (k === 'name' || k === 'topic' || k === 'persona' || k === 'rubric') return cellText_(String(v).trim());
    if (k === 'timeLimitMinutes' || k === 'windowPairs') { var n = positiveInt_(v); return n ? n : ''; }
    if (k === 'templateKey' || k === 'characterId') return String(v).trim();
    return safeCell_(v);
  });
}

// 세 탭이 모두 있고 템플릿 줄도 넣었다면 아무것도 하지 않는다. 없는 탭만 기본 상태로 만든다(락 안에서, 이미 만들어졌으면 건너뜀).
// 락을 쓰므로 이미 락을 잡은 구간 안에서는 부르지 말 것.
function ensureProfileTabs_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  var tabsOk = ss.getSheetByName(PERSONA_SHEET_) && ss.getSheetByName(RUBRIC_SHEET_) && ss.getSheetByName(TOPIC_CFG_SHEET_);
  if (tabsOk && props.getProperty(TEMPLATE_SEED_PROP_) === TEMPLATE_SEED_VERSION_) return;
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var defs = defaultProfileValues_();
    var make = function(name, headers, cols, row) {
      if (ss.getSheetByName(name)) return;
      var sh = ss.insertSheet(name);
      sh.appendRow(headers);
      sh.setFrozenRows(1);
      sh.appendRow(profileRowArray_(cols, row));
    };
    make(PERSONA_SHEET_, PERSONA_HEADERS_, PERSONA_COLS_, defs.persona);
    make(RUBRIC_SHEET_, RUBRIC_HEADERS_, RUBRIC_COLS_, defs.rubric);
    make(TOPIC_CFG_SHEET_, TOPIC_CFG_HEADERS_, TOPIC_CFG_COLS_, defs.topic);
    if (!tabsOk) Logger.log("✅ 주제별 설정 탭을 기본 상태(소크라테스 발문형)로 만들었습니다.");
    seedTemplateRows_(ss);
    props.setProperty(TEMPLATE_SEED_PROP_, TEMPLATE_SEED_VERSION_);
  } finally {
    lock.releaseLock();
  }
  clearSettingsCache_();
}

// 템플릿 원본을 페르소나·루브릭 세부설정 탭에 '구분=템플릿' 줄로 넣는다. 같은 이름의 줄이 이미 있으면(교사가 직접 만든 것) 건드리지 않는다.
// 락을 잡은 상태에서 부른다. 한 번 넣은 뒤에는 TEMPLATE_SEED_PROP_ 로 기억해, 교사가 시트에서 지운 줄을 되살리지 않는다.
function seedTemplateRows_(ss) {
  var psh = ss.getSheetByName(PERSONA_SHEET_), rsh = ss.getSheetByName(RUBRIC_SHEET_);
  // 이미 있던 탭(옛 버전이 만든 것)에는 '구분' 머리글이 없으니 채운다
  if (psh && !psh.getRange(1, PERSONA_COLS_.length).getValue()) psh.getRange(1, PERSONA_COLS_.length).setValue('구분');
  if (rsh && !rsh.getRange(1, RUBRIC_COLS_.length).getValue()) rsh.getRange(1, RUBRIC_COLS_.length).setValue('구분');
  var pTable = readTable_(PERSONA_SHEET_, PERSONA_COLS_), rTable = readTable_(RUBRIC_SHEET_, RUBRIC_COLS_);
  var added = 0;
  TEMPLATE_PROFILES_.forEach(function(t) {
    if (psh && !findByName_(pTable, 'name', t.name)) {
      psh.appendRow(profileRowArray_(PERSONA_COLS_, Object.assign({ name: t.name, kind: TEMPLATE_KIND_ }, t.persona)));
      added++;
    }
    if (rsh && t.rubric && !findByName_(rTable, 'name', t.name)) {
      rsh.appendRow(profileRowArray_(RUBRIC_COLS_, Object.assign({ name: t.name, kind: TEMPLATE_KIND_ }, t.rubric)));
      added++;
    }
  });
  if (added) Logger.log("✅ 템플릿 원본 " + added + "줄을 세부설정 탭에 넣었습니다.");
}

// 세부설정 탭을 못 만들거나 못 읽는 상황(시트 보호 등)에서도 수업이 멈추지 않게, 기본 상태(소크라테스 발문형)를 메모리에서 대신 쓴다.
function fallbackCore_() {
  var d = defaultProfileValues_();
  return { personas: [Object.assign({ row: 2 }, d.persona)], topics: [Object.assign({ row: 2 }, d.topic)], fallback: true };
}
function fallbackRubrics_() {
  return [Object.assign({ row: 2 }, defaultProfileValues_().rubric)];
}

// ---------------------------------------------------------
// 기본 상태(소크라테스 발문형 템플릿 내용)의 '기본' 줄들. 세부설정 탭을 새로 만들 때, 시트를 초기화할 때, 탭을 읽지 못할 때 쓴다.
// ---------------------------------------------------------
function defaultProfileValues_() {
  var t = TEMPLATE_PROFILES_.filter(function(x) { return x.key === 'socratic'; })[0] || TEMPLATE_PROFILES_[0];
  return {
    persona: Object.assign({ name: BASE_NAME_ }, t.persona),
    rubric: Object.assign({ name: BASE_NAME_ }, t.rubric),
    topic: { topic: TOPIC_DEFAULT_, persona: BASE_NAME_, rubric: BASE_NAME_, timeLimitMinutes: DEFAULT_TIME_LIMIT_, windowPairs: DEFAULT_WINDOW_PAIRS_ }
  };
}

// ---------------------------------------------------------
// 시트 초기화 — 되돌릴 수 없다. 웹 API(routeAction)에는 연결하지 않았고, 시트 메뉴의 확인 창(resetSheetToDefaultsFromMenu)에서만 실행된다.
// 지우는 것: 세 세부설정 탭(기본 상태로 다시 만듦), 기본설정의 금지어·학급/모둠/주제 목록(B1:B4),
//           '논증평가설정'·'대시보드' 탭(옛 버전이 만든 것), 탐구자료의 모든 줄, 채팅기록의 모든 대화(머리글은 남김).
// 건드리지 않는 것: 환경설정(키·모델·백업 시트 ID), API키 탭, 교사 비밀번호, 백업 스프레드시트의 사본.
// 이 함수 이름 끝의 _ 는 Apps Script 편집기의 실행 목록에서 숨기려는 것이다(확인 없이 실수로 실행하지 않도록).
// ---------------------------------------------------------
function resetSheetToDefaults_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var report = { deletedTabs: [], chatRows: 0, materialRows: 0 };
  try {
    var d = defaultProfileValues_();
    // 1) 세부설정 탭: 비우고 기본 줄 + 템플릿 원본으로 다시 만든다
    var rebuild = function(name, headers, cols, rows) {
      var sh = ss.getSheetByName(name) || ss.insertSheet(name);
      sh.clear();
      sh.appendRow(headers);
      sh.setFrozenRows(1);
      rows.forEach(function(r) { sh.appendRow(profileRowArray_(cols, r)); });
    };
    rebuild(PERSONA_SHEET_, PERSONA_HEADERS_, PERSONA_COLS_, [d.persona]);
    rebuild(RUBRIC_SHEET_, RUBRIC_HEADERS_, RUBRIC_COLS_, [d.rubric]);
    rebuild(TOPIC_CFG_SHEET_, TOPIC_CFG_HEADERS_, TOPIC_CFG_COLS_, [d.topic]);
    seedTemplateRows_(ss);
    PropertiesService.getScriptProperties().setProperty(TEMPLATE_SEED_PROP_, TEMPLATE_SEED_VERSION_);

    // 2) 기본설정: 금지어·목록을 비운다 (A열 이름표와 C열 안내 메모는 남긴다)
    var cfg = ss.getSheetByName('기본설정'); // 초기화는 탭이 없어도 멈추지 않는다 (requireSheet_ 를 쓰지 않는 곳)
    if (cfg) {
      cfg.getRange(CFG_ALL_RANGE_).clearContent();
    }

    // 3) 옛 탭 삭제
    ['논증평가설정', '대시보드'].forEach(function(n) {
      var sh = ss.getSheetByName(n);
      if (sh) { ss.deleteSheet(sh); report.deletedTabs.push(n); }
    });

    // 4) 탐구 자료: 주제별 캐시도 함께 비운다
    var matSheet = ss.getSheetByName(MATERIAL_SHEET_NAME_);
    if (matSheet) {
      var cache = CacheService.getScriptCache();
      readMaterialRows_().forEach(function(m) { report.materialRows++; try { cache.remove(materialCacheKey_(m.topic)); } catch (e) {} });
      matSheet.clear();
      matSheet.appendRow(['주제', '실험 과정', '준비물', '유의사항', '교사용 메모(AI만 참고)']);
      matSheet.setFrozenRows(1);
    }

    // 5) 채팅기록: 대화는 모두 지우고 머리글(1행)은 남긴다. (같은 날 차단 상태도 이 기록에서 계산하므로 함께 풀린다)
    var rec = ss.getSheetByName('채팅기록');
    if (rec) {
      var last = rec.getLastRow();
      if (last > 1) { rec.deleteRows(2, last - 1); report.chatRows = last - 1; }
      var head = rec.getRange('H1:I1').getValues()[0];
      if (!head[0] || head[0] === '모드') rec.getRange('H1').setValue('페르소나');
      if (!head[1]) rec.getRange('I1').setValue('루브릭');
    }
  } finally {
    lock.releaseLock();
  }
  clearSettingsCache_();
  try { CacheService.getScriptCache().remove('log_hdr_v1'); } catch (e2) {}
  Logger.log("🧹 시트를 기본 상태로 초기화했습니다: " + JSON.stringify(report));
  return report;
}

// 시트 메뉴 항목: 두 번 확인한 뒤에만 초기화한다 (예/아니오 → '초기화' 입력)
function resetSheetToDefaultsFromMenu() {
  var ui = SpreadsheetApp.getUi();
  var warn =
    '아래 내용을 모두 지우고 기본 상태로 되돌립니다. 되돌릴 수 없어요.\n\n' +
    '· 페르소나·루브릭·주제 연결 설정 (기본 줄 + 템플릿 5종으로 다시 만듦)\n' +
    '· 학급·모둠·탐구 주제 목록, 금지어\n' +
    '· 탐구 자료 전체\n' +
    '· 채팅기록(학생 대화) 전체\n' +
    '· 옛 버전이 만든 \'논증평가설정\'·\'대시보드\' 탭(있을 때만)\n\n' +
    'Gemini API 키·모델·백업 시트(환경설정), API키 탭, 교사 비밀번호는 그대로 둡니다.\n' +
    '(환경설정에 적어 둔 백업 스프레드시트의 사본도 지우지 않습니다)\n\n계속할까요?';
  if (ui.alert('⚠️ 설정·기록 초기화', warn, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  var typed = ui.prompt('초기화 확인', "정말 초기화하려면 아래 칸에 '초기화'라고 입력하고 확인을 누르세요.", ui.ButtonSet.OK_CANCEL);
  if (typed.getSelectedButton() !== ui.Button.OK || String(typed.getResponseText() || '').trim() !== '초기화') {
    ui.alert('취소했어요', '아무것도 바꾸지 않았어요.', ui.ButtonSet.OK);
    return;
  }
  try {
    var r = resetSheetToDefaults_();
    ui.alert('초기화 완료',
      '기본 상태로 되돌렸어요.\n\n· 지운 채팅기록: ' + r.chatRows + '건\n· 지운 탐구 자료: ' + r.materialRows + '건' +
      (r.deletedTabs.length ? '\n· 삭제한 옛 탭: ' + r.deletedTabs.join(', ') : '') +
      '\n\n교사 콘솔에서 [새로고침] 후 기본 설정의 "학급·모둠·금지어"와 주제 설정의 "탐구 주제 목록"부터 다시 입력해 주세요.', ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('초기화하지 못했어요', String(err && err.message || err) + '\n\n일부만 바뀌었을 수 있어요. 시트를 확인한 뒤 다시 시도해 주세요.', ui.ButtonSet.OK);
  }
}

// 페르소나 표 + 주제 표 (5분 캐시, 설정을 저장하면 비운다). fresh=true 면 캐시를 건너뛴다.
function readCoreConfig_(fresh) {
  var cache = CacheService.getScriptCache();
  if (!fresh) { try { var hit = cache.get(CORE_CACHE_KEY_); if (hit) return JSON.parse(hit); } catch (e) {} }
  var core;
  try {
    ensureProfileTabs_();
    core = { personas: readTable_(PERSONA_SHEET_, PERSONA_COLS_), topics: readTable_(TOPIC_CFG_SHEET_, TOPIC_CFG_COLS_), fallback: false };
  } catch (err) {
    Logger.log("⚠️ 주제별 설정을 읽지 못해 기본 상태로 대신 동작합니다: " + maskSecrets_(err));
    return fallbackCore_(); // 이 대체 결과는 캐시하지 않는다
  }
  try { cache.put(CORE_CACHE_KEY_, JSON.stringify(core), CORE_CACHE_SECONDS_); } catch (e2) {}
  return core;
}

function readRubricTable_() {
  try {
    ensureProfileTabs_();
    return readTable_(RUBRIC_SHEET_, RUBRIC_COLS_);
  } catch (err) {
    Logger.log("⚠️ 루브릭 탭을 읽지 못해 기본 루브릭으로 대신 동작합니다: " + maskSecrets_(err));
    return fallbackRubrics_();
  }
}

function basePersona_(core) {
  var blank = { row: 0, name: BASE_NAME_ };
  PERSONA_COLS_.forEach(function(k) { if (blank[k] === undefined) blank[k] = ''; });
  return findByName_(core.personas, 'name', BASE_NAME_) || core.personas[0] || blank;
}
function baseRubric_(rubrics) {
  var blank = { row: 0, name: BASE_NAME_ };
  RUBRIC_COLS_.forEach(function(k) { if (blank[k] === undefined) blank[k] = ''; });
  return findByName_(rubrics, 'name', BASE_NAME_) || rubrics[0] || blank;
}
function topicDefaultRow_(core) {
  return findByName_(core.topics, 'topic', TOPIC_DEFAULT_) || { topic: TOPIC_DEFAULT_, persona: '', rubric: '', timeLimitMinutes: '', windowPairs: '' };
}
function mergeBlank_(row, base, cols) {
  var o = { row: row.row };
  cols.forEach(function(k) { o[k] = (row[k] !== undefined && row[k] !== '') ? row[k] : (base[k] || ''); });
  o.name = row.name;
  return o;
}

// 한 주제에 실제로 적용되는 값(페르소나·캐릭터·제한 시간·기억 쌍과, 채팅 기록에 남길 페르소나·루브릭 이름).
// 루브릭 내용은 분석할 때만 필요하므로 여기서는 이름만 정한다. topic 이 비면 기본값.
// 캐릭터 빈 칸 규칙 (public/js/argu-shared.js 의 personaCharacter 와 같은 규칙; tests/gas_profiles.test.js 가 두 쪽을 비교한다).
//  - 캐릭터 칸이 비었는데 '기본'과 다른 대화 방식이면, 기본의 캐릭터를 물려받지 않고 그 대화 방식의 짝(Templates.js)을 쓴다.
//  - 캐릭터만 정하고 이름 칸을 비우면, 기본의 이름이 아니라 그 캐릭터의 이름을 쓴다(모르는 캐릭터면 비워 두고 화면이 채운다).
// p 는 mergeBlank_ 로 만든 값이고, 그 안의 characterId/characterName 만 고친다.
function inheritCharacter_(p, row, base) {
  var baseTpl = base.templateKey || 'socratic', tpl = p.templateKey || baseTpl;
  if (row.characterId) {
    if (!row.characterName) p.characterName = templateCharacterName_(row.characterId);
  } else if (tpl !== baseTpl) {
    var pair = null;
    for (var i = 0; i < TEMPLATE_PROFILES_.length; i++) if (TEMPLATE_PROFILES_[i].key === tpl) pair = TEMPLATE_PROFILES_[i].persona;
    p.characterId = pair ? pair.characterId : '';
    p.characterName = row.characterName || (pair ? pair.characterName : '');
  }
}
// 템플릿 5개의 짝 캐릭터 중 이 id 의 기본 이름 (모르면 '')
function templateCharacterName_(id) {
  for (var i = 0; i < TEMPLATE_PROFILES_.length; i++) if (TEMPLATE_PROFILES_[i].persona.characterId === id) return TEMPLATE_PROFILES_[i].persona.characterName;
  return '';
}

function resolveTopicConfig_(core, topic) {
  var base = basePersona_(core), tDef = topicDefaultRow_(core), warnings = [];
  var want = normalizeTopic_(topic);
  var tRow = (want && want !== normalizeTopic_(TOPIC_DEFAULT_)) ? findByName_(core.topics, 'topic', topic) : null;
  var wantedPersona = tRow ? tRow.persona : '';
  var row = wantedPersona ? findByName_(core.personas, 'name', wantedPersona) : base;
  if (!row) { warnings.push("페르소나 '" + wantedPersona + "'를 찾지 못해 '기본'을 썼어요."); row = base; }
  var p = mergeBlank_(row, base, PERSONA_COLS_);
  inheritCharacter_(p, row, base);
  var rubricRaw = tRow ? tRow.rubric : '';
  var noRubric = p.templateKey === 'qna' || rubricRaw === NO_RUBRIC_WORD_ || rubricRaw === NO_RUBRIC_;
  return {
    topic: String(topic || '').trim(),
    linked: !!tRow,
    personaName: row.name || BASE_NAME_,
    rubricName: noRubric ? NO_RUBRIC_ : (rubricRaw || BASE_NAME_),
    noRubric: noRubric,
    templateKey: p.templateKey,
    role: p.role, action: p.action, restrict: p.restrict, exception: p.exception, extra: p.extra,
    characterId: p.characterId, characterName: p.characterName, greeting: p.greeting,
    timeLimitMinutes: positiveInt_(tRow && tRow.timeLimitMinutes, 180) || positiveInt_(tDef.timeLimitMinutes, 180) || DEFAULT_TIME_LIMIT_,
    windowPairs: positiveInt_(tRow && tRow.windowPairs, 20) || positiveInt_(tDef.windowPairs, 20) || DEFAULT_WINDOW_PAIRS_,
    warnings: warnings
  };
}

// 옛 콘솔용: 기본 줄들의 값
function readBaseValues_() {
  var core = readCoreConfig_(true);
  var bp = basePersona_(core), bt = topicDefaultRow_(core), br = baseRubric_(readRubricTable_());
  return { persona: bp, rubric: br, topic: bt };
}

// ---------------------------------------------------------
// [API] 교사 콘솔: 페르소나·루브릭·주제 연결 목록 (교사 전용)
// ---------------------------------------------------------
function getProfiles() {
  // 탭을 못 만드는 상태여도 화면이 '기본 상태로 동작 중'을 알릴 수 있게 오류로 끝내지 않는다 (readCoreConfig_ 가 기본 상태(소크라테스 발문형)로 대신한다)
  // 목록에 있는데 '주제 세부설정' 줄이 없는 주제(시트에서 목록을 직접 고친 경우 등)는 여기서 줄을 만들어 준다. 실패해도 화면은 계속된다.
  var sync = syncTopicRows_();
  var core = readCoreConfig_(true), rubrics = readRubricTable_();
  var topicList = readTopicList_(), seen = {};
  topicList.forEach(function(t) { seen[normalizeTopic_(t)] = true; });
  var warnings = [];
  if (!sync.success && !core.fallback) warnings.push("'주제 세부설정' 탭에 주제 줄을 맞추지 못했어요: " + sync.error);
  var dupCheck = function(rows, key, label) {
    var s = {};
    rows.forEach(function(r) { var k = normalizeTopic_(r[key]); if (s[k]) warnings.push(label + " 이름 '" + r[key] + "'이 두 번 있어요. 위쪽 줄만 쓰여요."); s[k] = true; });
  };
  dupCheck(core.personas, 'name', '페르소나'); dupCheck(rubrics, 'name', '루브릭'); dupCheck(core.topics, 'topic', '주제');

  var topics = topicList.map(function(t) {
    var res = resolveTopicConfig_(core, t), row = findByName_(core.topics, 'topic', t) || {};
    if (row.rubric && row.rubric !== NO_RUBRIC_WORD_ && row.rubric !== NO_RUBRIC_ && !findByName_(rubrics, 'name', row.rubric)) {
      warnings.push("주제 '" + t + "'의 루브릭 '" + row.rubric + "'을 찾지 못해 '기본' 루브릭으로 평가해요.");
    }
    res.warnings.forEach(function(w) { warnings.push("주제 '" + t + "': " + w); });
    return { topic: t, orphan: false, persona: row.persona || '', rubric: row.rubric || '', timeLimitMinutes: positiveInt_(row.timeLimitMinutes) || '', windowPairs: positiveInt_(row.windowPairs) || '',
      resolved: { personaName: res.personaName, rubricName: res.rubricName, noRubric: res.noRubric, templateKey: res.templateKey,
        characterId: res.characterId, characterName: res.characterName, timeLimitMinutes: res.timeLimitMinutes, windowPairs: res.windowPairs } };
  });
  core.topics.forEach(function(r) {
    if (normalizeTopic_(r.topic) === normalizeTopic_(TOPIC_DEFAULT_) || seen[normalizeTopic_(r.topic)]) return;
    warnings.push("주제 설정 '" + r.topic + "'은 주제 목록에 없어서 학생에게 보이지 않아요(연결 안 됨).");
    topics.push({ topic: r.topic, orphan: true, persona: r.persona, rubric: r.rubric, timeLimitMinutes: positiveInt_(r.timeLimitMinutes) || '', windowPairs: positiveInt_(r.windowPairs) || '', resolved: null });
  });

  var usedBy = function(kind, name) {
    var key = normalizeTopic_(name);
    return topics.filter(function(t) {
      if (t.orphan) return false;
      var r = t.resolved;
      return normalizeTopic_(kind === 'persona' ? r.personaName : r.rubricName) === key;
    }).map(function(t) { return t.topic; });
  };
  var tDef = topicDefaultRow_(core);
  return {
    success: true,
    fallback: !!core.fallback,
    personas: core.personas.map(function(p) { var o = Object.assign({}, p); o.isBase = normalizeTopic_(p.name) === normalizeTopic_(BASE_NAME_); o.isTemplate = p.kind === TEMPLATE_KIND_; o.usedBy = usedBy('persona', p.name); return o; }),
    rubrics: rubrics.map(function(r) { var o = Object.assign({}, r); o.isBase = normalizeTopic_(r.name) === normalizeTopic_(BASE_NAME_); o.isTemplate = r.kind === TEMPLATE_KIND_; o.usedBy = usedBy('rubric', r.name); return o; }),
    topics: topics,
    topicDefault: { timeLimitMinutes: positiveInt_(tDef.timeLimitMinutes) || '', windowPairs: positiveInt_(tDef.windowPairs) || '', fallbackTime: DEFAULT_TIME_LIMIT_, fallbackPairs: DEFAULT_WINDOW_PAIRS_ },
    warnings: warnings,
    limits: { text: PROFILE_TEXT_MAX_, name: NAME_MAX_ }
  };
}

function cleanName_(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
function isReservedName_(n) {
  var k = normalizeTopic_(n);
  return k === '-' || k === normalizeTopic_(NO_RUBRIC_WORD_) || k === 'qna' || k === normalizeTopic_(TOPIC_DEFAULT_);
}

// 페르소나/루브릭 한 줄을 만들거나 고친다. originalName 이 있으면 그 줄을 고치고(이름이 달라지면 이름 바꾸기), 없으면 새로 만든다.
// partial=true 면 values 에 들어 있는 칸만 바꾼다(옛 콘솔 호환·기본 줄 부분 수정). 반환: { success, name } 또는 { success:false, error }
function saveProfileRow_(kind, originalName, name, values, partial) {
  var isPersona = kind === 'persona';
  if (!isPersona && kind !== 'rubric') return { success: false, error: "알 수 없는 종류예요." };
  var cols = isPersona ? PERSONA_COLS_ : RUBRIC_COLS_, sheetName = isPersona ? PERSONA_SHEET_ : RUBRIC_SHEET_;
  var label = isPersona ? '페르소나' : '루브릭';
  name = cleanName_(name);
  if (!name) return { success: false, error: label + " 이름을 입력해 주세요." };
  if (name.length > NAME_MAX_) return { success: false, error: label + " 이름은 " + NAME_MAX_ + "자까지예요." };
  if (isReservedName_(name)) return { success: false, error: "'" + name + "'은 다른 뜻으로 쓰이는 이름이라 쓸 수 없어요." };
  values = values || {};
  for (var i = 0; i < cols.length; i++) {
    var k = cols[i]; if (k === 'name') continue;
    if (values[k] !== undefined && values[k] !== null && String(values[k]).length > PROFILE_TEXT_MAX_) return { success: false, error: "한 칸은 " + PROFILE_TEXT_MAX_ + "자까지 입력할 수 있어요." };
  }
  if (values.templateKey !== undefined && values.templateKey !== null && values.templateKey !== '' && TEMPLATE_KEYS_.indexOf(String(values.templateKey)) === -1) {
    return { success: false, error: "알 수 없는 템플릿이에요." };
  }
  if (isPersona && values.characterId !== undefined && values.characterId !== null && !/^[A-Za-z0-9_-]{0,30}$/.test(String(values.characterId))) {
    return { success: false, error: "캐릭터 ID 형식이 올바르지 않아요." };
  }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return { success: false, error: "다른 저장이 진행 중이에요. 잠시 뒤 다시 시도해 주세요." }; }
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return { success: false, error: "'" + sheetName + "' 탭이 없어요. 새로고침 후 다시 시도해 주세요." };
    var table = readTable_(sheetName, cols);
    var baseKey = normalizeTopic_(BASE_NAME_);
    var existing = originalName ? findByName_(table, 'name', originalName) : null;
    // 옛 콘솔 호환 경로(partial)에서 '기본' 줄이 아예 없으면 새로 만든다
    if (originalName && !existing && !(partial && normalizeTopic_(originalName) === baseKey)) {
      return { success: false, error: "고치려는 " + label + "를 찾지 못했어요. 다른 곳에서 바뀌었을 수 있으니 '불러오기'를 눌러 다시 확인해 주세요." };
    }
    var clash = findByName_(table, 'name', name);
    if (clash && (!existing || clash.row !== existing.row)) return { success: false, error: "같은 이름의 " + label + "가 이미 있어요." };
    if (existing && normalizeTopic_(existing.name) === baseKey && normalizeTopic_(name) !== baseKey) return { success: false, error: "'기본'은 이름을 바꿀 수 없어요." };
    if (existing && existing.kind === TEMPLATE_KIND_) return { success: false, error: "'" + existing.name + "'은 템플릿 원본이라 고칠 수 없어요. 고친 내용은 다른 이름으로 따로 저장해 주세요." };

    var merged = { name: name };
    cols.forEach(function(k) {
      if (k === 'name') return;
      if (k === 'kind') { merged.kind = existing ? existing.kind : ''; return; } // '템플릿' 표시는 화면에서 만들거나 바꿀 수 없다
      var inReq = values[k] !== undefined && values[k] !== null;
      merged[k] = inReq ? String(values[k]).trim() : (existing ? existing[k] : '');
    });
    if (!partial) {
      var anyContent = cols.some(function(k) { return k !== 'name' && k !== 'templateKey' && k !== 'kind' && merged[k] !== ''; });
      if (!anyContent) return { success: false, error: "내용이 모두 비어 있어요. 최소한 한 칸은 채워 주세요." };
      if (normalizeTopic_(name) === baseKey && !(isPersona ? merged.role : merged.criteria)) {
        return { success: false, error: isPersona ? "'기본' 페르소나의 역할이 비어 있어요. 다른 페르소나가 비워 둔 칸은 '기본'을 따라가므로 비울 수 없어요." : "'기본' 루브릭의 요소별 판정 기준이 비어 있어요." };
      }
    }
    var rowArr = profileRowArray_(cols, merged);
    if (existing) {
      sh.getRange(existing.row, 1, 1, cols.length).setValues([rowArr]);
      // 이름이 바뀌면 이 이름을 가리키던 주제 연결도 같이 바꾼다 (이미 쌓인 채팅기록의 이름은 그대로 남는다)
      if (normalizeTopic_(existing.name) !== normalizeTopic_(name)) {
        var tsh = ss.getSheetByName(TOPIC_CFG_SHEET_);
        if (tsh) {
          var col = isPersona ? 2 : 3;
          readTable_(TOPIC_CFG_SHEET_, TOPIC_CFG_COLS_).forEach(function(t) {
            if (normalizeTopic_(isPersona ? t.persona : t.rubric) === normalizeTopic_(existing.name)) tsh.getRange(t.row, col).setValue(cellText_(name));
          });
        }
      }
    } else {
      sh.appendRow(rowArr);
    }
    clearSettingsCache_();
    return { success: true, name: name, created: !existing };
  } finally {
    lock.releaseLock();
  }
}

// [API] 페르소나/루브릭 저장. { kind: 'persona'|'rubric', originalName?, name, values:{...} }
function saveProfile(p) {
  if (!p) return { success: false, error: "요청이 비어 있어요." };
  ensureProfileTabs_();
  return saveProfileRow_(p.kind, cleanName_(p.originalName), p.name, p.values, false);
}

// [API] 페르소나/루브릭 삭제. 기본 줄과, 주제가 쓰고 있는 줄은 지울 수 없다.
function deleteProfile(p) {
  var kind = p && p.kind, isPersona = kind === 'persona';
  if (!p || (!isPersona && kind !== 'rubric')) return { success: false, error: "알 수 없는 종류예요." };
  var label = isPersona ? '페르소나' : '루브릭', cols = isPersona ? PERSONA_COLS_ : RUBRIC_COLS_, sheetName = isPersona ? PERSONA_SHEET_ : RUBRIC_SHEET_;
  var name = cleanName_(p.name);
  if (!name) return { success: false, error: label + " 이름이 없어요." };
  if (normalizeTopic_(name) === normalizeTopic_(BASE_NAME_)) return { success: false, error: "'기본' " + label + "는 지울 수 없어요. 다른 " + label + "가 비워 둔 칸의 기준이에요." };
  ensureProfileTabs_();
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return { success: false, error: "다른 저장이 진행 중이에요. 잠시 뒤 다시 시도해 주세요." }; }
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    var row = sh ? findByName_(readTable_(sheetName, cols), 'name', name) : null;
    if (!row) return { success: false, error: label + "를 찾지 못했어요. '불러오기'를 눌러 다시 확인해 주세요." };
    if (row.kind === TEMPLATE_KIND_) return { success: false, error: "'" + row.name + "'은 템플릿 원본이라 지울 수 없어요. 쓰지 않으면 주제에 연결하지 않으면 돼요." };
    var users = readTable_(TOPIC_CFG_SHEET_, TOPIC_CFG_COLS_).filter(function(t) {
      return normalizeTopic_(isPersona ? t.persona : t.rubric) === normalizeTopic_(name);
    }).map(function(t) { return t.topic; });
    if (users.length) return { success: false, error: "'" + name + "' " + label + "를 쓰는 주제가 있어서 지울 수 없어요: " + users.join(', ') + ". 먼저 그 주제의 연결을 바꿔 주세요.", usedBy: users };
    sh.deleteRow(row.row);
    clearSettingsCache_();
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

// 주제 목록(기본설정 B4)을 이름 배열로 읽는다: 쉼표로 나누고 앞뒤 공백을 떼며, 같은 이름(공백·대소문자만 다른 것 포함)은 처음 것만 남긴다.
// 목록을 읽는 곳(주제 연결 화면·줄 맞추기·저장)이 같은 규칙을 쓰도록 한 군데에 둔다.
function readTopicList_() {
  var raw = requireSheet_('기본설정').getRange(CFG_TOPICS_CELL_).getValue().toString();
  var seen = {}, out = [];
  raw.split(',').forEach(function(t) { t = t.trim(); var k = normalizeTopic_(t); if (k && !seen[k]) { seen[k] = true; out.push(t); } });
  return out;
}

// 주제 목록의 모든 주제가 '주제 세부설정' 탭에 한 줄씩 있게 맞춘다(시트에서 바로 고칠 수 있도록).
//  - 목록에 있는데 줄이 없는 주제 → 빈 칸 줄을 추가한다. 빈 칸은 '(기본)' 줄을 따르므로 동작은 그대로다.
//  - 목록에 없고 모든 칸이 빈 줄 → 지운다(잘못 적었다가 고친 주제가 쌓이지 않게). 값이 하나라도 든 줄은 절대 지우지 않는다.
// 학생 화면 경로에서는 부르지 않는다(교사가 목록을 저장할 때와 연결 화면을 불러올 때만). 락을 잡으므로 이미 락을 잡은 구간 안에서는 부르지 말 것.
// 실패해도 예외를 던지지 않고 결과로 알린다: { success, added, removed, error? }
function syncTopicRows_() {
  try {
    ensureProfileTabs_(); // 락을 스스로 잡으므로 아래 락보다 먼저
    var topics = readTopicList_();
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TOPIC_CFG_SHEET_);
      if (!sh) return { success: false, added: 0, removed: 0, error: "'" + TOPIC_CFG_SHEET_ + "' 탭이 없어요." };
      var table = readTable_(TOPIC_CFG_SHEET_, TOPIC_CFG_COLS_);
      var listed = {}, have = {}, removed = 0, added = 0, addedTopics = [];
      topics.forEach(function(t) { listed[normalizeTopic_(t)] = true; });
      table.forEach(function(r) { have[normalizeTopic_(r.topic)] = true; });
      var defKey = normalizeTopic_(TOPIC_DEFAULT_);
      for (var i = table.length - 1; i >= 0; i--) { // 아래 줄부터 지워야 위쪽 줄 번호가 밀리지 않는다
        var r = table[i], k = normalizeTopic_(r.topic);
        if (k === defKey || listed[k]) continue;
        if (!r.persona && !r.rubric && !r.timeLimitMinutes && !r.windowPairs) { sh.deleteRow(r.row); removed++; }
      }
      var add = [];
      topics.forEach(function(t) {
        var k = normalizeTopic_(t);
        if (!have[k]) { have[k] = true; addedTopics.push(t); add.push(profileRowArray_(TOPIC_CFG_COLS_, { topic: t })); }
      });
      if (add.length) { sh.getRange(sh.getLastRow() + 1, 1, add.length, TOPIC_CFG_COLS_.length).setValues(add); added = add.length; }
      if (added || removed) clearSettingsCache_();
      return { success: true, added: added, removed: removed, addedTopics: addedTopics };
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return { success: false, added: 0, removed: 0, error: maskSecrets_(err && err.message ? err.message : String(err)) };
  }
}

// [API] 주제 하나의 연결 저장/되돌리기. { topic, persona?, rubric?, timeLimitMinutes?, windowPairs?, remove? }
// topic 이 '(기본)'이면 제한 시간·기억 쌍의 기본값을 바꾼다. 요청에 있는 칸만 바꾼다.
// 주제 목록에 있는 주제는 모든 칸이 기본과 같아져도(또는 remove) 줄을 지우지 않고 칸만 비운다 — 시트에서 계속 고칠 수 있게 줄은 남긴다.
// 주제 목록에 없는 주제는 기본과 같아지면 줄을 지운다.
function saveTopicSetting(p) {
  if (!p) return { success: false, error: "요청이 비어 있어요." };
  var topic = cleanName_(p.topic);
  if (!topic) return { success: false, error: "주제를 선택해 주세요." };
  if (topic.length > 100) return { success: false, error: "주제 이름이 너무 길어요." };
  var isDefault = normalizeTopic_(topic) === normalizeTopic_(TOPIC_DEFAULT_);
  var has = function(k) { return p[k] !== undefined && p[k] !== null; };
  var time = '', pairs = '';
  if (has('timeLimitMinutes') && String(p.timeLimitMinutes).trim() !== '') {
    time = positiveInt_(p.timeLimitMinutes);
    if (!time || time > 180) return { success: false, error: "제한 시간은 1~180분으로 입력해 주세요." };
  }
  if (has('windowPairs') && String(p.windowPairs).trim() !== '') {
    pairs = positiveInt_(p.windowPairs);
    if (!pairs || pairs > 20) return { success: false, error: "기억할 대화 쌍은 1~20으로 입력해 주세요." };
  }
  ensureProfileTabs_();
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return { success: false, error: "다른 저장이 진행 중이에요. 잠시 뒤 다시 시도해 주세요." }; }
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(TOPIC_CFG_SHEET_);
    if (!sh) return { success: false, error: "'" + TOPIC_CFG_SHEET_ + "' 탭이 없어요. 새로고침 후 다시 시도해 주세요." };
    var table = readTable_(TOPIC_CFG_SHEET_, TOPIC_CFG_COLS_);
    var existing = findByName_(table, 'topic', topic);
    // 주제 목록(기본설정 B4)에 있는 주제인가: 있으면 줄을 지우지 않고 남긴다(시트에서 계속 고칠 수 있게)
    var inList = !isDefault && readTopicList_().some(function(t) { return normalizeTopic_(t) === normalizeTopic_(topic); });

    if (p.remove === true) {
      if (isDefault) return { success: false, error: "기본 줄은 지울 수 없어요." };
      if (inList) { // 목록에 있는 주제를 기본 설정으로 되돌림: 줄은 남기고 칸만 비운다
        var blankRow = profileRowArray_(TOPIC_CFG_COLS_, { topic: existing ? existing.topic : topic });
        if (existing) sh.getRange(existing.row, 1, 1, TOPIC_CFG_COLS_.length).setValues([blankRow]);
        else sh.appendRow(blankRow);
        clearSettingsCache_();
        return { success: true, reset: true };
      }
      if (existing) { sh.deleteRow(existing.row); clearSettingsCache_(); }
      return { success: true, removed: true };
    }

    // 페르소나·루브릭 이름 검사 (빈 칸/기본 = 기본값을 따름)
    var personaName = existing ? existing.persona : '', rubricName = existing ? existing.rubric : '';
    if (!isDefault && has('persona')) {
      var pn = cleanName_(p.persona);
      if (pn && normalizeTopic_(pn) !== normalizeTopic_(BASE_NAME_)) {
        var prow = findByName_(readTable_(PERSONA_SHEET_, PERSONA_COLS_), 'name', pn);
        if (!prow) return { success: false, error: "페르소나 '" + pn + "'를 찾지 못했어요. '불러오기'를 눌러 다시 확인해 주세요." };
        personaName = prow.name;
      } else personaName = '';
    }
    if (!isDefault && has('rubric')) {
      var rn = cleanName_(p.rubric);
      if (rn === NO_RUBRIC_ || rn === NO_RUBRIC_WORD_) rubricName = NO_RUBRIC_WORD_;
      else if (rn && normalizeTopic_(rn) !== normalizeTopic_(BASE_NAME_)) {
        var rrow = findByName_(readTable_(RUBRIC_SHEET_, RUBRIC_COLS_), 'name', rn);
        if (!rrow) return { success: false, error: "루브릭 '" + rn + "'를 찾지 못했어요. '불러오기'를 눌러 다시 확인해 주세요." };
        rubricName = rrow.name;
      } else rubricName = '';
    }
    var curTime = existing ? existing.timeLimitMinutes : '', curPairs = existing ? existing.windowPairs : '';
    var nextTime = has('timeLimitMinutes') ? time : curTime, nextPairs = has('windowPairs') ? pairs : curPairs;

    if (isDefault) {
      var defRow = { topic: TOPIC_DEFAULT_, persona: BASE_NAME_, rubric: BASE_NAME_, timeLimitMinutes: nextTime, windowPairs: nextPairs };
      if (existing) sh.getRange(existing.row, 1, 1, TOPIC_CFG_COLS_.length).setValues([profileRowArray_(TOPIC_CFG_COLS_, defRow)]);
      else sh.appendRow(profileRowArray_(TOPIC_CFG_COLS_, defRow));
      clearSettingsCache_();
      return { success: true };
    }

    var same = !personaName && !rubricName && !nextTime && !nextPairs;
    if (same && !inList) { // 목록에 없는 주제의 기본값과 같은 줄은 남기지 않는다(목록에 있는 주제는 빈 칸 줄로 남긴다 — 아래에서 씀)
      if (existing) { sh.deleteRow(existing.row); clearSettingsCache_(); }
      return { success: true, removed: true };
    }
    var rowObj = { topic: existing ? existing.topic : topic, persona: personaName, rubric: rubricName, timeLimitMinutes: nextTime, windowPairs: nextPairs };
    if (existing) sh.getRange(existing.row, 1, 1, TOPIC_CFG_COLS_.length).setValues([profileRowArray_(TOPIC_CFG_COLS_, rowObj)]);
    else sh.appendRow(profileRowArray_(TOPIC_CFG_COLS_, rowObj));
    clearSettingsCache_();
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------
// [Phase 3~4] 학생 화면 초기 데이터 로드 및 대화 처리
// ---------------------------------------------------------
// ---------------------------------------------------------
// 탐구 자료: 주제별 실험 과정·준비물·유의사항을 '탐구자료' 탭에 한 줄씩 저장하고,
// 학생이 고른 주제와 일치하는 한 줄만 시스템 프롬프트에 붙인다.
// (요청마다 독립적으로 주제를 받으므로 여러 모둠이 서로 다른 주제로 동시에 진행해도 섞이지 않는다)
// ---------------------------------------------------------
var MATERIAL_SHEET_NAME_ = '탐구자료';
var MATERIAL_MAX_FIELD_ = 1500;
var MATERIAL_MAX_TOTAL_ = 3000;

function normalizeTopic_(t) {
  return (t == null ? '' : String(t)).replace(/\s+/g, ' ').trim().toLowerCase();
}

function materialCacheKey_(topic) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, normalizeTopic_(topic), Utilities.Charset.UTF_8);
  return 'tmat1_' + bytes.map(function(b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function readMaterialRows_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MATERIAL_SHEET_NAME_);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues().map(function(r, i) {
    return { row: i + 2, topic: String(r[0]).trim(), procedure: String(r[1] || ''), materials: String(r[2] || ''), safety: String(r[3] || ''), notes: String(r[4] || '') };
  }).filter(function(m) { return m.topic; });
}

function buildMaterialBlock_(m) {
  var lines = [];
  if (m.procedure.trim()) lines.push("- 실험 과정: " + m.procedure.trim());
  if (m.materials.trim()) lines.push("- 준비물: " + m.materials.trim());
  if (m.safety.trim()) lines.push("- 유의사항: " + m.safety.trim());
  if (m.notes.trim()) lines.push("- 교사용 메모(학생에게 직접 말하지 말 것): " + m.notes.trim());
  if (lines.length === 0) return "";
  return "[탐구 자료: " + m.topic + " — 교사가 준비한 참고 자료]\n" +
    "(사용 규칙: 질문을 더 정확하게 하기 위한 참고용이야. 학생에게 통째로 읽어 주거나 정답·예상 결과를 먼저 말하지 마. " +
    "준비물·실험 과정은 학생이 실험을 계획하거나 막혀 있을 때 필요한 만큼만 짚어 줘. " +
    "유의사항이 있으면 첫 응답에서 그 내용을 바탕으로 한 번만 당부하고 이후에는 반복하지 마. 교사용 메모는 학생에게 직접 보여주지 마.)\n" +
    lines.join("\n");
}

// 채팅에서 쓰는 조회. 실패해도 채팅을 막지 않도록 항상 문자열을 돌려준다. 6시간 캐시, 저장할 때 해당 주제 캐시를 비운다.
function getTopicMaterialBlock_(topic) {
  try {
    if (!normalizeTopic_(topic)) return "";
    var cache = CacheService.getScriptCache();
    var key = materialCacheKey_(topic);
    var hit = cache.get(key);
    if (hit !== null) return hit === "-" ? "" : hit;
    var want = normalizeTopic_(topic);
    var found = readMaterialRows_().filter(function(m) { return normalizeTopic_(m.topic) === want; })[0];
    var block = found ? buildMaterialBlock_(found) : "";
    cache.put(key, block || "-", 21600);
    return block;
  } catch (e) {
    Logger.log("⚠️ 탐구 자료 조회 실패: " + e);
    return "";
  }
}

// [API] 교사 콘솔용: 현재 주제 목록과 저장된 자료 전체
function getTopicMaterials() {
  var topicsRaw = requireSheet_('기본설정').getRange(CFG_TOPICS_CELL_).getValue().toString();
  var topics = topicsRaw.split(',').map(function(t) { return t.trim(); }).filter(Boolean);
  var materials = readMaterialRows_().map(function(m) {
    return { topic: m.topic, procedure: m.procedure, materials: m.materials, safety: m.safety, notes: m.notes };
  });
  return { success: true, topics: topics, materials: materials, limits: { field: MATERIAL_MAX_FIELD_, total: MATERIAL_MAX_TOTAL_ } };
}

// 수식으로 해석되지 않도록 =,+,-,@ 로 시작하는 글은 텍스트로 고정해서 쓴다
function safeCell_(v) {
  v = String(v || '');
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

// [API] 한 주제의 자료 저장/삭제. 내용이 전부 비어 있는 저장은 거부하고, 삭제는 remove:true 로만 가능하다.
function saveTopicMaterial(p) {
  var topic = ((p && p.topic) || '').toString().replace(/\s+/g, ' ').trim();
  if (!topic) return { success: false, error: "주제를 선택해 주세요." };
  var remove = p.remove === true;
  var f = {
    procedure: ((p.procedure) || '').toString().trim(),
    materials: ((p.materials) || '').toString().trim(),
    safety: ((p.safety) || '').toString().trim(),
    notes: ((p.notes) || '').toString().trim()
  };
  var total = f.procedure.length + f.materials.length + f.safety.length + f.notes.length;
  if (!remove) {
    if (total === 0) return { success: false, error: "내용이 모두 비어 있어요. 자료를 없애려면 '이 주제 자료 지우기'를 눌러 주세요." };
    for (var k in f) {
      if (f[k].length > MATERIAL_MAX_FIELD_) return { success: false, error: "한 칸은 " + MATERIAL_MAX_FIELD_ + "자까지 입력할 수 있어요." };
    }
    if (total > MATERIAL_MAX_TOTAL_) return { success: false, error: "한 주제의 자료는 모두 합쳐 " + MATERIAL_MAX_TOTAL_ + "자까지예요. (지금 " + total + "자) 토큰 낭비를 막기 위한 제한이에요." };
  }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return { success: false, error: "다른 저장이 진행 중이에요. 잠시 뒤 다시 시도해 주세요." }; }
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(MATERIAL_SHEET_NAME_);
    if (!sh) {
      if (remove) return { success: true };
      sh = ss.insertSheet(MATERIAL_SHEET_NAME_);
      sh.appendRow(['주제', '실험 과정', '준비물', '유의사항', '교사용 메모(AI만 참고)']);
      sh.setFrozenRows(1);
    }
    var want = normalizeTopic_(topic);
    var found = readMaterialRows_().filter(function(m) { return normalizeTopic_(m.topic) === want; })[0];
    if (remove) {
      if (found) sh.deleteRow(found.row);
    } else {
      var rowVals = [topic, safeCell_(f.procedure), safeCell_(f.materials), safeCell_(f.safety), safeCell_(f.notes)];
      if (found) sh.getRange(found.row, 1, 1, 5).setValues([rowVals]);
      else sh.appendRow(rowVals);
    }
    CacheService.getScriptCache().remove(materialCacheKey_(topic));
  } finally {
    lock.releaseLock();
  }
  return { success: true };
}

function getInitialData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var configSheet = requireSheet_('기본설정');
  var values = configSheet.getRange(CFG_LISTS_RANGE_).getValues();

  var parseList = function(val) {
    if (!val) return [];
    return val.toString().split(',').map(function(item) { return item.trim(); }).filter(Boolean);
  };

  var topicList = parseList(values[2][0]);
  var core = readCoreConfig_();
  var characterOf = function(c) { return { id: c.characterId, name: c.characterName, greeting: c.greeting, templateKey: c.templateKey }; };

  // 주제마다 다른 캐릭터·인사말·템플릿·제한 시간 (학생 화면은 주제를 고르는 순간 이 값을 쓴다. 페르소나·루브릭 내용은 내려보내지 않는다)
  var topicConfigs = {}, qnaTopics = [];
  topicList.forEach(function(t) {
    var c = resolveTopicConfig_(core, t);
    topicConfigs[t] = { timeLimitMinutes: c.timeLimitMinutes, character: characterOf(c) };
    if (c.templateKey === 'qna') qnaTopics.push(t);
  });
  var base = resolveTopicConfig_(core, '');

  return {
    // 최상위 값은 '기본' 설정: 주제별 값을 모르는 옛 학생 화면이 그대로 쓰도록 남겨 둔다
    timeLimitMinutes: base.timeLimitMinutes,
    classList: parseList(values[0][0]),
    groupList: parseList(values[1][0]),
    topicList: topicList,
    topicConfigs: topicConfigs,
    settingsFallback: !!core.fallback, // true 면 세부설정 탭을 만들거나 읽지 못해 기본 상태(소크라테스)로 대신 동작 중 (진단용)
    // 탐구 도우미로 연결된 주제 중, 교사가 아직 탐구 자료를 입력하지 않아 학생이 고를 수 없는 주제들
    missingMaterialTopics: qnaTopics.length ? topicsMissingMaterial_(qnaTopics) : [],
    character: characterOf(base)
  };
}

// 학생 글이 시트에서 수식(=IMAGE(...))으로 실행되거나 숫자/날짜(예: 반 이름 "3-1")로 바뀌지 않도록
// 문자열 칸은 앞에 '를 붙여 텍스트로 저장한다. (읽을 때는 '가 보이지 않는다)
function cellText_(v) {
  v = (v == null) ? "" : String(v);
  return v === "" ? "" : "'" + v;
}

// 채팅기록 한 줄: A 날짜, B 시간, C 학급, D 모둠, E 주제, F 학생 발화, G AI 응답/상태,
// H 그때 쓴 페르소나 이름, I 그때 쓴 루브릭 이름('-' = 평가 안 함). 분석은 I열로 어떤 대화를 어떤 루브릭으로 평가할지 가른다.
// (옛 기록: H가 'qna'면 평가 제외, H·I가 비어 있으면 지금 루브릭으로 평가)
function recordRow_(dateStr, timeStr, classValue, groupValue, topicValue, studentText, replyText, personaName, rubricName) {
  return [dateStr, timeStr, cellText_(classValue), cellText_(groupValue), cellText_(topicValue), cellText_(studentText), cellText_(replyText),
    cellText_(personaName || ""), cellText_(rubricName || "")];
}

// H1·I1 열 이름이 비어 있거나 옛 이름('모드')이면 새 이름으로 적는다 (시트를 직접 열어 볼 때 알아보기 쉽게). 6시간에 한 번만 확인한다.
function ensureLogHeaders_(recordSheet) {
  try {
    var cache = CacheService.getScriptCache();
    if (cache.get('log_hdr_v1')) return;
    var cur = recordSheet.getRange("H1:I1").getValues()[0];
    if (!cur[0] || cur[0] === "모드") recordSheet.getRange("H1").setValue("페르소나");
    if (!cur[1]) recordSheet.getRange("I1").setValue("루브릭");
    cache.put('log_hdr_v1', '1', 21600);
  } catch (e) {}
}

// 탐구 자료가 입력되어 있지 않은 주제 이름 목록 (탐구 도우미에서 학생이 아직 쓸 수 없는 주제)
function topicsMissingMaterial_(topics) {
  var have = {};
  readMaterialRows_().forEach(function(m) {
    if ((m.procedure + m.materials + m.safety + m.notes).trim() !== "") have[normalizeTopic_(m.topic)] = true;
  });
  return topics.filter(function(t) { return !have[normalizeTopic_(t)]; });
}

// 오늘 날짜의 이 학급/모둠 기록만 골라 돌려준다
function loadTodayRecords_(recordSheet, dateStr, classValue, groupValue) {
  var out = [];
  var all = recordSheet.getDataRange().getValues();
  for (var r = 1; r < all.length; r++) {
    var rawD = all[r][0];
    var dStr = (rawD instanceof Date) ? Utilities.formatDate(rawD, "Asia/Seoul", "yyyy-MM-dd") : rawD.toString().trim();
    if (dStr === dateStr && all[r][2].toString().trim() === classValue && all[r][3].toString().trim() === groupValue) {
      out.push(all[r]);
    }
  }
  return out;
}

// AI 가 [강제차단]한 모둠은 이 시간(분) 동안 새로고침해도 대화할 수 없다 (오차단이 하루 종일 가지 않도록 시간을 둔다)
var AI_BLOCK_COOLDOWN_MIN_ = 10;

// 채팅기록의 시간 칸(시간 서식이면 Date, 아니면 'HH:mm' 글자)을 '하루 중 몇 분'으로. 읽을 수 없으면 -1.
function minutesOfDay_(v) {
  var s = (v instanceof Date) ? Utilities.formatDate(v, "Asia/Seoul", "HH:mm") : String(v == null ? "" : v).trim();
  var m = /^(\d{1,2}):(\d{2})/.exec(s);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : -1;
}

// 오늘 이 모둠이 차단 상태면 학생 화면에 보낼 응답, 아니면 null.
//  - 금지어 3회 누적([시스템 차단])은 그날 하루 내내
//  - AI 차단([AI 차단])은 마지막 차단부터 AI_BLOCK_COOLDOWN_MIN_ 분 동안
// rows 는 loadTodayRecords_ 의 결과(오늘 이 학급·모둠의 줄), timeStr 은 지금 시각 'HH:mm'.
function groupBlockedReply_(rows, timeStr) {
  var isAlreadyBlocked = rows.some(function(row) {
    return row[6].toString().indexOf("[시스템 차단]") !== -1;
  });
  if (isAlreadyBlocked) {
    return {
      success: true,
      isBlocked: true,
      aiReply: "🚫 부적절한 언어 사용 누적으로 오늘 탐구 대화가 차단된 모둠입니다. 선생님께 문의해 주세요."
    };
  }
  var nowMin = minutesOfDay_(timeStr), blockedMin = -1;
  rows.forEach(function(row) {
    if (row[6].toString().indexOf("[AI 차단]") === -1) return;
    var m = minutesOfDay_(row[1]);
    if (m >= 0 && m <= nowMin && m > blockedMin) blockedMin = m;
  });
  if (blockedMin >= 0 && nowMin - blockedMin < AI_BLOCK_COOLDOWN_MIN_) {
    return {
      success: true,
      isBlocked: true,
      aiReply: "🚫 수업과 무관한 말이 이어져 잠시 대화가 멈췄어요. 약 " + (AI_BLOCK_COOLDOWN_MIN_ - (nowMin - blockedMin)) + "분 뒤에 다시 시도해 주세요."
    };
  }
  return null;
}

// ───────── 탐구 마무리 피드백 ─────────
// 제한 시간이 끝나 학생 화면에 '오늘의 탐구 요약'이 뜰 때, 대화 전체를 보고 학생에게 줄 짧은 피드백(FEEDBACK_MAX_CHARS_ 자 이내)을 만든다.
// 시트에는 기록하지 않는다(분석·기록 집계에 섞이지 않게). 차단된 모둠과 학생이 한 마디도 하지 않은 대화는 AI를 부르지 않는다.
var FEEDBACK_MAX_CHARS_ = 100;
var FEEDBACK_TRANSCRIPT_MAX_ = 8000; // AI에 보내는 대화 글자 수 상한 (최근 것부터 남긴다)
// 대화 방식(템플릿)마다 피드백이 볼 점 (학생 화면의 논증 가이드와 같은 흐름)
var FEEDBACK_FOCUS_ = {
  socratic: "주장(가설)에 근거와 이유를 붙여 생각을 이어 갔는지",
  cer: "주장 → 증거(관찰·측정값) → 추론(과학 원리)의 세 걸음을 갖췄는지",
  advanced: "주장·근거·정당화에 더해 반례나 예외를 생각하고, 주장이 맞는 조건(한정어)을 밝혔는지",
  debate: "입장을 정하고 근거를 대며, 상대 반론에 재반박하고 조건을 붙여 정리했는지",
  qna: "실험 방법·준비물·안전에 대해 궁금한 점을 구체적으로 묻고 스스로 확인하려 했는지"
};

// 모델이 낸 피드백을 화면에 올릴 한두 문장으로 다듬는다: 마크다운·따옴표·태그를 지우고 FEEDBACK_MAX_CHARS_ 자로 자른다(문장 끝에서 자르기 우선).
function clampFeedback_(text) {
  var s = String(text == null ? "" : text)
    .replace(/\[강제차단\]/g, "")
    .replace(/[*#`>_~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”‘’「」]+/, "")
    .replace(/["'“”‘’「」]+$/, "")
    .trim();
  if (s.length <= FEEDBACK_MAX_CHARS_) return s;
  var cut = s.slice(0, FEEDBACK_MAX_CHARS_);
  var end = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
  if (end >= 30) return cut.slice(0, end + 1).trim();
  return s.slice(0, FEEDBACK_MAX_CHARS_ - 1).trim() + "…";
}

function getSessionFeedback(payload) {
  var history = payload.history || [];
  // 학생이 한 마디도 하지 않았으면 피드백할 내용이 없다 (AI 를 부르지 않는다)
  if (!history.some(function(h) { return h.role === "user"; })) return { success: true, feedback: "", skipped: "empty" };

  var recordSheet = requireSheet_('채팅기록');
  var now = new Date();
  var dateStr = Utilities.formatDate(now, "Asia/Seoul", "yyyy-MM-dd");
  var timeStr = Utilities.formatDate(now, "Asia/Seoul", "HH:mm");
  // 차단된 모둠에는 피드백을 주지 않는다 (차단 안내가 마지막 말이 되게)
  if (groupBlockedReply_(loadTodayRecords_(recordSheet, dateStr, payload.classValue, payload.groupValue), timeStr)) {
    return { success: true, feedback: "", skipped: "blocked" };
  }

  var cfg = resolveTopicConfig_(readCoreConfig_(), payload.topicValue);
  var focus = FEEDBACK_FOCUS_[cfg.templateKey] || FEEDBACK_FOCUS_.socratic;
  var lines = [], total = 0;
  for (var i = history.length - 1; i >= 0; i--) {
    var line = (history[i].role === "user" ? "학생: " : "튜터: ") + String(history[i].text).slice(0, 600);
    if (total + line.length > FEEDBACK_TRANSCRIPT_MAX_) break;
    lines.unshift(line); total += line.length;
  }
  var systemText = [
    "너는 중고등학생의 과학 탐구 대화를 돌아보고 짧은 마무리 피드백을 주는 선생님이야.",
    "아래 [대화]는 학생과 AI 튜터가 '" + payload.topicValue + "'를 두고 나눈 대화야.",
    "학생에게 직접 말하듯 친근한 존댓말(해요체)로, " + FEEDBACK_MAX_CHARS_ + "자 이내의 한두 문장만 써.",
    "학생이 잘한 점 한 가지와 다음에 해 볼 점 한 가지를 담아. 이번 대화에서 볼 점: " + focus + ".",
    "정답이나 결론, 실험 결과를 알려 주지 마. 학생 이름 같은 개인정보는 쓰지 마.",
    "학생이 대화에서 실제로 한 말에 근거해서만 칭찬해. 인사말, 제목, 따옴표, 기호, 줄바꿈 없이 피드백 문장만 출력해."
  ].join("\n");
  var apiPayload = {
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{ role: "user", parts: [{ text: "[대화]\n" + lines.join("\n") }] }]
  };
  var apiKey = requireSheet_('환경설정').getRange(ENV_KEY_CELL_).getValue().toString().trim();
  var jsonResp = geminiGenerate_(apiKey, apiPayload);
  var cand = jsonResp.candidates && jsonResp.candidates[0];
  var parts = cand && cand.content && cand.content.parts;
  var feedback = clampFeedback_(parts && parts.length ? parts.map(function(p) { return p.text || ""; }).join("") : "");
  if (!feedback) {
    if (jsonResp.error && jsonResp.error.allKeysExhausted) return { success: false, error: "지금은 AI를 사용할 수 없어요(사용 한도 소진)." };
    Logger.log("⚠️ 마무리 피드백 응답 없음: " + maskSecrets_(JSON.stringify(jsonResp.error || (cand && cand.finishReason) || "empty")));
    return { success: false, error: "피드백을 만들지 못했어요." };
  }
  return { success: true, feedback: feedback };
}

function processChatMessage(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var envSheet = requireSheet_('환경설정');
  var configSheet = requireSheet_('기본설정');
  var recordSheet = requireSheet_('채팅기록');

  var apiKey = envSheet.getRange(ENV_KEY_CELL_).getValue().toString().trim();
  var backupSheetId = envSheet.getRange(ENV_BACKUP_CELL_).getValue().toString().trim();
  var bannedWordsRaw = String(configSheet.getRange(CFG_BANNED_CELL_).getValue() || ""); // 시트 공통 설정: 금지어
  // 학생이 고른 주제에 연결된 설정 한 벌(페르소나·캐릭터·제한 시간·기억 쌍). 서버가 주제로 찾으므로 학생 화면이 바꿀 수 없다.
  var cfg = resolveTopicConfig_(readCoreConfig_(), payload.topicValue);
  // 탐구 도우미는 항상 켤 수 있지만, 교사가 탐구 자료를 입력한 주제에서만 질문을 받는다.
  // (자료가 없으면 AI가 실험 방법을 지어내 답하게 되므로, 기록도 AI 호출도 하지 않고 안내만 한다)
  if (cfg.templateKey === "qna" && !getTopicMaterialBlock_(payload.topicValue)) {
    throw new Error("이 주제는 선생님이 아직 탐구 자료를 준비하지 않았어요. 선생님께 알려 주세요.");
  }

  var pRole = cfg.role;
  var pAction = cfg.action;
  var pRestrict = cfg.restrict;
  var pException = cfg.exception;
  var pExtra = cfg.extra;
  var windowPairs = cfg.windowPairs;

  var sliceCount = windowPairs * 2;
  var now = new Date();
  var dateStr = Utilities.formatDate(now, "Asia/Seoul", "yyyy-MM-dd");
  var timeStr = Utilities.formatDate(now, "Asia/Seoul", "HH:mm");

  // 오늘 이 학급/모둠의 기록만 미리 필터링해서 재사용 (아래 두 방어 로직에서 공용으로 사용)
  var allRecordsToday = loadTodayRecords_(recordSheet, dateStr, payload.classValue, payload.groupValue);

  // ---------------------------------------------------------
  // ★ [0단계 방어 신설] 이미 오늘 차단된 모둠이면 금지어 포함 여부와 무관하게 즉시 차단 유지
  //   (새로고침으로 세션을 새로 시작해 깨끗한 메시지를 보내는 우회를 막음)
  // ---------------------------------------------------------
  // AI 차단([강제차단])은 하루 종일이 아니라 AI_BLOCK_COOLDOWN_MIN_ 분 동안만 유지한다 (새로고침으로 풀리지 않게)
  var blockedReply = groupBlockedReply_(allRecordsToday, timeStr);
  if (blockedReply) return blockedReply;

  // 🛡️ [1단계 방어 업그레이드] 금지어 감지 (2회 경고 후 3회차 강제 차단 삼진아웃제)
  var bannedWords = bannedWordsRaw.split(',').map(function(w) { return w.trim(); }).filter(Boolean);
  var hasBannedWord = false;
  for (var i = 0; i < bannedWords.length; i++) {
    if (payload.userQuestion.indexOf(bannedWords[i]) !== -1) {
      hasBannedWord = true;
      break;
    }
  }

  // ---------------------------------------------------------
  // ★ 금지어 경로: 카운트 계산 + 기록이 원자적이어야 하므로 이 구간만 짧게 락
  //   (Gemini API를 호출하지 않는 짧은 경로라 락을 걸어도 다른 학생 대기시간에 영향 거의 없음)
  // ---------------------------------------------------------
  if (hasBannedWord) {
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(15000);
    } catch (e) {
      throw new Error("요청이 몰려 처리가 지연되었습니다. 잠시 후 다시 전송해 주세요.");
    }

    try {
      // 락을 잡은 뒤에 기록을 다시 읽는다. (같은 모둠이 동시에 두 번 보내도 둘 다 1차 경고가 되지 않도록)
      allRecordsToday = loadTodayRecords_(recordSheet, dateStr, payload.classValue, payload.groupValue);
      // 새로고침 꼼수 방어! "오늘 이 학급/모둠" 기록으로 경고 횟수 계산
      var warningCount = 0;
      allRecordsToday.forEach(function(row) {
        var prevLog = row[6].toString();
        if (prevLog.indexOf("[1차 경고]") !== -1 || prevLog.indexOf("[2차 경고]") !== -1) {
          warningCount++;
        }
      });

      var replyMsg = "";
      var logStatus = "";
      var shouldBlock = false;

      if (warningCount === 0) {
        replyMsg = "⚠️ [1차 경고] 부적절한 단어가 감지되었습니다! 바르고 고운 언어로 탐구에 참여해주세요. (누적 3회 시 챗봇이 강제 차단됩니다.)";
        logStatus = "⚠️ [1차 경고] 금지어 사용";
      } else if (warningCount === 1) {
        replyMsg = "🚨 [2차 경고 - 최종] 또다시 부적절한 단어가 감지되었습니다! 한 번만 더 사용하면 즉시 챗봇이 강제 차단되고 선생님께 보고됩니다.";
        logStatus = "🚨 [2차 경고] 금지어 사용";
      } else {
        replyMsg = "🚫 [강제 차단] 부적절한 언어 사용이 3회 누적되어 탐구 대화가 강제 차단되었습니다.";
        logStatus = "🚫 [시스템 차단] 금지어 3회 누적";
        shouldBlock = true;
      }

      var rowData = recordRow_(dateStr, timeStr, payload.classValue, payload.groupValue, payload.topicValue, payload.userQuestion, logStatus, cfg.personaName, cfg.rubricName);
      recordSheet.appendRow(rowData);
      ensureLogHeaders_(recordSheet);
      if (backupSheetId) {
        try { SpreadsheetApp.openById(backupSheetId).getSheets()[0].appendRow(rowData); } catch(e) {}
      }

      return { success: true, isBlocked: shouldBlock, aiReply: replyMsg };
    } catch (err) {
      throw new Error("오류 발생: " + err.message);
    } finally {
      lock.releaseLock();
    }
  }

  // ---------------------------------------------------------
  // ★ 정상 대화 처리: Gemini API 호출(2~5초 소요)은 락 없이 실행
  //   → 여러 모둠이 동시에 각자 호출을 진행할 수 있음 (더 이상 한 번에 한 명씩 처리되지 않음)
  // ---------------------------------------------------------
  try {
    var systemInstructionText = [
      "[역할]\n" + pRole, "[행동 지침]\n" + pAction, "[제한 사항]\n" + pRestrict,
      "[예외 대처]\n" + pException, "[추가 참고]\n" + pExtra,
      getTopicMaterialBlock_(payload.topicValue), // 이 주제의 교사 자료 (없으면 빈 문자열)
      "\n[현재 논의 중인 학생 정보]", "- 소속: " + payload.classValue + " " + payload.groupValue, "- 탐구 주제: " + payload.topicValue
    ].join("\n");

    var contentsArr = [];

    var cleanHistory = [];
    if (payload.history && payload.history.length > 0) {
      for (var h = 0; h < payload.history.length; h++) {
        if (h === 0 && payload.history[h].role === "ai") continue;
        cleanHistory.push(payload.history[h]);
      }
    }

    var trimmedHistory = cleanHistory.slice(-sliceCount);
    trimmedHistory.forEach(function(item) {
      contentsArr.push({ role: item.role === "ai" ? "model" : "user", parts: [{ text: item.text }] });
    });

    contentsArr.push({ role: "user", parts: [{ text: payload.userQuestion }] });

    var apiPayload = { systemInstruction: { parts: [{ text: systemInstructionText }] }, contents: contentsArr };

    var jsonResp = geminiGenerate_(apiKey, apiPayload); // ★ 락 밖에서 실행

    // AI가 답을 주지 못한 경우(오류, 안전 필터, 빈 응답)는 기록하지 않고 학생 화면에 '다시 보내기'를 안내한다
    // (오류 문구가 AI 응답으로 시트에 쌓여 분석에 섞이는 것을 막는다)
    var cand = jsonResp.candidates && jsonResp.candidates[0];
    var parts = cand && cand.content && cand.content.parts;
    var aiReply = parts && parts.length ? parts.map(function(p) { return p.text || ""; }).join("").trim() : "";
    if (!aiReply) {
      if (jsonResp.error && jsonResp.error.allKeysExhausted) throw new Error("지금은 AI를 사용할 수 없어요(사용 한도 소진). 선생님께 알려 주세요.");
      var why = jsonResp.error ? "AI 서버가 바쁘거나 오류가 났어요" : (cand && cand.finishReason === "SAFETY" ? "AI가 이 문장에는 답하지 못했어요" : "AI 응답이 비어 있어요");
      Logger.log("⚠️ Gemini 응답 없음: " + maskSecrets_(JSON.stringify(jsonResp.error || (cand && cand.finishReason) || "empty")));
      throw new Error(why + ". 잠시 뒤 다시 보내 주세요.");
    }

    // 🛡️ [2단계 방어] AI가 감지한 헛소리/장난 차단 태그 확인
    var isBlockedByAI = false;
    if (aiReply.indexOf('[강제차단]') !== -1) {
      isBlockedByAI = true;
      aiReply = aiReply.replace('[강제차단]', '').trim();
      aiReply = "🚫 수업과 무관한 헛소리 및 장난이 지속되어 챗봇이 강제 차단되었습니다.\n\n" + aiReply;
    }

    var logMsg = isBlockedByAI ? "🚫 [AI 차단] 헛소리/장난" : aiReply;
    var rowData2 = recordRow_(dateStr, timeStr, payload.classValue, payload.groupValue, payload.topicValue, payload.userQuestion, logMsg, cfg.personaName, cfg.rubricName);

    // ★ 시트 기록 저장은 짧게만 락 (동시 append로 인한 행 순서 꼬임 방지)
    var writeLock = LockService.getScriptLock();
    try {
      writeLock.waitLock(10000);
      recordSheet.appendRow(rowData2);
      ensureLogHeaders_(recordSheet);
    } catch (lockErr) {
      // 락 획득에 실패해도 학생에게는 이미 받은 AI 응답을 보여줘야 하므로, 기록 실패는 로그만 남김
      Logger.log("⚠️ 기록 저장 락 획득 실패: " + lockErr.message);
    } finally {
      try { writeLock.releaseLock(); } catch (releaseErr) {}
    }

    // 백업 시트는 느릴 수 있어(다른 파일 열기) 잠금이 풀린 뒤에 기록한다 — 안에서 하면 다른 학생들이 줄을 서게 된다
    if (backupSheetId) {
      try { SpreadsheetApp.openById(backupSheetId).getSheets()[0].appendRow(rowData2); } catch(e) {}
    }
    return { success: true, isBlocked: isBlockedByAI, aiReply: aiReply };

  } catch (err) {
    throw new Error("오류 발생: " + err.message);
  }
}

// ---------------------------------------------------------
// [JSON API 전용] 결과 분석 화면의 학급 → 주제 → 모둠 단추가 쓴다: 대화 기록(채팅기록)이 어느 학급·주제·모둠에 얼마나 있는지 센다.
// 시트를 읽기만 한다(쓰기·Gemini 호출 없음). apiAnalyze 와 같은 이름 규칙(앞뒤 공백만 뺀 정확 일치)과 같은 '평가 제외' 기준
// (H열 'qna' 또는 I열 '-')을 써서, 여기서 '기록 없음'이면 분석도 비어 있도록 맞춘다.
//   combos: [{ classValue, topicValue, groupValue, total(모든 기록), analyzable(평가 대상), last('날짜 시간'),
//              dates: [{ date('yyyy-MM-dd'), total, analyzable }] (날짜순 — 결과 분석의 4단계 '날짜' 단추) }]
// ---------------------------------------------------------
// 채팅기록 A열(날짜)을 'yyyy-MM-dd' 글자로. 실제 시트는 날짜 칸을 Date 로 돌려주기도 한다. apiAnalyze 의 날짜 고르기와 같은 규칙.
function chatDateKey_(v) {
  return (v instanceof Date) ? Utilities.formatDate(v, "Asia/Seoul", "yyyy-MM-dd") : String(v == null ? "" : v).trim();
}

function apiChatOverview() {
  var rows = requireSheet_('채팅기록').getDataRange().getValues();
  var cell = function(r, i) { return r[i] == null ? "" : String(r[i]).trim(); };
  var byKey = {}, list = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i], c = cell(r, 2), g = cell(r, 3), t = cell(r, 4);
    if (!c || !g || !t) continue; // 학급·모둠·주제가 빈 줄(손으로 지운 줄 등)은 어느 단추에도 속하지 않는다
    var key = c + "\u0001" + t + "\u0001" + g;
    var e = byKey[key];
    if (!e) { e = byKey[key] = { classValue: c, topicValue: t, groupValue: g, total: 0, analyzable: 0, lastIndex: i, dates: {} }; list.push(e); }
    var ok = cell(r, 7) !== "qna" && cell(r, 8) !== NO_RUBRIC_;
    e.total++;
    if (ok) e.analyzable++;
    var d = chatDateKey_(r[0]);
    var de = e.dates[d] || (e.dates[d] = { date: d, total: 0, analyzable: 0 });
    de.total++;
    if (ok) de.analyzable++;
    e.lastIndex = i; // 기록은 위에서 아래로 쌓이므로 마지막으로 본 줄이 가장 최근이다
  }
  var stamp = function(v, fmt) { return (v instanceof Date) ? Utilities.formatDate(v, "Asia/Seoul", fmt) : String(v == null ? "" : v); };
  var combos = list.map(function(e) { // 시각 서식은 조합마다 한 번만 만든다(기록이 많아도 느려지지 않게)
    var r = rows[e.lastIndex];
    var dates = Object.keys(e.dates).sort().map(function(k) { return e.dates[k]; });
    return { classValue: e.classValue, topicValue: e.topicValue, groupValue: e.groupValue, total: e.total, analyzable: e.analyzable,
      last: (stamp(r[0], "yyyy-MM-dd") + " " + stamp(r[1], "HH:mm")).trim(), dates: dates };
  });
  return { success: true, data: { combos: combos } };
}

// ---------------------------------------------------------
// [JSON API 전용] 교사 콘솔의 "결과 분석" 단계가 호출한다. 시트에 결과를 쓰지 않고 결과 객체를 그대로 반환한다.
// ---------------------------------------------------------
// targetDate: 'yyyy-MM-dd' 면 그날의 대화만, 비우면 모든 날짜를 함께 분석한다 (같은 주제를 여러 날 나눠 한 경우 섞이지 않게).
function apiAnalyze(targetClass, targetGroup, targetTopic, useMaterial, rubricName, targetDate) {
  targetClass = (targetClass || "").toString().trim();
  targetGroup = (targetGroup || "").toString().trim();
  targetTopic = (targetTopic || "").toString().trim();
  targetDate = (targetDate || "").toString().trim();
  rubricName = cleanName_(rubricName);
  if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return { success: false, error: "날짜 형식이 올바르지 않아요." };

  if (!targetClass || !targetGroup || !targetTopic) {
    return { success: false, error: "학급, 모둠, 탐구 주제를 모두 선택해 주세요." };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var recordSheet = requireSheet_('채팅기록');
  var envSheet = requireSheet_('환경설정');

  var apiKey = envSheet.getRange(ENV_KEY_CELL_).getValue().toString().trim();
  var core = readCoreConfig_(true);
  var cfg = resolveTopicConfig_(core, targetTopic);
  var rubricTable = readRubricTable_();

  // 이 주제·모둠의 기록을 모은다. 평가하지 않는 대화(I열 '-', 옛 기록의 H열 'qna')는 세어 두고 건너뛴다.
  var allRecords = recordSheet.getDataRange().getValues();
  var topicRows = [], excludedQna = 0;
  for (var i = 1; i < allRecords.length; i++) {
    if (allRecords[i][2].toString().trim() === targetClass &&
        allRecords[i][3].toString().trim() === targetGroup &&
        allRecords[i][4].toString().trim() === targetTopic) {
      if (targetDate && chatDateKey_(allRecords[i][0]) !== targetDate) continue; // 고른 날짜의 대화만
      if (String(allRecords[i][7] || "").trim() === "qna" || String(allRecords[i][8] || "").trim() === NO_RUBRIC_) { excludedQna++; continue; }
      topicRows.push({ rec: allRecords[i], rubric: String(allRecords[i][8] || "").trim() });
    }
  }

  // 어떤 루브릭으로 평가할까: 요청한 이름 → 이 주제의 지금 루브릭 → (지금 평가 안 하는 주제면) 가장 최근 대화의 루브릭
  var chosenName = rubricName || (cfg.noRubric ? "" : cfg.rubricName);
  if (!chosenName) {
    for (var q = topicRows.length - 1; q >= 0 && !chosenName; q--) chosenName = topicRows[q].rubric;
    chosenName = chosenName || BASE_NAME_;
  }
  var chosenKey = normalizeTopic_(chosenName);
  var chosenRow = findByName_(rubricTable, 'name', chosenName);
  if (!chosenRow && rubricName) return { success: false, error: "'" + rubricName + "' 루브릭을 찾을 수 없어요. 루브릭이 지워졌거나 이름이 바뀌었을 수 있어요." };
  var rubricFallback = false;
  if (!chosenRow) { chosenRow = baseRubric_(rubricTable); rubricFallback = true; } // 주제가 가리키는 루브릭이 없으면 '기본'으로
  var rub = mergeBlank_(chosenRow, baseRubric_(rubricTable), RUBRIC_COLS_);
  var rRole = rub.role, rCriteria = rub.criteria, rLevel = rub.level, rGuideline = rub.guideline;
  chosenName = chosenRow.name || chosenName;

  // 선택한 루브릭으로 진행한 대화(기록에 루브릭 이름이 없는 옛 대화 포함)만 분석한다. 나머지는 개수만 알려 준다.
  var otherCounts = {};
  var rowsToUse = topicRows.filter(function(x) {
    if (!x.rubric || normalizeTopic_(x.rubric) === chosenKey || (rubricFallback && !findByName_(rubricTable, 'name', x.rubric))) return true;
    otherCounts[x.rubric] = (otherCounts[x.rubric] || 0) + 1;
    return false;
  });
  var otherRubrics = Object.keys(otherCounts).map(function(n) { return { name: n, count: otherCounts[n], exists: !!findByName_(rubricTable, 'name', n) }; });

  var filteredChat = [];
  var chatTextForPrompt = "";
  var utteranceIndex = 1;

  rowsToUse.forEach(function(x) {
    var rec = x.rec;
    var rawDate = rec[0];
    var date = (rawDate instanceof Date) ? Utilities.formatDate(rawDate, "Asia/Seoul", "yyyy-MM-dd") : rawDate.toString();

    var rawTime = rec[1];
    var time = (rawTime instanceof Date) ? Utilities.formatDate(rawTime, "Asia/Seoul", "HH:mm") : rawTime.toString();

    var studentQ = rec[5];
    var aiA = rec[6];

    filteredChat.push({ no: utteranceIndex, date: date, time: time, text: studentQ, aiReply: aiA });
    chatTextForPrompt += "[발화 " + utteranceIndex + " - " + date + " " + time + "] 학생: " + studentQ + "\n(AI 조언: " + aiA + ")\n\n";
    utteranceIndex++;
  });

  if (filteredChat.length === 0) {
    var where = targetClass + " " + targetGroup + " · " + targetTopic + (targetDate ? " (" + targetDate + ")" : "");
    var emptyMsg;
    if (otherRubrics.length) {
      emptyMsg = where + "의 대화는 모두 다른 루브릭(" + otherRubrics.map(function(o) { return "'" + o.name + "' " + o.count + "건"; }).join(", ") + ")으로 진행됐어요. 그 루브릭을 골라 분석해 주세요.";
    } else if (excludedQna > 0) {
      emptyMsg = where + "의 대화 " + excludedQna + "건은 '탐구 도우미' 대화라 논증 평가에서 제외돼요.";
    } else {
      emptyMsg = where + "의 대화 기록이 없습니다.";
    }
    return { success: false, empty: true, excludedQna: excludedQna, otherRubrics: otherRubrics, error: emptyMsg };
  }
  if (!String(rCriteria || "").trim()) {
    return { success: false, error: "'" + chosenName + "' 루브릭의 요소별 판정 기준이 비어 있어요. 기본 설정의 평가 루브릭 탭에서 채워 주세요." };
  }

  // 교사가 입력한 이 주제의 탐구 자료가 있으면 분석에도 참고하게 한다 (useMaterial === false 면 건너뜀)
  var materialText = (useMaterial === false || useMaterial === "false") ? "" : getTopicMaterialForAnalysis_(targetTopic);

  var systemPrompt = [
    "[역할]\n" + rRole, "[요소별 판정 기준]\n" + rCriteria, "[종합 평가 루브릭]\n" + rLevel, "[피드백 작성 지침]\n" + rGuideline,
    materialText,
    CONTEXT_GUIDE_,
    "각 발화의 \"elements\"에는 그 발화 안에 실제로 들어 있는 논증 요소를 모두 적고(예: [\"[주장]\",\"[근거]\",\"[정당화]\"]), \"judgment\"에는 그중 가장 두드러진 하나만 적어. overallLevel은 elements까지 고려해 판정해.",
    "\n위 기준을 바탕으로 제공된 대화를 툴민 논증 구조로 분석하고, 반드시 아래의 JSON 형식으로만 응답해. 백틱(```json) 없이 순수 JSON만 출력할 것.",
    "{",
    '  "utterances": [',
    '    { "no": 1, "judgment": "[주장]", "elements": ["[주장]"], "evaluation": "가설의 형태를 잘 갖춤." }',
    "  ],",
    '  "contexts": [',
    '    { "utterances": [1, 2, 3], "title": "온도와 속도 가설", "linkage": "상", "evaluation": "이 맥락에서 주장-근거-정당화가 어떻게 이어졌는지 한두 문장" }',
    "  ],",
    '  "contextSummary": "맥락 구조 전체에 대한 한두 문장",',
    '  "overallLevel": "Level 2",',
    '  "overallFeedback": "종합 피드백 내용..."',
    "}"
  ].join("\n");

  var payload = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: "분석할 대화 기록:\n" + chatTextForPrompt }] }]
  };
  // AI가 JSON 형식을 어겨 해석에 실패하는 경우가 드물게 있어(검증 중 132회 중 1회), 한 번 더 시도한다
  var analysisResult = null;
  for (var tryNo = 0; tryNo < 2 && !analysisResult; tryNo++) {
    var jsonResp = geminiGenerate_(apiKey, payload);
    if (!jsonResp.candidates || !jsonResp.candidates[0]) {
      var errMsg = geminiErrorMessage_(jsonResp);
      return { success: false, error: errMsg };
    }
    var cand0 = jsonResp.candidates[0];
    var replyParts = cand0.content && cand0.content.parts ? cand0.content.parts : [];
    var parsed = parseJsonLoose_(replyParts.map(function(p) { return p.text || ""; }).join(""));
    if (parsed && Array.isArray(parsed.utterances)) analysisResult = parsed;
  }
  if (!analysisResult) {
    return { success: false, error: "AI의 분석 결과를 해석하지 못했어요. 잠시 뒤 다시 분석해 주세요." };
  }

  var utterances = filteredChat.map(function(f) {
    var match = analysisResult.utterances.filter(function(u) { return u && Number(u.no) === f.no; })[0];
    return {
      no: f.no,
      date: f.date,
      time: f.time,
      text: f.text,
      aiReply: f.aiReply ? f.aiReply.toString() : "",
      judgment: match ? normalizeJudgment_(match.judgment) : "",
      elements: match ? normalizeElements_(match.elements, match.judgment) : [],
      evaluation: match ? String(match.evaluation || "") : ""
    };
  });

  // 맥락 묶음은 형식만 검증해서 돌려준다 (겹침 정리·완결 여부 계산은 화면에서 한다)
  var contexts = (Array.isArray(analysisResult.contexts) ? analysisResult.contexts : []).map(function(c) {
    var nums = (c && Array.isArray(c.utterances) ? c.utterances : []).map(Number).filter(function(n) { return n >= 1 && n <= filteredChat.length; });
    return {
      utterances: nums,
      title: String((c && c.title) || "").slice(0, 40),
      linkage: ["상", "중", "하"].indexOf(c && c.linkage) >= 0 ? c.linkage : "-",
      evaluation: String((c && c.evaluation) || "")
    };
  }).filter(function(c) { return c.utterances.length > 0; });

  // 결과 화면이 입력 폼이 아니라 응답만으로 그릴 수 있게: 평가에 쓴 루브릭 이름, 대화의 템플릿 종류, 루브릭의 최고 Level
  // 대화의 템플릿 종류는 그 대화를 나눈 페르소나의 템플릿이다 (루브릭의 '권장 템플릿' 칸은 더 이상 쓰지 않는다). 그 페르소나가 없어졌으면 이 주제의 지금 페르소나를 따른다.
  var lastPersonaRow = findByName_(core.personas, 'name', String(rowsToUse[rowsToUse.length - 1].rec[7] || "").trim());
  var lastPersona = lastPersonaRow ? mergeBlank_(lastPersonaRow, basePersona_(core), PERSONA_COLS_) : null;
  var levelNums = (String(rLevel || "").match(/Level\s*([1-9])/gi) || []).map(function(m) { return parseInt(m.replace(/\D/g, ""), 10); });

  return {
    success: true,
    overallLevel: normalizeLevel_(analysisResult.overallLevel),
    overallFeedback: String(analysisResult.overallFeedback || ""),
    contexts: contexts,
    contextSummary: String(analysisResult.contextSummary || ""),
    materialUsed: !!materialText,
    excludedQna: excludedQna,
    rubricName: chosenName,
    rubricFallback: rubricFallback,
    currentRubricName: cfg.noRubric ? "" : cfg.rubricName, // 이 주제에 지금 연결된 루브릭(평가 안 하는 주제면 빈 문자열)
    otherRubrics: otherRubrics,
    dateValue: targetDate, // 분석한 날짜('' = 모든 날짜)
    templateKey: (lastPersona && lastPersona.templateKey) || cfg.templateKey || "",
    levelMax: levelNums.length ? Math.max.apply(null, levelNums) : 0,
    utterances: utterances
  };
}

// 앞뒤에 설명문이 붙거나 ```json 울타리가 있어도 첫 { 부터 마지막 } 까지를 JSON 으로 읽는다. 실패하면 null.
function parseJsonLoose_(text) {
  var t = String(text || "").replace(/```json/g, "").replace(/```/g, "");
  var a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
}

// 판정은 허용된 요소 이름만 "[이름]" 형태로 돌려준다 (AI가 엉뚱한 문자열을 주면 빈 값 = 미분류)
var JUDGMENT_TAGS_ = ["판단 유보", "정당화", "한정어", "주장", "근거", "증거", "추론", "반박", "회피", "질문", "일탈"];
function normalizeJudgment_(raw) {
  var t = String(raw || "").replace(/[\[\]\s]/g, "");
  if (t.indexOf("판단유보") !== -1) return "[판단 유보]";
  for (var i = 1; i < JUDGMENT_TAGS_.length; i++) {
    if (t.indexOf(JUDGMENT_TAGS_[i]) !== -1) return "[" + JUDGMENT_TAGS_[i] + "]";
  }
  return "";
}

// 발화 안에 실제로 든 요소 목록(복수). 비어 있으면 대표 판정 하나로 대신한다.
function normalizeElements_(rawList, judgment) {
  var out = [];
  (Array.isArray(rawList) ? rawList : []).forEach(function(x) {
    var t = normalizeJudgment_(x);
    if (t && out.indexOf(t) === -1) out.push(t);
  });
  if (out.length === 0) { var j = normalizeJudgment_(judgment); if (j) out.push(j); }
  return out;
}

// "Level 3 → 4", "Level 3.5" 같은 값도 첫 번째 정수 하나로 정리한다
function normalizeLevel_(raw) {
  var m = String(raw || "").match(/Level\s*([1-9])/i) || String(raw || "").match(/([1-9])/);
  return m ? "Level " + m[1] : "";
}

// 분석 단계용 탐구 자료 문구 (채팅용과 달리 '학생 발화를 평가하는 참고자료'로 쓰도록 안내한다). 없으면 빈 문자열.
function getTopicMaterialForAnalysis_(topic) {
  try {
    var want = normalizeTopic_(topic);
    if (!want) return "";
    var m = readMaterialRows_().filter(function(r) { return normalizeTopic_(r.topic) === want; })[0];
    if (!m) return "";
    var lines = [];
    if (m.procedure.trim()) lines.push("- 실험 과정: " + m.procedure.trim());
    if (m.materials.trim()) lines.push("- 준비물: " + m.materials.trim());
    if (m.safety.trim()) lines.push("- 유의사항: " + m.safety.trim());
    if (m.notes.trim()) lines.push("- 교사용 메모(예상 결과·흔한 오개념): " + m.notes.trim());
    if (lines.length === 0) return "";
    return "[탐구 자료: " + m.topic + " — 교사가 준비한 참고 자료]\n" +
      "(활용 규칙: 학생 발화가 이 실험의 과정·준비물·핵심 개념과 어떻게 맞닿아 있는지 살피는 참고용이야. " +
      "[요소별 판정 기준]과 레벨 기준은 그대로 따르고, 이 자료 때문에 판정 요소(주장/근거 등)를 바꾸지는 마. " +
      "학생의 말이 자료와 달라 보이면 단정적으로 틀렸다고 하지 말고 '자료의 ~와 다르게 보인다'처럼 evaluation에 구체적으로 짚어 줘. " +
      "교사용 메모에 적힌 오개념과 겹치는 발화는 evaluation에 오개념 가능성을 밝혀. " +
      "학생 발화에 실제로 나타난 실험 과정·유의사항 언급이 있을 때만 그 발화를 인용해 한 문장으로 쓰고, 학생이 말하지 않은 것은 칭찬하지 말고 '언급하지 않았다'고 쓰거나 생략해. " +
      "[피드백 작성 지침]의 '교과 지식의 정오답은 언급하지 않는다'는 항목은 이 자료와 비교하는 내용에 한해 예외로 한다.)\n" +
      lines.join("\n");
  } catch (e) {
    Logger.log("⚠️ 분석용 탐구 자료 조회 실패: " + e);
    return "";
  }
}

// 모든 템플릿 공통의 '담화 맥락' 분석 지침: 요소들이 하나의 맥락으로 이어지는지를 레벨·피드백 판정에 반영하게 한다
var CONTEXT_GUIDE_ = [
  "[맥락 분석 지침]",
  "학생 발화를 '하나의 맥락' 단위로 묶어 줘. 맥락이란 같은 쟁점(하나의 주장과, 그 주장을 둘러싼 근거·정당화·반박·한정어)을 이어서 다루는 연속된 발화 묶음이야.",
  "- 맥락은 발화 번호의 연속 구간이고, 시간 순서대로 서로 겹치지 않게 나눠. 모든 발화는 정확히 한 맥락에 속해야 해.",
  "- 학생이 새로운 주장이나 새로운 쟁점을 꺼내면 새 맥락을 시작해. 탐구와 무관한 [일탈]이나 [회피] 발화가 이어지면 앞 논증 맥락에 넣지 말고 별도의 맥락으로 묶어(title 예: '주제 이탈').",
  "- 발화 기록의 날짜가 바뀌면(다른 날 수업) 같은 맥락으로 묶지 말고 새 맥락으로 시작해.",
  "- title은 그 맥락이 다루는 내용을 15자 이내로 써.",
  "- linkage는 맥락 안에서 뒤 발화가 앞 발화(주장→근거→정당화 …)에 실제로 이어지는 정도야. '상'(명확히 이어짐) / '중'(이어지지만 비약이나 빈틈이 있음) / '하'(서로 어긋나거나 따로 놂). 발화가 하나뿐인 맥락은 '-'로 써.",
  "- 종합 레벨 판정 절차: ① 맥락마다 그 맥락 안에서 이어진 요소만 보고 도달 수준을 정해. ② overallLevel은 맥락별 수준 중 가장 높은 값이야. 서로 다른 맥락(다른 날짜, 다른 쟁점)에 흩어진 요소를 합쳐서 더 높은 레벨을 주지 마. ③ [정당화]([추론])가 있어도 같은 맥락에 [주장]과 [근거]([증거])가 함께 없으면 Level 3 이상으로 인정하지 말고, 그 이유를 피드백에 써.",
  "- 날짜가 다른 맥락의 요소는 합쳐서 판정하지 말고 맥락별로 도달한 Level을 보되, 학생이 \"지난 시간\"처럼 앞 수업의 주장·근거를 명시적으로 이어받아 말했다면 이어진 것으로 인정해.",
  "- 찬반 토론에서 같은 입장을 두고 오가는 반론·재반박·조건 정리는 하나의 맥락으로 묶어(입장이 바뀌거나 새 쟁점이 나올 때만 나눠).",
  "[발화 귀속 규칙]",
  "각 발화 아래의 '(AI 조언: …)'은 학생의 사고가 아니라 튜터가 한 말이야. 학생 발화가 바로 앞 AI 조언에 이미 나온 개념·문장·반례·예시를 그대로 따라 말했거나 '네/그렇네요/맞아요'와 함께 되풀이한 것이라면, 학생 스스로의 [근거]·[증거]·[정당화]·[추론]·[반박]으로 인정하지 마. 그런 발화는 [판단 유보]로 판정하고 evaluation 끝에 '(AI 조언 복창)'이라고 적어.",
  "- AI가 학생이 한 말을 되짚은 부분(예: \"'빨라진다'고 했구나\")은 학생의 말이므로 복창으로 보지 않아.",
  "- 질문에 단어나 짧은 구로만 답했는데 그 내용이 질문(AI 조언) 안에 이미 들어 있었다면 학생 고유의 요소로 세지 마.",
  "- 학생이 AI 조언을 자기 말로 바꿔 설명하거나, 조언에 없던 구체적 예시·수치·조건을 덧붙였을 때만 해당 요소로 인정해.",
  "- overallLevel은 학생 고유로 인정된 요소만으로 판정하고, overallFeedback에는 AI 조언 복창이 있었다면 한 문장으로 알려 줘.",
  "- contextSummary에는 맥락이 몇 개였는지, 요소가 이어진(완결된) 맥락이 있는지, 연결이 약했던 부분이 어디인지를 한두 문장으로 써. overallFeedback에도 맥락 연결에 대한 조언을 한 문장 포함해."
].join("\n");

// ============================================================================
// ★ 2026년 기준 Flash 모델 최우선 스마트 탐색 엔진
// ============================================================================
// 사용할 모델 결정 순서: ① 교사가 웹 콘솔에서 고른 모델(환경설정 B3) → ② 자동 감지
var AUTO_MODEL_CACHE_KEY_ = "auto_model_v2"; // 기본 모델 규칙을 바꿀 때 숫자를 올려 이전 캐시를 버린다

function getOptimalGeminiModel(apiKey) {
  if (CACHED_MODEL_NAME && CACHED_MODEL_NAME !== "") {
    return CACHED_MODEL_NAME;
  }
  var preferred = readModelPreference_();
  if (preferred) {
    CACHED_MODEL_NAME = preferred;
    return CACHED_MODEL_NAME;
  }
  // 웹앱은 요청마다 새 실행이라 전역 변수가 유지되지 않으므로, 자동 감지 결과는 CacheService에 6시간 보관한다
  try {
    var cached = CacheService.getScriptCache().get(AUTO_MODEL_CACHE_KEY_);
    if (cached) { CACHED_MODEL_NAME = cached; return cached; }
  } catch (e) {}
  return detectAutoModel_(apiKey);
}

// 환경설정 B3(ENV_MODEL_CELL_): 비어 있거나 'auto'/'자동'이면 자동 선택. 모델 이름 형식이 아니면 무시한다.
function readModelPreference_() {
  try {
    var v = requireSheet_('환경설정').getRange(ENV_MODEL_CELL_).getValue().toString().trim();
    if (v.indexOf('models/') === 0) v = v.substring(7);
    if (!/^(gemini|gemma)[a-z0-9.-]*$/i.test(v)) return '';
    return v;
  } catch (e) {
    return '';
  }
}

// Gemini 호출 공통: API 키는 주소(?key=)가 아니라 헤더로 보낸다. 주소에 키가 있으면 오류 문구·로그·중계 서버 기록에 섞여 나갈 수 있다.
var GEMINI_BASE_ = "https://generativelanguage.googleapis.com/v1beta";
function geminiHeaders_(apiKey) { return { "x-goog-api-key": String(apiKey) }; }

// 텍스트 대화에 쓸 수 있는 모델만 골라 최신 이름순으로 돌려준다 (임베딩·이미지·음성 전용 모델은 제외)
function listUsableModels_(apiKey) {
  var response = UrlFetchApp.fetch(GEMINI_BASE_ + "/models?pageSize=1000", { headers: geminiHeaders_(apiKey), muteHttpExceptions: true });
  var json = JSON.parse(response.getContentText());
  if (response.getResponseCode() !== 200) {
    throw new Error(json.error ? json.error.message : "모델 목록을 가져오지 못했습니다.");
  }
  var excluded = ["embedding", "aqa", "omni", "image", "tts", "imagen", "veo", "live", "audio", "robotics", "computer-use"];
  var list = (json.models || []).filter(function(m) {
    var name = m.name.toLowerCase();
    return m.supportedGenerationMethods && m.supportedGenerationMethods.indexOf("generateContent") !== -1 &&
           excluded.every(function(x) { return name.indexOf(x) === -1; });
  }).map(function(m) {
    return { name: m.name.replace(/^models\//, ""), displayName: m.displayName || m.name };
  });
  list.sort(function(a, b) { return b.name.localeCompare(a.name, undefined, { numeric: true }); });
  return list;
}

// 목록에서 가장 최신 Flash 모델(없으면 첫 모델)을 고른다
// 자동 선택(교사가 모델을 고르지 않았을 때)의 우선순위:
//  1) gemini-flash-lite-latest  (가볍고 빠르며 무료 한도를 아끼기 좋은 별칭)
//  2) 가장 최신 Flash-Lite 버전(미리보기가 아닌 것 우선)
//  3) gemini-flash-latest  4) 가장 최신 일반 Flash  5) 목록의 첫 모델
// 목록은 이 키로 실제 쓸 수 있는 모델이므로, 없는 모델을 고르지는 않는다.
var DEFAULT_MODEL_ALIAS_ = "gemini-flash-lite-latest";
function pickAutoModel_(list) {
  var has = function(n) { return list.some(function(m) { return m.name === n; }); };
  if (has(DEFAULT_MODEL_ALIAS_)) return DEFAULT_MODEL_ALIAS_;
  var isLite = function(m) { var n = m.name.toLowerCase(); return n.indexOf("gemini") === 0 && n.indexOf("flash-lite") !== -1 && n.indexOf("8b") === -1; };
  var lites = list.filter(isLite); // 목록은 이미 최신 이름순
  var lite = lites.filter(function(m) { return m.name.toLowerCase().indexOf("preview") === -1; })[0] || lites[0];
  if (lite) return lite.name;
  if (has("gemini-flash-latest")) return "gemini-flash-latest";
  var flash = list.find(function(m) {
    var n = m.name.toLowerCase();
    return n.indexOf("flash") !== -1 && n.indexOf("lite") === -1 && n.indexOf("8b") === -1 && n.indexOf("gemini") === 0;
  });
  return (flash || list[0] || {}).name || "";
}

function detectAutoModel_(apiKey) {
  try {
    var picked = pickAutoModel_(listUsableModels_(apiKey));
    if (picked) {
      CACHED_MODEL_NAME = picked;
      try { CacheService.getScriptCache().put(AUTO_MODEL_CACHE_KEY_, picked, 21600); } catch (e2) {}
      Logger.log("🎯 [AI 모델 자동 감지 성공] 선택된 모델: " + CACHED_MODEL_NAME);
      return CACHED_MODEL_NAME;
    }
  } catch (e) {
    Logger.log("⚠️ [모델 자동 감지 통신 에러] " + maskSecrets_(e.toString()));
  }
  // 목록 조회가 실패한 경우의 임시 기본값 (캐시하지 않는다)
  CACHED_MODEL_NAME = DEFAULT_MODEL_ALIAS_;
  return CACHED_MODEL_NAME;
}

// ============================================================================
// Gemini 호출 + 여러 API 키 자동 전환
//  - 기본 키: 환경설정 B1 / 추가 키: 'API키' 탭 (A=이름, B=키, 위에서부터 차례로 사용)
//  - 호출이 크레딧·한도 소진(402/429), 키 오류로 실패하면 그 키를 잠시 쉬게 하고 다음 키로 자동 전환한다.
//  - '쉬는 중' 표시는 CacheService에만 두고(키 자체는 저장하지 않고 해시로만 구분), 시간이 지나면 저절로 다시 시도한다.
// ============================================================================
var EXTRA_KEYS_SHEET_NAME_ = 'API키';
var EXTRA_KEYS_CACHE_KEY_ = 'apikeys_v1';
var MAX_EXTRA_KEYS_ = 10;

function keyHash_(key) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(key), Utilities.Charset.UTF_8);
  return bytes.map(function(b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
function keyCooldownCacheKey_(key) { return 'kcd_' + keyHash_(key); }

// 추가 API 키 목록. 10분 캐시하고, 저장하면 비운다.
function readExtraKeys_() {
  var cache = CacheService.getScriptCache();
  try { var hit = cache.get(EXTRA_KEYS_CACHE_KEY_); if (hit) return JSON.parse(hit); } catch (e) {}
  var out = [];
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EXTRA_KEYS_SHEET_NAME_);
  if (sh && sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function(r) {
      var key = String(r[1] || "").trim();
      if (key && isSafeKey_(key)) out.push({ label: String(r[0] || "").trim(), key: key });
    });
  }
  try { cache.put(EXTRA_KEYS_CACHE_KEY_, JSON.stringify(out), 600); } catch (e2) {}
  return out;
}

// 사용할 키 후보를 순서대로: 기본 키 → 추가 키들 (같은 키는 한 번만)
function listApiKeys_(primaryKey) {
  var list = [], seen = {};
  var add = function(label, key, strict) {
    key = String(key || "").trim();
    if (!key || seen[key] || (strict && !isSafeKey_(key))) return;
    seen[key] = true; list.push({ label: label, key: key });
  };
  add("기본 키", primaryKey, false); // 기본 키는 예전부터 쓰던 값이라 형식 검사를 하지 않는다
  readExtraKeys_().forEach(function(k, i) { add(k.label || ("추가 키 " + (i + 1)), k.key, true); });
  return list;
}

function getKeyCooldown_(key) {
  try { var v = CacheService.getScriptCache().get(keyCooldownCacheKey_(key)); return v ? JSON.parse(v) : null; } catch (e) { return null; }
}
function setKeyCooldown_(key, kind, httpCode, seconds, free) {
  var now = new Date().getTime();
  var info = { kind: kind, code: httpCode, at: now, until: now + seconds * 1000, free: !!free };
  try { CacheService.getScriptCache().put(keyCooldownCacheKey_(key), JSON.stringify(info), Math.min(seconds, 21600)); } catch (e) {}
  return info;
}
function clearKeyCooldown_(key) {
  try { CacheService.getScriptCache().remove(keyCooldownCacheKey_(key)); } catch (e) {}
}

// 응답이 '이 키로는 지금 못 쓴다'는 뜻인지 판별한다.
//  exhausted = 크레딧·사용 한도 소진 / rate = 분당 한도 등 잠깐 / invalid = 키가 잘못됨 / '' = 키와 무관한 오류
function classifyKeyError_(code, json) {
  var msg = (json && json.error && json.error.message) ? String(json.error.message) : "";
  var status = (json && json.error && json.error.status) ? String(json.error.status) : "";
  if (code === 402 || /credits are depleted|prepayment/i.test(msg)) return "exhausted";
  if (code === 429 || status === "RESOURCE_EXHAUSTED") {
    if (!/quota|billing|exceeded your current/i.test(msg)) return "rate";
    // 분당 한도(곧 풀림)와 하루 한도(오래 걸림)를 구분한다: 오류 문구에 적힌 재시도 시간으로 판단
    var wait = retrySecondsFromError_(json);
    return (wait !== null && wait <= 120) || /PerMinute/i.test(JSON.stringify(json.error || "")) ? "rate" : "exhausted";
  }
  if (code === 401 || /API key not valid|API_KEY_INVALID|API key expired|API key was reported|has been suspended/i.test(msg)) return "invalid";
  return "";
}

// "Please retry in 21h32m41.9s" 또는 details 의 "retryDelay":"23s" 에서 기다릴 초를 읽는다. 없으면 null.
function retrySecondsFromError_(json) {
  var text = JSON.stringify((json && json.error) || "");
  var m = /retry in\s+(?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i.exec(text);
  if (m && (m[1] || m[2] || m[3])) return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + Math.ceil(+(m[3] || 0));
  var d = /retryDelay[^\d]*([\d.]+)s/i.exec(text);
  return d ? Math.ceil(+d[1]) : null;
}
// 무료 등급 키(하루 요청 수가 아주 적음)인지: 오류 문구에 free_tier 가 들어 있다
function isFreeTierError_(json) { return /free_tier/i.test(JSON.stringify((json && json.error) || "")); }

// 휴식 시간: 오류 문구가 알려준 재시도 시간이 있으면 그것을(상한 6시간: 캐시 보관 한도), 없으면 종류별 기본값을 쓴다
function cooldownSeconds_(kind, json) {
  var wait = retrySecondsFromError_(json);
  if (wait !== null) return kind === "rate" ? Math.min(Math.max(wait + 3, 10), 300) : Math.min(Math.max(wait + 30, 60), 21600);
  return kind === "rate" ? 120 : (kind === "invalid" ? 3600 : 10800);
}

// 한 개의 키로 호출한다. 모델이 사라졌으면(404) 자동 감지 모델로 한 번 바꿔 시도하고, 일시 오류는 잠깐 쉬었다 다시 시도한다.
// 반환: { json, code }
function geminiGenerateWithKey_(apiKey, payloadObj) {
  var model = getOptimalGeminiModel(apiKey);
  var switched = false;
  var res = { json: { error: { message: "AI 응답을 받지 못했습니다." } }, code: 0 };
  for (var attempt = 0; attempt < 3; attempt++) {
    var response = UrlFetchApp.fetch(
      GEMINI_BASE_ + "/models/" + model + ":generateContent",
      { method: "post", contentType: "application/json", headers: geminiHeaders_(apiKey), payload: JSON.stringify(payloadObj), muteHttpExceptions: true }
    );
    var code = response.getResponseCode();
    var json;
    try { json = JSON.parse(response.getContentText()); } catch (parseErr) { json = { error: { message: "AI 서버 응답을 해석하지 못했습니다 (" + code + ")" } }; }
    res = { json: json, code: code };
    if (json.candidates && json.candidates[0]) return res;
    var msg = json.error && json.error.message ? json.error.message : "";
    var kind = classifyKeyError_(code, json);
    if (kind === "exhausted" || kind === "invalid") return res; // 재시도해도 소용없다 → 다음 키로
    var modelProblem = code === 404 || /no longer available|not found|is not supported/i.test(msg);
    if (!switched && modelProblem) {
      var auto = detectAutoModel_(apiKey);
      switched = true;
      if (auto && auto !== model) { model = auto; continue; }
    }
    if (kind === "rate") { if (attempt === 0) { Utilities.sleep(1000); continue; } return res; } // 분당 한도: 한 번만 기다려 보고 다음 키로
    if ((code === 500 || code === 503) && attempt < 2) { Utilities.sleep(1500 * (attempt + 1)); continue; }
    return res;
  }
  return res;
}

// Gemini 호출(여러 키). 쉬는 중이 아닌 키부터 차례로 시도하고, 크레딧·한도 소진이나 키 오류면 그 키를 쉬게 하고 다음 키로 넘어간다.
// 키와 무관한 오류(일시 서버 오류, 안전 필터, 모델 문제)는 키를 바꿔도 소용없으므로 그대로 돌려준다.
function geminiGenerate_(apiKey, payloadObj) {
  var all = listApiKeys_(apiKey);
  if (all.length === 0) return { error: { message: "Gemini API 키가 설정되어 있지 않습니다." } };
  var avail = all.filter(function(k) { return !getKeyCooldown_(k.key); });
  var tryList = avail.length ? avail : all; // 전부 쉬는 중이면 상태가 낡았을 수 있으니(충전 직후 등) 모두 한 번씩 시도한다
  var last = null;
  for (var i = 0; i < tryList.length; i++) {
    var res = geminiGenerateWithKey_(tryList[i].key, payloadObj);
    if (res.json.candidates && res.json.candidates[0]) {
      if (getKeyCooldown_(tryList[i].key)) clearKeyCooldown_(tryList[i].key);
      if (tryList[i].key !== all[0].key) Logger.log("🔁 [API 키 전환] '" + tryList[i].label + "' 키로 응답했습니다.");
      return res.json;
    }
    last = res;
    var kind = classifyKeyError_(res.code, res.json);
    if (!kind) return res.json;
    setKeyCooldown_(tryList[i].key, kind, res.code, cooldownSeconds_(kind, res.json), isFreeTierError_(res.json));
    Logger.log("⏸️ [API 키 휴식] '" + tryList[i].label + "' 키: " + kind + " (" + res.code + ")");
  }
  var err = (last && last.json && last.json.error) || { message: "AI 응답을 받지 못했습니다." };
  err.allKeysExhausted = true;
  err.keyCount = all.length;
  return { error: err };
}

// 모든 키를 못 쓸 때 교사/학생에게 보여 줄 안내 문장
function geminiErrorMessage_(json) {
  if (json && json.error && json.error.allKeysExhausted) {
    return "등록된 API 키를 모두 사용할 수 없어요(한도 소진 또는 키 오류). 교사 콘솔의 'GAS 연동 → API 키'에서 키를 충전하거나 새 키를 추가해 주세요.";
  }
  return maskSecrets_(json && json.error ? json.error.message : "AI 응답을 받지 못했습니다.");
}

function describeKeyStatus_(key) {
  var cd = getKeyCooldown_(key);
  if (!cd) return { status: "ok", note: "" };
  return { status: cd.kind === "invalid" ? "invalid" : "exhausted", kind: cd.kind, code: cd.code, until: cd.until, free: !!cd.free };
}

function readPrimaryKey_() {
  return String(requireSheet_('환경설정').getRange(ENV_KEY_CELL_).getValue() || "").trim();
}

// [API] 키 목록과 상태. (교사 전용, 비밀번호 보호) 키 원문은 내려보내지 않는다:
// 화면에는 가린 모양(앞4자••••뒤4자)과, 저장된 키를 가리키는 식별값(id = 키의 MD5, 키를 되살릴 수 없다)만 준다.
function getApiKeys() {
  var primary = readPrimaryKey_();
  return {
    success: true,
    max: MAX_EXTRA_KEYS_,
    primary: primary ? Object.assign({ id: keyHash_(primary) }, describeKeyStatus_(primary)) : null,
    keys: readExtraKeys_().map(function(k) {
      var d = describeKeyStatus_(k.key);
      return { label: k.label, key: maskKey_(k.key), id: keyHash_(k.key), status: d.status, kind: d.kind, code: d.code, until: d.until, free: d.free };
    })
  };
}

// [API] 추가 키 목록 전체를 저장한다 (빈 칸은 무시). 저장하면 모든 키의 '쉬는 중' 상태를 지워 바로 다시 시도하게 한다.
// 항목은 { label, key, id }: key 에 새 키를 적으면 그 키로, 가린 값(••••)이거나 비워 두고 id 만 있으면 저장돼 있던 그 키를 그대로 둔다.
function saveApiKeys(p) {
  if (!p || !Array.isArray(p.keys)) return { success: false, error: "키 목록이 올바르지 않아요. 먼저 '불러오기'를 해 주세요." };
  if (p.keys.length > MAX_EXTRA_KEYS_ + 5) return { success: false, error: "추가 키는 최대 " + MAX_EXTRA_KEYS_ + "개까지예요." };
  var primary = readPrimaryKey_();
  var storedById = {};
  readExtraKeys_().forEach(function(k) { storedById[keyHash_(k.key)] = k.key; });
  var rows = [], seen = {};
  seen[primary] = true;
  for (var i = 0; i < p.keys.length; i++) {
    var item = p.keys[i] || {};
    var raw = String(item.key || "").trim(), key;
    if (raw && !isMaskedKey_(raw)) {
      key = raw;
      if (!isSafeKey_(key)) return { success: false, error: "추가 키 " + (rows.length + 1) + "번의 형식이 올바르지 않아요. (영문·숫자·_-. 만, 10자 이상)" };
    } else if (item.id) {
      key = storedById[String(item.id)];
      if (!key) return { success: false, error: "저장돼 있던 키 목록이 바뀐 것 같아요. [불러오기]를 다시 누른 뒤 고쳐 주세요." };
    } else continue; // 빈 칸
    if (seen[key]) continue; // 기본 키나 앞의 키와 같으면 한 번만
    seen[key] = true;
    rows.push([safeCell_(String(item.label || "").trim().slice(0, 30)), key]);
  }
  if (rows.length > MAX_EXTRA_KEYS_) return { success: false, error: "추가 키는 최대 " + MAX_EXTRA_KEYS_ + "개까지예요." };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return { success: false, error: "다른 저장이 진행 중이에요. 잠시 뒤 다시 시도해 주세요." }; }
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(EXTRA_KEYS_SHEET_NAME_);
    if (!sh) {
      sh = ss.insertSheet(EXTRA_KEYS_SHEET_NAME_);
      sh.appendRow(['이름', 'API 키 (위에서부터 차례로 사용, 한도가 소진되면 다음 키로 자동 전환)']);
      sh.setFrozenRows(1);
    }
    for (var r = sh.getLastRow(); r >= 2; r--) sh.deleteRow(r);
    rows.forEach(function(row) { sh.appendRow(row); });
    CacheService.getScriptCache().remove(EXTRA_KEYS_CACHE_KEY_);
    [primary].concat(rows.map(function(row) { return row[1]; })).forEach(function(k) { if (k) clearKeyCooldown_(k); });
  } finally {
    lock.releaseLock();
  }
  return { success: true, count: rows.length };
}

// [API] 모든 키의 '쉬는 중' 표시를 지우고 다음 요청부터 다시 시도하게 한다 (충전한 직후 등)
function resetApiKeyStatus() {
  listApiKeys_(readPrimaryKey_()).forEach(function(k) { clearKeyCooldown_(k.key); });
  return { success: true };
}

// 요청으로 받은 키/모델 이름은 URL·헤더에 그대로 들어가므로 형식을 확인한다
function isSafeKey_(k) { return /^[A-Za-z0-9_.\-]{10,200}$/.test(k); }
function isSafeModelName_(m) { return /^[A-Za-z0-9._\-]+$/.test(m); }

// 요청이 가리키는 API 키: ① keyId = 저장된 키의 식별값(기본 키 또는 추가 키) ② 아직 저장 전인 새 키(apiKey, 가린 값이면 무시) ③ 시트의 기본 키.
// 화면이 키 원문을 갖고 있지 않아도 저장된 키를 시험할 수 있게 한다.
function resolveRequestKey_(p) {
  var primary = readPrimaryKey_();
  if (p && p.keyId) {
    var id = String(p.keyId);
    if (primary && keyHash_(primary) === id) return primary;
    var found = readExtraKeys_().filter(function(k) { return keyHash_(k.key) === id; })[0];
    return found ? found.key : "";
  }
  var given = String((p && p.apiKey) || "").trim();
  return given && !isMaskedKey_(given) ? given : primary;
}

// [API] 사용 가능한 모델 목록
function listGeminiModels(p) {
  var apiKey = resolveRequestKey_(p);
  if (!apiKey) return { success: false, error: "Gemini API 키를 먼저 입력해 주세요." };
  if (!isSafeKey_(apiKey)) return { success: false, error: "API 키 형식이 올바르지 않아요." };
  var list = listUsableModels_(apiKey);
  if (list.length === 0) return { success: false, error: "이 API 키로 사용할 수 있는 모델이 없어요. 키가 올바른지 확인해 주세요." };
  return { success: true, models: list, autoModel: pickAutoModel_(list), current: readModelPreference_() };
}

// [API] 고른 모델이 실제로 응답하는지 아주 짧은 호출로 확인한다 (model이 비어 있으면 자동 선택 모델을 확인)
function testGeminiModel(p) {
  var apiKey = resolveRequestKey_(p);
  if (!apiKey) return { success: false, error: "Gemini API 키를 먼저 입력해 주세요." };
  if (!isSafeKey_(apiKey)) return { success: false, error: "API 키 형식이 올바르지 않아요." };
  var model = ((p && p.model) || "").toString().trim().replace(/^models\//, "");
  if (model && !isSafeModelName_(model)) return { success: false, error: "모델 이름 형식이 올바르지 않아요." };
  if (!model) model = pickAutoModel_(listUsableModels_(apiKey));
  var t0 = new Date().getTime();
  var response = UrlFetchApp.fetch(
    GEMINI_BASE_ + "/models/" + model + ":generateContent",
    { method: "post", contentType: "application/json", headers: geminiHeaders_(apiKey), muteHttpExceptions: true,
      payload: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "'확인'이라고만 답해." }] }] }) }
  );
  var json = JSON.parse(response.getContentText());
  if (json.candidates && json.candidates[0]) {
    clearKeyCooldown_(apiKey);
    return { success: true, model: model, ms: new Date().getTime() - t0 };
  }
  var testKind = classifyKeyError_(response.getResponseCode(), json);
  if (testKind) setKeyCooldown_(apiKey, testKind, response.getResponseCode(), cooldownSeconds_(testKind, json), isFreeTierError_(json));
  return { success: false, model: model, error: json.error ? maskSecrets_(json.error.message) : "모델이 응답하지 않았습니다." };
}
// ============================================================================
// 시트 구조 점검 (읽기 전용)
// 시트를 손으로 고쳤거나 옛 시트를 이어 쓸 때, 앱이 기대하는 모양과 어긋난 곳을 찾아 알려 준다.
// 아무것도 고치거나 만들지 않는다(없는 세부설정 탭도 만들지 않는다). 웹 API 에는 연결하지 않았고,
// 시트 메뉴 '🩺 시트 구조 점검'(checkSheetStructureFromMenu)에서만 실행한다. 반환: { items: [{level, area, text}], counts }
//   level: error = 이대로면 기능이 멈춤 / warn = 일부가 기대와 다르게 동작 / info = 알아 두면 좋은 것 / ok = 정상
// ============================================================================
function inspectSheetStructure_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var items = [];
  var add = function(level, area, text) { items.push({ level: level, area: area, text: text }); };
  var tab = function(name) { return ss.getSheetByName(name); };
  var str = function(v) { return String(v == null ? "" : v).trim(); };
  var splitList = function(v) { return str(v).split(",").map(function(t) { return t.trim(); }); };

  // 1) 탭
  var core = ['환경설정', '기본설정', '채팅기록'];
  core.forEach(function(n) {
    if (!tab(n)) add("error", "탭", "'" + n + "' 탭이 없어요. 탭 이름이 바뀌었거나 지워졌는지 확인하세요. 이 탭이 없으면 학생 대화·설정·분석이 멈춰요.");
  });
  if (core.every(function(n) { return !!tab(n); })) add("ok", "탭", "핵심 탭(환경설정·기본설정·채팅기록)이 모두 있어요.");
  if (!tab(PERSONA_SHEET_) || !tab(RUBRIC_SHEET_) || !tab(TOPIC_CFG_SHEET_)) {
    add("info", "탭", "세부설정 탭(페르소나·루브릭·주제)이 아직 없거나 일부만 있어요. 교사 콘솔을 처음 열 때 자동으로 만들어져요.");
  }

  // 2) 환경설정: 키·백업 시트·모델
  var envSh = tab('환경설정');
  if (envSh) {
    var key = str(envSh.getRange(ENV_KEY_CELL_).getValue());
    if (!key) add("warn", "환경설정", ENV_KEY_CELL_ + "(기본 API 키)이 비어 있어요. 키가 없으면 학생 대화와 분석이 동작하지 않아요.");
    else if (!isSafeKey_(key)) add("warn", "환경설정", ENV_KEY_CELL_ + "의 API 키 모양이 이상해요(영문·숫자·_-. 만, 10자 이상). 복사할 때 공백이나 줄바꿈이 섞이지 않았는지 확인하세요.");
    else add("ok", "환경설정", "API 키가 있어요 (" + maskKey_(key) + ").");
    var bid = str(envSh.getRange(ENV_BACKUP_CELL_).getValue());
    if (bid && !/^[A-Za-z0-9_-]{20,100}$/.test(bid)) add("warn", "환경설정", ENV_BACKUP_CELL_ + "(백업 스프레드시트 ID) 모양이 이상해요. 주소창의 /d/ 와 /edit 사이 글자만 넣어야 해요. 그대로면 백업은 조용히 실패해요.");
    var model = str(envSh.getRange(ENV_MODEL_CELL_).getValue());
    if (model && !/^(models\/)?(gemini|gemma)[a-z0-9.-]*$/i.test(model)) add("warn", "환경설정", ENV_MODEL_CELL_ + "(AI 모델) 이름이 모델 이름 모양이 아니에요('" + model + "'). 이 값은 무시되고 자동 선택으로 동작해요.");
  }

  // 3) 기본설정: 학급·모둠·주제 목록
  var cfgSh = tab('기본설정'), lists = { classes: [], groups: [], topics: [] };
  if (cfgSh) {
    var vals = cfgSh.getRange(CFG_ALL_RANGE_).getValues();
    var defs = [['학급', CFG_CLASSES_CELL_, splitList(vals[1][0]), 'classes'], ['모둠', CFG_GROUPS_CELL_, splitList(vals[2][0]), 'groups'], ['탐구 주제', CFG_TOPICS_CELL_, splitList(vals[3][0]), 'topics']];
    defs.forEach(function(d) {
      var label = d[0], cell = d[1], raw = d[2], names = raw.filter(Boolean);
      lists[d[3]] = names;
      if (!names.length) { add("warn", "기본설정", label + " 목록(" + cell + ")이 비어 있어요. 학생이 대화방에 들어갈 수 없어요."); return; }
      var seen = {}, dups = [];
      names.forEach(function(n) { var k = normalizeTopic_(n); if (seen[k]) dups.push(n); seen[k] = true; });
      if (dups.length) add("warn", "기본설정", label + " 목록에 같은 이름이 겹쳐 있어요: " + dups.join(", ") + ". 학생 화면에 같은 항목이 두 번 보여요.");
      if (raw.length !== names.length) add("info", "기본설정", label + " 목록(" + cell + ")에 빈 항목(쉼표가 겹치거나 끝에 쉼표)이 있어요. 동작에는 영향이 없어요.");
      var tooLong = names.filter(function(n) { return n.length > CHAT_MAX_FIELD_; });
      if (tooLong.length) add("error", "기본설정", label + " 이름이 " + CHAT_MAX_FIELD_ + "자를 넘어요(" + tooLong[0].slice(0, 12) + "…). 이 이름으로는 대화를 보낼 수 없어요.");
    });
    if (lists.classes.length && lists.groups.length && lists.topics.length) add("ok", "기본설정", "학급 " + lists.classes.length + "개 · 모둠 " + lists.groups.length + "개 · 주제 " + lists.topics.length + "개가 있어요.");
  }

  // 4) 세부설정 탭: 머리글, 기본 줄, 이름 겹침, 연결
  var pTab = tab(PERSONA_SHEET_), rTab = tab(RUBRIC_SHEET_), tTab = tab(TOPIC_CFG_SHEET_);
  var checkHeader = function(sh, name, expected, required) {
    var head = sh.getRange(1, 1, 1, expected.length).getValues()[0], wrong = [];
    for (var i = 0; i < required; i++) if (str(head[i]) !== expected[i]) wrong.push((i + 1) + "열은 '" + expected[i] + "' 이어야 해요(지금 '" + str(head[i]) + "')");
    if (wrong.length) add("warn", name, "머리글이 달라요: " + wrong.slice(0, 3).join(" / ") + ". 열 순서가 바뀌었다면 값이 엉뚱한 칸으로 읽혀요.");
    return wrong.length === 0;
  };
  var persona = [], rubric = [], topicRows = [];
  if (pTab) { checkHeader(pTab, PERSONA_SHEET_, PERSONA_HEADERS_, PERSONA_HEADERS_.length - 1); persona = readTable_(PERSONA_SHEET_, PERSONA_COLS_); }
  if (rTab) { checkHeader(rTab, RUBRIC_SHEET_, RUBRIC_HEADERS_, RUBRIC_HEADERS_.length - 1); rubric = readTable_(RUBRIC_SHEET_, RUBRIC_COLS_); }
  if (tTab) { checkHeader(tTab, TOPIC_CFG_SHEET_, TOPIC_CFG_HEADERS_, TOPIC_CFG_HEADERS_.length); topicRows = readTable_(TOPIC_CFG_SHEET_, TOPIC_CFG_COLS_); }
  var dupNames = function(rows, key, label) {
    var s = {}, d = [];
    rows.forEach(function(r) { var k = normalizeTopic_(r[key]); if (s[k]) d.push(r[key]); s[k] = true; });
    if (d.length) add("warn", label, "같은 이름의 줄이 여러 개예요: " + d.join(", ") + ". 위쪽 줄만 쓰여요.");
  };
  if (pTab) {
    var bp = findByName_(persona, 'name', BASE_NAME_);
    if (!bp) add("warn", PERSONA_SHEET_, "'기본' 줄이 없어요. 다른 줄이 비워 둔 칸의 기준이라서, 없으면 가장 위 줄을 대신 써요.");
    else if (!bp.role) add("error", PERSONA_SHEET_, "'기본' 페르소나의 역할이 비어 있어요. AI 튜터의 기본 지침이 없는 상태예요.");
    dupNames(persona, 'name', PERSONA_SHEET_);
    persona.forEach(function(p) {
      if (p.templateKey && TEMPLATE_KEYS_.indexOf(p.templateKey) === -1) add("warn", PERSONA_SHEET_, "'" + p.name + "'의 템플릿 값 '" + p.templateKey + "'을 알 수 없어요(socratic·cer·advanced·debate·qna 중 하나여야 해요).");
    });
  }
  if (rTab) {
    var br = findByName_(rubric, 'name', BASE_NAME_);
    if (!br) add("warn", RUBRIC_SHEET_, "'기본' 줄이 없어요. 없으면 가장 위 줄을 대신 써요.");
    else if (!br.criteria) add("error", RUBRIC_SHEET_, "'기본' 루브릭의 요소별 판정 기준이 비어 있어요. 이대로면 분석이 실패해요.");
    dupNames(rubric, 'name', RUBRIC_SHEET_);
  }
  if (tTab) {
    dupNames(topicRows, 'topic', TOPIC_CFG_SHEET_);
    var inTopics = {}; lists.topics.forEach(function(t) { inTopics[normalizeTopic_(t)] = true; });
    var hasRow = {}; topicRows.forEach(function(t) { hasRow[normalizeTopic_(t.topic)] = true; });
    var noRow = lists.topics.filter(function(t) { return !hasRow[normalizeTopic_(t)]; });
    if (cfgSh && noRow.length) add("info", TOPIC_CFG_SHEET_, "주제 목록에는 있는데 이 탭에 줄이 없는 주제가 있어요: " + noRow.join(", ") + ". 메뉴 '🔄 주제 세부설정 맞추기'를 누르거나 교사 콘솔에서 주제 목록을 저장하면 줄이 만들어져요(빈 칸은 '(기본)' 줄을 따라요).");
    topicRows.forEach(function(t) {
      if (normalizeTopic_(t.topic) === normalizeTopic_(TOPIC_DEFAULT_)) return;
      if (cfgSh && !inTopics[normalizeTopic_(t.topic)]) add("warn", TOPIC_CFG_SHEET_, "주제 '" + t.topic + "' 줄은 주제 목록에 없어서 학생에게 보이지 않아요(연결 안 됨).");
      if (t.persona && pTab && !findByName_(persona, 'name', t.persona) && normalizeTopic_(t.persona) !== normalizeTopic_(BASE_NAME_)) add("warn", TOPIC_CFG_SHEET_, "주제 '" + t.topic + "'이 없는 페르소나 '" + t.persona + "'를 가리켜요. '기본'으로 동작해요.");
      if (t.rubric && rTab && t.rubric !== NO_RUBRIC_WORD_ && t.rubric !== NO_RUBRIC_ && !findByName_(rubric, 'name', t.rubric) && normalizeTopic_(t.rubric) !== normalizeTopic_(BASE_NAME_)) add("warn", TOPIC_CFG_SHEET_, "주제 '" + t.topic + "'이 없는 루브릭 '" + t.rubric + "'을 가리켜요. '기본' 루브릭으로 평가해요.");
    });
    var badNum = function(v, max) { var s = str(v); if (s === "") return false; var n = positiveInt_(s); return !(n > 0 && n <= max && String(n) === s); };
    topicRows.forEach(function(t) {
      if (badNum(t.timeLimitMinutes, 180)) add("warn", TOPIC_CFG_SHEET_, "'" + t.topic + "'의 제한 시간 '" + t.timeLimitMinutes + "'이 1~180 사이 숫자가 아니에요. 범위에 맞춰 쓰이거나 기본값을 써요.");
      if (badNum(t.windowPairs, 20)) add("warn", TOPIC_CFG_SHEET_, "'" + t.topic + "'의 기억할 대화 쌍 '" + t.windowPairs + "'이 1~20 사이 숫자가 아니에요.");
    });
  }

  // 5) 탐구자료: 탐구 도우미에 연결된 주제는 자료가 있어야 학생이 고를 수 있다
  var matSh = tab(MATERIAL_SHEET_NAME_), mats = matSh ? readMaterialRows_() : [];
  if (matSh) {
    dupNames(mats, 'topic', MATERIAL_SHEET_NAME_);
    var tooBig = mats.filter(function(m) { return m.procedure.length > MATERIAL_MAX_FIELD_ || m.materials.length > MATERIAL_MAX_FIELD_ || m.safety.length > MATERIAL_MAX_FIELD_ || m.notes.length > MATERIAL_MAX_FIELD_ || (m.procedure + m.materials + m.safety + m.notes).length > MATERIAL_MAX_TOTAL_; });
    if (tooBig.length) add("warn", MATERIAL_SHEET_NAME_, "글자 수 제한(칸당 " + MATERIAL_MAX_FIELD_ + "자, 합계 " + MATERIAL_MAX_TOTAL_ + "자)을 넘는 자료가 있어요: " + tooBig.map(function(m) { return m.topic; }).join(", ") + ". 매 발화마다 AI 에 전달돼 토큰이 많이 들어요.");
  }
  if (cfgSh && pTab && tTab && lists.topics.length) {
    var coreCfg = { personas: persona, topics: topicRows, fallback: false };
    var have = {}; mats.forEach(function(m) { if ((m.procedure + m.materials + m.safety + m.notes).trim()) have[normalizeTopic_(m.topic)] = true; });
    lists.topics.forEach(function(t) {
      if (resolveTopicConfig_(coreCfg, t).templateKey === "qna" && !have[normalizeTopic_(t)]) add("warn", "탐구자료", "탐구 도우미에 연결된 주제 '" + t + "'에 탐구 자료가 없어요. 학생이 이 주제를 고를 수 없어요('준비 중').");
    });
  }

  // 6) API키 탭
  var keySh = tab(EXTRA_KEYS_SHEET_NAME_);
  if (keySh && keySh.getLastRow() >= 2) {
    var badKeys = 0;
    keySh.getRange(2, 1, keySh.getLastRow() - 1, 2).getValues().forEach(function(r) { var k = str(r[1]); if (k && !isSafeKey_(k)) badKeys++; });
    if (badKeys) add("warn", EXTRA_KEYS_SHEET_NAME_, "모양이 이상한 추가 키가 " + badKeys + "개 있어요. 그 키는 쓰이지 않아요.");
  }

  // 7) 채팅기록
  var recSh = tab('채팅기록');
  if (recSh) {
    var head2 = recSh.getRange(1, 1, 1, 9).getValues()[0];
    if (!str(head2[7]) || !str(head2[8]) || str(head2[7]) === "모드") add("info", "채팅기록", "H1·I1 머리글(페르소나·루브릭)이 비어 있거나 옛 이름이에요. 다음 학생 대화 때 자동으로 채워져요.");
    var total = Math.max(recSh.getLastRow() - 1, 0), shape = 0, offList = 0;
    if (total > 0) {
      var data = recSh.getRange(2, 1, total, 9).getValues();
      var inLists = function(arr, v) { var w = normalizeTopic_(v); return arr.some(function(x) { return normalizeTopic_(x) === w; }); };
      data.forEach(function(r) {
        if (!str(r[2]) || !str(r[3]) || !str(r[4])) { shape++; return; }
        if ((lists.classes.length && !inLists(lists.classes, r[2])) || (lists.groups.length && !inLists(lists.groups, r[3])) || (lists.topics.length && !inLists(lists.topics, r[4]))) offList++;
      });
    }
    add("ok", "채팅기록", "대화 기록 " + total + "줄이 있어요.");
    if (shape) add("warn", "채팅기록", "학급·모둠·주제 칸이 빈 줄이 " + shape + "줄 있어요. 분석에서 빠지고 경고 횟수에도 잡히지 않아요.");
    if (offList) add("info", "채팅기록", "지금 목록에 없는 학급·모둠·주제의 기록이 " + offList + "줄 있어요(목록을 고쳤거나 옛 기록). 기록은 그대로 남아 있어요.");
  }

  // 8) 접근 통제 (Script Properties)
  if (!isTeacherPinSet_()) add("warn", "보안", "교사 비밀번호가 아직 없어요. 메뉴 '🔐 교사 비밀번호 설정'에서 정해야 교사 콘솔이 열려요.");
  else add("ok", "보안", "교사 비밀번호가 정해져 있어요.");
  if (!readAccessCode_()) add("warn", "보안", "수업 입장 코드가 아직 없어요. 교사 콘솔에 접속하거나 메뉴 '🔑 수업 입장 코드 보기'를 누르면 만들어져요. 그 전에는 학생이 입장할 수 없어요.");
  else add("ok", "보안", "수업 입장 코드가 있어요.");

  var counts = { error: 0, warn: 0, info: 0, ok: 0 };
  items.forEach(function(i) { counts[i.level]++; });
  return { items: items, counts: counts };
}

// 시트 메뉴: 구조 점검 결과를 알려 준다 (읽기 전용). 전체 목록은 실행 로그에도 남긴다.
function checkSheetStructureFromMenu() {
  var ui = SpreadsheetApp.getUi();
  var r;
  try { r = inspectSheetStructure_(); }
  catch (err) { ui.alert('점검하지 못했어요', String(err && err.message || err), ui.ButtonSet.OK); return; }
  var icon = { error: '⛔', warn: '⚠️', info: 'ℹ️' };
  var lines = r.items.filter(function(i) { return i.level !== 'ok'; }).map(function(i) { return icon[i.level] + ' [' + i.area + '] ' + i.text; });
  Logger.log(r.items.map(function(i) { return '[' + i.level + '] [' + i.area + '] ' + i.text; }).join('\n'));
  var shown = lines.slice(0, 20);
  var body = shown.length ? shown.join('\n\n') + (lines.length > shown.length ? '\n\n… 외 ' + (lines.length - shown.length) + '건 (전체는 Apps Script 실행 로그에서 볼 수 있어요)' : '') : '문제가 발견되지 않았어요. 👍';
  ui.alert('🩺 시트 구조 점검', '오류 ' + r.counts.error + ' · 주의 ' + r.counts.warn + ' · 참고 ' + r.counts.info + '\n\n' + body + '\n\n(읽기 전용 점검이에요. 아무것도 바꾸지 않았어요.)', ui.ButtonSet.OK);
}
