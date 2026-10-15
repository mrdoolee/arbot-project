// 화면(public/)과 서버(gas-source/) 사이의 약속·보안 규칙을 파일 내용으로 점검하는 정적 시험. 브라우저 없이 돈다.
//   node tests/frontend_static.test.js
// 점검: id 짝, API 이름 일치, 인라인 스크립트 문법, 연결 제한(CSP)·외부 스크립트 금지, 접속 링크 주소 처리, 코드·키 처리, 출력 이스케이프.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
let asyncChecks = Promise.resolve(); // 비동기 시험(gasClient 를 가짜 환경에서 실행)이 끝난 뒤에 요약을 낸다
const ok = (name, cond, extra) => { (cond ? pass++ : fail++); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  → ' + JSON.stringify(extra))); };

const pages = { 'public/index.html': read('public/index.html'), 'public/student.html': read('public/student.html') };
const gasClient = read('public/js/gasClient.js');
const server = read('gas-source/Code.js');

// ───────── 1) HTML id 와 스크립트 참조 ─────────
for (const [f, s] of Object.entries(pages)) {
  const ids = new Map();
  for (const m of s.matchAll(/\bid="([^"]+)"/g)) ids.set(m[1], (ids.get(m[1]) || 0) + 1);
  const script = [...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  const used = new Set();
  for (const m of script.matchAll(/\$\('([^']+)'\)/g)) used.add(m[1]);
  for (const m of script.matchAll(/getElementById\('([^']+)'\)/g)) used.add(m[1]);
  const dyn = new Set([...script.matchAll(/\bid="([^"$]+)"/g)].map((m) => m[1])); // 스크립트가 HTML 문자열로 만드는 id
  ok(`${f}: 중복 id 없음`, [...ids].every(([, n]) => n === 1), [...ids].filter(([, n]) => n > 1));
  ok(`${f}: 스크립트가 쓰는 id 가 모두 있음`, [...used].every((id) => ids.has(id) || dyn.has(id)), [...used].filter((id) => !ids.has(id) && !dyn.has(id)));
  ok(`${f}: label for 대상이 모두 있음`, [...s.matchAll(/\bfor="([^"]+)"/g)].every((m) => ids.has(m[1])), '');
  const steps = [...s.matchAll(/data-step="([^"$]+)"/g)].map((m) => m[1]);
  const panels = [...s.matchAll(/<section class="panel[^"]*" id="panel-([^"]+)"/g)].map((m) => m[1]);
  ok(`${f}: 메뉴(data-step)마다 패널이 있음`, steps.every((x) => panels.includes(x)), steps.filter((x) => !panels.includes(x)));
  const tabs = [...s.matchAll(/class="tab[^"]*" data-sub="([^"]+)"/g)].map((m) => m[1]);
  const subs = [...s.matchAll(/data-sub-panel="([^"]+)"/g)].map((m) => m[1]);
  ok(`${f}: 탭과 하위 화면이 짝을 이룸`, tabs.every((x) => subs.includes(x)) && subs.every((x) => tabs.includes(x)), [tabs, subs]);
  // 인라인 스크립트가 문법적으로 올바른지 (실행하지 않고 컴파일만)
  let syntax = null; try { new vm.Script(script, { filename: f }); } catch (e) { syntax = e.message; }
  ok(`${f}: 인라인 스크립트 문법 정상`, syntax === null, syntax);
}
let gcSyntax = null; try { new vm.Script(gasClient); } catch (e) { gcSyntax = e.message; }
ok('gasClient.js 문법 정상', gcSyntax === null, gcSyntax);

// ───────── 2) 화면 ↔ 서버 API 약속 ─────────
const routed = new Set([...server.matchAll(/case "([A-Za-z]+)":/g)].map((m) => m[1]));
const called = new Set();
for (const s of Object.values(pages)) for (const m of s.matchAll(/call(?:Get|Post)\('([A-Za-z]+)'/g)) called.add(m[1]);
const listOf = (src, re, q) => new Set([...src.match(re)[1].matchAll(new RegExp(q + '([A-Za-z]+)' + q, 'g'))].map((m) => m[1]));
const clientTeacher = listOf(gasClient, /TEACHER_ACTIONS = \[([\s\S]*?)\];/, "'");
const serverTeacher = listOf(server, /var TEACHER_ACTIONS_ = \[([\s\S]*?)\];/, '"');
const serverStudent = listOf(server, /var STUDENT_ACTIONS_ = \[([\s\S]*?)\];/, '"');
ok('화면이 부르는 action 은 모두 서버에 있음', [...called].every((a) => routed.has(a)), [...called].filter((a) => !routed.has(a)));
ok('서버 교사 전용 목록 = 클라이언트 교사 전용 목록 (testConnection 만 스스로 비밀번호를 확인해 클라이언트에만 있음)',
  [...serverTeacher].every((a) => clientTeacher.has(a)) && [...clientTeacher].filter((a) => !serverTeacher.has(a)).join() === 'testConnection', [[...serverTeacher], [...clientTeacher]]);
ok('학생 입구(코드 필요)는 getInitialData·processChatMessage 둘뿐', [...serverStudent].sort().join() === 'getInitialData,processChatMessage', [...serverStudent]);
ok('학생 입구 action 은 교사 전용 목록과 겹치지 않음', [...serverStudent].every((a) => !serverTeacher.has(a)), '');
ok('getInitialData 는 학생 화면에서만, 수업 입장 코드와 함께 POST 로 부름', /callPost\('getInitialData', \{ accessCode/.test(pages['public/student.html']) && !/call(?:Get|Post)\('getInitialData'/.test(pages['public/index.html']) && !/callGet\('getInitialData'/.test(pages['public/student.html']), '');
ok('채팅 요청에 수업 입장 코드를 실어 보냄', /callPost\('processChatMessage', \{[\s\S]*?accessCode: S\.code/.test(pages['public/student.html']), '');
ok('서버 doGet 은 기능을 실행하지 않음(코드·비밀번호가 주소창에 남지 않게)', /function doGet\(e\) \{\s*return jsonResponse\(\{ success: true, service/.test(server), '');

// 콘솔은 모두가 공유하지만 GAS 는 시트마다 따로 배포된다 → 콘솔이 요구하는 GAS 버전과 서버 버전이 어긋나지 않아야 하고, 옛 GAS 는 알아볼 수 있게 안내해야 한다
const srvVer = Number((/var API_VERSION_ = (\d+);/.exec(server) || [])[1]), cliVer = Number((/const REQUIRED_API_VERSION = (\d+);/.exec(pages['public/index.html']) || [])[1]);
ok('콘솔이 요구하는 GAS 버전(REQUIRED_API_VERSION) = 서버 API_VERSION_', srvVer >= 2 && srvVer === cliVer, [srvVer, cliVer]);
ok('콘솔이 testConnection 의 version 으로 옛 GAS 를 알아보고 안내 카드를 보여 줌', /\(res\.version \|\| 1\) >= REQUIRED_API_VERSION/.test(pages['public/index.html']) && /id="backendOldCard"/.test(pages['public/index.html']), '');
{
  // gasClient 를 브라우저 대신 가짜 환경에서 실행해 오류 표시(플래그)가 맞는지 본다
  const run = async (resp) => {
    const sandbox = { console, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, JSON, Error, TypeError,
      localStorage: { getItem: () => 'https://script.google.com/macros/s/X/exec', setItem() {} }, sessionStorage: { getItem: () => '', setItem() {}, removeItem() {} },
      fetch: async () => ({ json: async () => resp }) };
    sandbox.window = sandbox; sandbox.window.location = { search: '', origin: 'http://x', pathname: '/' };
    vm.runInNewContext(gasClient, sandbox);
    try { return { ok: await sandbox.GasClient.callPost('getAccessCode', {}) }; } catch (e) { return { err: e }; }
  };
  asyncChecks = (async () => {
    const old = await run({ success: false, error: '알 수 없는 action 입니다: setAccessCode' });
    ok('옛 GAS("알 수 없는 action")는 oldBackend 로 표시되고 "옛 버전" 안내 문구가 됨(내부 문구 그대로 아님)', old.err && old.err.oldBackend === true && /옛 버전/.test(old.err.message) && !/알 수 없는 action/.test(old.err.message), old.err && old.err.message);
    const setup = await run({ success: false, needSetup: true, error: '비밀번호를 먼저' });
    ok('needSetup 응답은 needSetup 플래그(PIN 창을 띄우지 않음)', setup.err && setup.err.needSetup === true && !setup.err.needPin && !setup.err.oldBackend, '');
    const pin = await run({ success: false, needPin: true, error: '필요' });
    ok('needPin 응답은 needPin 플래그', pin.err && pin.err.needPin === true && !pin.err.needSetup, '');
    const code = await run({ success: false, needCode: true, error: '코드' });
    ok('needCode 응답은 needCode 플래그', code.err && code.err.needCode === true, '');
    const plain = await run({ success: false, error: '그냥 오류' });
    ok('일반 오류는 서버 문구 그대로, 특별한 플래그 없음', plain.err && plain.err.message === '그냥 오류' && !plain.err.oldBackend && !plain.err.needPin && !plain.err.needCode, '');
    const good = await run({ success: true, code: 'ABCDEF' });
    ok('성공 응답은 그대로 돌려줌', good.ok && good.ok.code === 'ABCDEF', '');
  })();
}

// ───────── 3) 연결 제한·외부 스크립트 ─────────
for (const [f, s] of Object.entries(pages)) {
  const csp = (s.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
  ok(`${f}: 연결 제한(CSP) 메타가 있음`, !!csp, '');
  ok(`${f}: CSP — 연결은 같은 출처와 script.google.com 계열만`, /connect-src 'self' https:\/\/script\.google\.com https:\/\/script\.googleusercontent\.com(;|$)/.test(csp) && !/connect-src[^;]*\*/.test(csp), csp);
  ok(`${f}: CSP — eval 금지, object·base·form 차단`, !/unsafe-eval/.test(csp) && /object-src 'none'/.test(csp) && /base-uri 'none'/.test(csp) && /form-action 'none'/.test(csp), csp);
  ok(`${f}: CSP — 스크립트는 같은 출처(+인라인)만, 외부 스크립트 허용 없음`, /script-src 'self' 'unsafe-inline'(;|$)/.test(csp), csp);
  ok(`${f}: 외부 주소의 <script src> 가 없음`, !/<script[^>]+src="https?:/i.test(s), '');
  ok(`${f}: 주소가 Referer 로 새지 않게 referrer 메타`, /<meta name="referrer" content="no-referrer">/.test(s), '');
  ok(`${f}: 외부 스타일·폰트는 구글 폰트뿐`, [...s.matchAll(/<link[^>]+href="(https?:[^"]+)"/g)].every((m) => /^https:\/\/fonts\.(googleapis|gstatic)\.com/.test(m[1])), '');
}
ok('QR 라이브러리는 내 폴더(js/qrcode.js)에서 불러옴', /<script src="js\/qrcode\.js"><\/script>/.test(pages['public/index.html']) && fs.existsSync(path.join(ROOT, 'public/js/qrcode.js')), '');
const qr = read('public/js/qrcode.js');
ok('qrcode.js: 알려진 MIT 라이브러리이고 네트워크·eval 코드가 없음', /Kazuhiko Arase/.test(qr) && /MIT/.test(qr) && !/\b(eval\(|new Function|XMLHttpRequest|fetch\(|sendBeacon|WebSocket|localStorage|document\.cookie)/.test(qr), '');
const serverJs = read('server.js');
ok('server.js 에 보안 헤더(nosniff·X-Frame-Options·Referrer-Policy)', /X-Content-Type-Options', 'nosniff'/.test(serverJs) && /X-Frame-Options', 'DENY'/.test(serverJs) && /Referrer-Policy', 'no-referrer'/.test(serverJs), '');

// ───────── 4) 접속 링크 주소(?gas=)와 키·코드 처리 ─────────
const getBody = gasClient.slice(gasClient.indexOf('function getGasUrl()'), gasClient.indexOf('function setGasUrl'));
ok('gasClient.getGasUrl 은 ?gas= 를 읽지 않음(주소를 바꾸는 일은 adoptGasUrlFromQuery 만)', getBody.length > 50 && !/URLSearchParams|location|searchParams/.test(getBody.replace(/\/\/.*$/gm, '')), getBody);
ok('교사 콘솔은 접속 링크 주소(adoptGasUrlFromQuery)를 받아들이지 않음', !/adoptGasUrlFromQuery/.test(pages['public/index.html']), '');
ok('학생 화면은 시작할 때 접속 링크 주소를 받아들임', /GasClient\.adoptGasUrlFromQuery\(\)/.test(pages['public/student.html']), '');
ok('setGasUrl 은 구글 Apps Script 주소 형식만 저장(빈 값은 삭제)', /function setGasUrl\(url\)[\s\S]*?if \(v && !isValidGasUrl\(v\)\) return false;/.test(gasClient), '');
ok('학생 화면의 주소 직접 입력은 형식 검사를 거침', /if \(!GasClient\.setGasUrl\(url\)\)/.test(pages['public/student.html']), '');
ok('콘솔의 URL 저장도 형식 검사 결과를 확인', /if \(!GasClient\.setGasUrl\(url\)\) \{ setStatus\(\$\('step1Status'\), 'err', '주소를 저장하지 못했어요'/.test(pages['public/index.html']), '');
ok('수업 입장 코드는 저장소(localStorage·sessionStorage)에 저장하지 않음', !/(localStorage|sessionStorage)\.setItem\([^)]*(code|Code)/.test(pages['public/student.html'] + gasClient), '');
ok('학생 질문 입력칸에 글자 수 제한(1000자)', /<textarea id="userQuestion"[^>]*maxlength="1000"/.test(pages['public/student.html']), '');
ok('학생 입장 화면에 개인정보 안내가 있음', /개인정보는 쓰지 말아요/.test(pages['public/student.html']), '');
ok('콘솔 화면이 API 키 원문을 요구·복원하지 않음(가린 값은 서버로 되돌려 보내도 무시됨)', /isMaskedKey/.test(pages['public/index.html']) && /가린 모양/.test(pages['public/index.html']), '');

// ───────── 5) 화면 출력 이스케이프 (학생이 쓴 글·AI 응답·분석 결과가 코드로 해석되지 않게) ─────────
const idx = pages['public/index.html'];
const untrusted = ['u.text', 'u.aiReply', 'u.evaluation', 'c.evaluation', 'c.title', 'lastResult.contextSummary', 'overallFeedback', 'u.date', 'u.time', 'r.label', 'r.key', 't.topic'];
const offenders = [];
idx.split('\n').forEach((line, i) => {
  if (!line.includes('${')) return;
  for (const f of untrusted) {
    const re = new RegExp('\\$\\{[^}]*\\b' + f.replace('.', '\\.') + '\\b');
    if (re.test(line) && !line.includes('escapeHtml(')) offenders.push((i + 1) + ': ' + f);
  }
});
ok('콘솔: 학생·AI·분석 결과 값은 HTML 에 넣을 때 항상 escapeHtml 을 거침', offenders.length === 0, offenders);
ok('콘솔의 escapeHtml 은 따옴표까지 이스케이프', /replace\(\/"\/g, '&quot;'\)\.replace\(\/'\/g, '&#39;'\)/.test(idx), '');
ok('학생 화면은 대화 말풍선을 textContent 로 넣음(innerHTML 아님)', /d\.className = 'msg ' \+ role; d\.textContent = text;/.test(pages['public/student.html']), '');
ok('CSV 내보내기는 = + - @ 탭 줄바꿈으로 시작하는 값 앞에 \' 를 붙임', /\[=\+\\-@\\t\\r\]/.test(idx) && /t = "'" \+ t/.test(idx), '');
ok('보고서·CSV 가 어디에서도 eval·document.write(외부 입력) 를 쓰지 않음', !/eval\(|new Function\(/.test(idx + pages['public/student.html']), '');

// ───────── 5b) 기본 설정: 캐릭터·인사말(위)과 페르소나(아래)를 한 탭에 ─────────
const settingsPanel = idx.slice(idx.indexOf('id="panel-settings"'), idx.indexOf('id="panel-topics"'));
const settingsTabs = [...settingsPanel.matchAll(/class="tab[^"]*" data-sub="([^"]+)"/g)].map((m) => m[1]);
ok('기본 설정의 탭은 학급·모둠·금지어 / 캐릭터·인사말·페르소나 / 평가 루브릭 셋뿐', settingsTabs.join() === 'groups,persona,rubric', settingsTabs);
ok("'캐릭터' 탭과 하위 화면이 따로 남아 있지 않음", !/data-sub="character"/.test(idx) && !/data-sub-panel="character"/.test(idx), '');
ok('합쳐진 탭 이름이 캐릭터 · 인사말 · 페르소나', /data-sub="persona"[^>]*><span class="tab-no">2<\/span>캐릭터 · 인사말 · 페르소나<\/button>/.test(idx), '');
const personaSub = settingsPanel.slice(settingsPanel.indexOf('data-sub-panel="persona"'), settingsPanel.indexOf('data-sub-panel="groups"'));
const pos = (id) => personaSub.indexOf('id="' + id + '"');
ok('한 화면 안에서 캐릭터·이름·인사말이 위, 페르소나 입력칸이 아래', pos('charGrid') > -1 && pos('charGrid') < pos('s_characterName') && pos('s_characterName') < pos('s_greeting') && pos('s_greeting') < pos('s_role') && pos('s_role') < pos('s_action') && pos('s_action') < pos('s_restrict') && pos('s_restrict') < pos('s_exception') && pos('s_exception') < pos('s_extra'), ['charGrid', 'characterName', 'greeting', 'role'].map(pos));
ok('미리보기 상자는 캐릭터·인사말 구역에 있음(페르소나 입력칸보다 위)', pos('phonePreview') > -1 && pos('phonePreview') < pos('s_role'), [pos('phonePreview'), pos('s_role')]);
ok('저장 버튼은 하나이고 맨 아래(페르소나 입력칸 뒤)', (idx.match(/id="btnSavePersona\d*"/g) || []).length === 1 && pos('btnSavePersona') > pos('s_extra'), idx.match(/id="btnSavePersona\d*"/g));
ok('기본 설정 안내가 ①~③ 세 단계', /처음이라면 ①부터 ③까지 순서대로/.test(settingsPanel), '');

// ───────── 6) 사용 가이드 모달 (교사 콘솔) ─────────
{
  const guideStart = idx.indexOf('<div class="modal-back" id="guideModal"');
  const guide = guideStart < 0 ? '' : idx.slice(guideStart, idx.indexOf('<script src="js/qrcode.js">'));
  const dec = (s) => s.replace(/&amp;/g, '&');
  const guideText = dec(guide.replace(/<[^>]+>/g, ''));
  const rest = idx.replace(guide, ''); // 가이드 바깥의 화면
  const restText = dec(rest.replace(/<script[\s\S]*?<\/script>/g, ''));
  const script = [...idx.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');

  ok('메뉴 4 에서 "학생 기기 3단계 접속 가이드" 박스가 사라지고 안 쓰는 스타일도 없음', !/학생 기기 3단계/.test(idx) && !/device-step/.test(idx) && !/device-step/.test(read('public/css/admin.css')), '');
  ok('접속 안내(Wi-Fi·기본 카메라·직접 열기)는 사용 가이드 안으로 옮겨져 사라지지 않음', /Wi-Fi/.test(guideText) && /기본 카메라/.test(guideText) && /직접 열어요/.test(guideText), '');
  ok('사용 가이드 모달: role=dialog · aria-modal · 제목 연결 · 닫기 버튼 aria-label', /id="guideModal" role="dialog" aria-modal="true" aria-labelledby="guideModalTitle"/.test(idx) && /id="guideModalTitle"/.test(idx) && /id="btnGuideClose"[^>]*aria-label="[^"]+"/.test(idx), '');
  ok('사이드바 "사용 가이드" 버튼이 모달을 엶(1단계로 이동하던 옛 동작은 없음)', /\$\('guideBtn'\)\.addEventListener\('click', openGuide\)/.test(script) && !/\$\('gasGuide'\)/.test(script), '');
  ok('가이드 모달은 ✕ 버튼 · 배경 클릭 · Esc 로 닫힘', /\$\('btnGuideClose'\)\.addEventListener\('click', closeGuide\)/.test(script) && /guideModal\.addEventListener\('mousedown', \(e\) => \{ if \(e\.target === guideModal\) closeGuide\(\); \}\)/.test(script) && /e\.key === 'Escape'\) \{ e\.preventDefault\(\); closeGuide\(\)/.test(script), '');
  ok('가이드 모달이 열려 있는 동안 배경 스크롤을 막고 닫으면 원래대로 되돌림', /guideOverflow = document\.body\.style\.overflow; document\.body\.style\.overflow = 'hidden'/.test(script) && /document\.body\.style\.overflow = guideOverflow/.test(script), '');
  const gm = script.slice(script.indexOf('function openGuide()'), script.indexOf("$('guideBtn')"));
  ok('가이드 모달은 순수 표시용: 저장소·네트워크·설정 요청을 쓰지 않음', gm.length > 100 && !/localStorage|sessionStorage|GasClient|fetch\(|\.value\s*=|switchStep|innerHTML/.test(gm), gm.slice(0, 120));
  ok('가이드 본문은 고정 문구뿐(스크립트 ${} 로 데이터를 끼워 넣지 않음)', guide.length > 2000 && !/\$\{/.test(guide), guide.length);
  const menuTitles = [...idx.matchAll(/<span class="t">([^<]+)<\/span>/g)].map((m) => dec(m[1]));
  ok('가이드가 사이드바 메뉴 5개 이름을 모두 설명함', menuTitles.length === 5 && menuTitles.every((t) => guideText.includes(t)), menuTitles.filter((t) => !guideText.includes(t)));
  const tabLabels = [...idx.matchAll(/<button class="tab[^"]*" data-sub="[^"]+"[^>]*><span class="tab-no">\d<\/span>([^<]+)<\/button>/g)].map((m) => dec(m[1]).trim());
  ok('가이드가 기본 설정·주제 설정의 하위 탭 이름(6개)을 모두 설명함', tabLabels.length === 6 && tabLabels.every((t) => guideText.includes(t)), [tabLabels, tabLabels.filter((t) => !guideText.includes(t))]);
  const sections = ['메뉴 1', '메뉴 2', '메뉴 3', '메뉴 4', '메뉴 5', '학생 화면 안내', '보안과 개인정보', '자주 겪는 문제', 'ARgument chatBOT'];
  ok('가이드에 흐름 요약·메뉴 1~5·학생 화면·보안·문제 해결 항목이 있음', (guide.match(/class="step-card"/g) || []).length === 6 && sections.every((s) => guideText.includes(s)), sections.filter((s) => !guideText.includes(s)));
  // 가이드가 누르라고 안내하는 버튼 이름이 실제 화면에 있는지(없는 버튼을 안내하지 않게)
  const consoleButtons = ['연결 테스트', 'URL 저장', '스프레드시트 접속', '쉬는 중 해제', '모델 목록 불러오기', '모델 테스트', '불러오기', '링크 복사', '코드 복사', '새 코드 만들기', '직접 정하기', '교실 TV 전체화면', 'A4 배부용 QR 인쇄', '대화 불러오기 및 분석 실행', '학급/모둠/주제 목록 불러오기', 'HTML 보고서', 'CSV', '학생 화면 열어보기', '예시 채우기'];
  const missingBtn = consoleButtons.filter((b) => guideText.includes(b) && !restText.includes(b));
  ok('가이드가 안내하는 버튼 이름이 모두 실제 화면에 있음', consoleButtons.filter((b) => guideText.includes(b)).length >= 15 && missingBtn.length === 0, missingBtn);
  ok('가이드가 안내하는 학생 화면 버튼("탐구 대화방 입장하기")이 학생 화면에 있음', guideText.includes('탐구 대화방 입장하기') && pages['public/student.html'].includes('탐구 대화방 입장하기'), '');
  ok('가이드가 말하는 시트 메뉴 이름이 GAS 메뉴와 같음', ['🔐 교사 비밀번호 설정', '🔑 수업 입장 코드 보기', '🩺 시트 구조 점검', '🗣️ 아르봇(ARBOT)', '📖 사용 가이드'].every((m) => guideText.includes(m) && server.includes(m)), '');
}

// ───────── 7) 푸터 크레딧 + 제작자 모달 (교사 콘솔·학생 화면 공용) ─────────
{
  const js = read('public/js/credit-footer.js');
  const tokens = read('public/css/tokens.css');
  const studentCss = read('public/css/student.css');
  const dec = (s) => s.replace(/&amp;/g, '&');
  const text = dec(js.replace(/\\'/g, "'"));
  const stu = pages['public/student.html'], tea = pages['public/index.html'];

  ok('credit-footer.js 가 있고 두 화면이 내 폴더에서 불러옴(외부 주소 아님)', fs.existsSync(path.join(ROOT, 'public/js/credit-footer.js')) && /<script src="js\/credit-footer\.js"><\/script>/.test(tea) && /<script src="js\/credit-footer\.js"><\/script>/.test(stu), '');
  let syn = null; try { new vm.Script(js); } catch (e) { syn = e.message; }
  ok('credit-footer.js 문법 정상', syn === null, syn);
  ok('푸터 문구: © 2026 Designed & Developed by 두리쌤. All rights reserved.', text.includes('© 2026 Designed & Developed by ') && /<button type="button" class="credit-link"[^>]*>두리쌤<\/button>\. All rights reserved\./.test(text), '');
  ok('"두리쌤"만 버튼(링크처럼 밑줄)이고 외부 주소로 이동하지 않음(href 없음)', !/credit-link[^>]*href/.test(js) && /\.credit-link \{[^}]*text-decoration: underline[^}]*cursor: pointer/.test(tokens), '');
  ok('교사 콘솔에는 푸터 자리가 하나(본문 아래)', (tea.match(/data-credit-footer/g) || []).length === 1 && /<\/main>\s*<div data-credit-footer><\/div>/.test(tea), '');
  const screens = ['screenNoConn', 'screenCode', 'screenSelect', 'screenChat'];
  const slot = (id) => { const a = stu.indexOf('id="' + id + '"'); const nx = screens.map((s) => stu.indexOf('id="' + s + '"')).filter((p) => p > a).sort((x, y) => x - y)[0]; return stu.slice(a, nx || stu.indexOf('<script src="js/gasClient.js">')); };
  ok('학생 화면은 네 화면(연결 없음·코드·선택·대화) 모두에 푸터 자리가 하나씩 있음', (stu.match(/data-credit-footer/g) || []).length === 4 && screens.every((id) => (slot(id).match(/data-credit-footer/g) || []).length === 1), screens.map((id) => (slot(id).match(/data-credit-footer/g) || []).length));
  ok('모달 접근성: role=dialog · aria-modal=true · aria-labelledby · 닫기 버튼 aria-label', /setAttribute\('role', 'dialog'\)/.test(js) && /setAttribute\('aria-modal', 'true'\)/.test(js) && /setAttribute\('aria-labelledby', 'creditModalTitle'\)/.test(js) && /id="creditModalTitle"/.test(js) && /class="credit-close" aria-label="[^"]+"/.test(js), '');
  ok('첫 카드: ✨ 제작: 두리쌤 · 📌 이용 조건 · 4개 항목', text.includes('✨ 제작: 두리쌤') && text.includes('📌 이용 조건') && ['교육 목적으로 자유롭게 사용하실 수 있습니다.', '재배포 시 출처(제작자 표기)를 유지해주세요.', '코드를 임의로 수정한 버전을 다시 배포하지 말아주세요.', '수정이 필요하시면 아래 연락처로 요청해주세요.'].every((l) => text.includes('<li>' + l + '</li>')), '');
  ok('둘째 카드: 📷 문의 · Instagram · Blog 가 새 탭 링크(noopener)', text.includes('📷 문의') && /<a href="https:\/\/www\.instagram\.com\/trdoolee" target="_blank" rel="noopener noreferrer">trdoolee<\/a>/.test(text) && /<a href="https:\/\/blog\.naver\.com\/trdoolee" target="_blank" rel="noopener noreferrer">blog\.naver\.com\/trdoolee<\/a>/.test(text), '');
  ok('마지막 줄 안내(작은 이탤릭): 간단한 질문 위주로 답변드리며, 답변이 늦어질 수 있습니다.', /<p class="credit-note">간단한 질문 위주로 답변드리며, 답변이 늦어질 수 있습니다\.<\/p>/.test(text) && /\.credit-card \.credit-note \{[^}]*font-style: italic/.test(tokens), '');
  ok('모달은 ✕ 버튼 · 배경 클릭 · Esc 로 닫힘', /querySelector\('\.credit-close'\)\.addEventListener\('click', close\)/.test(js) && /addEventListener\('mousedown', function \(e\) \{ if \(e\.target === modal\) close\(\); \}\)/.test(js) && /e\.key === 'Escape'\) \{ e\.preventDefault\(\); close\(\)/.test(js), '');
  ok('열려 있는 동안 body 스크롤을 막고 닫으면 원래 값으로 되돌림', /savedOverflow = document\.body\.style\.overflow;\s*document\.body\.style\.overflow = 'hidden'/.test(js) && /document\.body\.style\.overflow = savedOverflow/.test(js), '');
  ok('모달 키 처리는 열려 있을 때만 반응함(다른 화면의 Esc·Tab 을 가로채지 않음)', /document\.addEventListener\('keydown', function \(e\) \{\s*if \(!isOpen\(\)\) return;/.test(js), '');
  const code = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  ok('순수 표시용: 저장소·네트워크·GasClient·입력값·새로고침·이동을 쓰지 않음', !/localStorage|sessionStorage|fetch\(|XMLHttpRequest|sendBeacon|GasClient|\.value\b|\.reload\(|location\b|eval\(|new Function|document\.cookie/.test(code), code.match(/localStorage|sessionStorage|fetch\(|XMLHttpRequest|GasClient|\.value\b|\.reload\(|location\b/g));
  const assigns = [...code.matchAll(/innerHTML\s*=\s*([^;]+);/g)].map((m) => m[1].trim());
  ok('innerHTML 에는 고정 상수(FOOTER_HTML·MODAL_HTML)만 넣음(사용자·AI 텍스트 없음)', assigns.length === 2 && assigns.every((a) => a === 'FOOTER_HTML' || a === 'MODAL_HTML'), assigns);
  ok('공용 스타일(tokens.css)에 푸터·모달 규칙이 있고 두 화면이 tokens.css 를 불러옴', ['.credit-footer', '.credit-back', '.credit-modal', '.credit-close', '.credit-card'].every((s) => tokens.includes(s + ' ') || tokens.includes(s + ',') || tokens.includes(s + ' {')) && /href="css\/tokens\.css"/.test(tea) && /href="css\/tokens\.css"/.test(stu), '');
  ok('모달 배경은 다른 화면 요소(TV 오버레이 100·기존 모달 90)보다 위(z-index 120)', /\.credit-back \{[^}]*z-index: 120/.test(tokens), '');
  ok('학생 화면 다크 테마에서도 읽히게 모달 색을 학생 팔레트에 연결', /html \{ --credit-card: var\(--s-card\);/.test(studentCss) && /html\[data-theme="dark"\] \{ --credit-link:/.test(studentCss), '');
  ok('학생 대화 화면 푸터는 키보드가 올라온 낮은 화면에서 숨김', /@media \(max-height: 640px\) and \(max-width: 899px\) \{ \.chat-shell \.credit-footer \{ display: none; \} \}/.test(studentCss), '');
}

// ───────── 8) 기타 ─────────
const pkg = JSON.parse(read('package.json'));
ok('package.json 에 npm test 가 있음', /node tests\/gas_logic\.test\.js/.test((pkg.scripts || {}).test || '') && /frontend_static/.test((pkg.scripts || {}).test || ''), pkg.scripts);

asyncChecks.then(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
