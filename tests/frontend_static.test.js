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
  const consoleButtons = ['연결 테스트', 'URL 저장', '스프레드시트 접속', '쉬는 중 해제', '모델 목록 불러오기', '모델 테스트', '불러오기', '링크 복사', '코드 복사', '새 코드 만들기', '직접 정하기', '교실 TV 전체화면', 'A4 배부용 QR 인쇄', '대화 불러오기 및 분석 실행', '목록·기록 새로고침', 'HTML 보고서', 'CSV', '학생 화면 열어보기', '예시 채우기'];
  const missingBtn = consoleButtons.filter((b) => guideText.includes(b) && !restText.includes(b));
  ok('가이드가 안내하는 버튼 이름이 모두 실제 화면에 있음', consoleButtons.filter((b) => guideText.includes(b)).length >= 15 && missingBtn.length === 0, missingBtn);
  ok('가이드가 안내하는 학생 화면 버튼("탐구 대화방 입장하기")이 학생 화면에 있음', guideText.includes('탐구 대화방 입장하기') && pages['public/student.html'].includes('탐구 대화방 입장하기'), '');
  ok('가이드가 말하는 시트 메뉴 이름이 GAS 메뉴와 같음', ['🔐 교사 비밀번호 설정', '🔑 수업 입장 코드 보기', '🔄 주제 세부설정 맞추기', '🩺 시트 구조 점검', '🗣️ 아르봇(ARBOT)', '📖 사용 가이드'].every((m) => guideText.includes(m) && server.includes(m)), '');
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

// ───────── 8) 결과 분석(메뉴 5): 학급 → 주제 → 모둠 순차 단추 ─────────
{
  const tea = pages['public/index.html'];
  const adminCss = read('public/css/admin.css');
  const logic = read('public/js/pick-logic.js');
  const script = [...tea.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  const panel = tea.slice(tea.indexOf('id="panel-analyze"'), tea.indexOf('id="resultCard"'));
  const at = (id) => panel.indexOf('id="' + id + '"');
  const fnBody = (name, next) => { const a = script.indexOf('function ' + name), b = script.indexOf(next, a); return a < 0 || b < 0 ? '' : script.slice(a, b); };

  ok('메뉴 5 에 드롭박스(select)가 없고 학급·주제·모둠 단추 영역이 이 순서(학급 → 주제 → 모둠)로 있음', !/<select/.test(panel) && at('pickClass') > 0 && at('pickClass') < at('pickTopic') && at('pickTopic') < at('pickGroup'), [at('pickClass'), at('pickTopic'), at('pickGroup')]);
  ok('단계 번호가 1·2·3 이고 주제·모둠 단계는 처음에 잠겨(locked) 있음', /id="pickStepClass"/.test(panel) && /class="pick-step locked" id="pickStepTopic"/.test(panel) && /class="pick-step locked" id="pickStepGroup"/.test(panel) && ['1', '2', '3'].every((n) => new RegExp('<span class="pick-no">' + n + '</span>').test(panel)), '');
  ok('분석 버튼은 처음에 꺼져 있음(disabled)', /<button id="btnAnalyze"[^>]*\bdisabled\b/.test(panel), '');
  ok('각 단계 단추 묶음은 role=group 으로 제목과 연결됨', ['pickClass', 'pickTopic', 'pickGroup'].every((id) => new RegExp('id="' + id + '" role="group" aria-labelledby="[^"]+"').test(panel)) && /id="pickSummary" aria-live="polite"/.test(panel), '');
  ok('선택 규칙(pick-logic.js)을 콘솔이 내 폴더에서 불러옴', fs.existsSync(path.join(ROOT, 'public/js/pick-logic.js')) && /<script src="js\/pick-logic\.js"><\/script>/.test(tea) && tea.indexOf('js/pick-logic.js') < tea.search(/<script>\r?\n  const \$ = /), ''); // \r?: Windows 에서 받은 파일(CRLF)도 통과
  ok('옛 드롭박스 코드(selClass·selGroup·selTopic·populateSelect)가 남아 있지 않음', !/selClass|selGroup|selTopic|populateSelect/.test(tea), '');

  const render = fnBody('renderPickStep', 'function syncAnalyzeBtn');
  ok('단추의 이름·부가 글은 textContent 로만 넣음(시트에서 온 글이 HTML 로 해석되지 않게)', render.length > 200 && /name\.textContent = o\.value/.test(render) && /s\.textContent = sub/.test(render) && !/innerHTML/.test(render), render.slice(0, 80));
  ok('기록 없음·평가 제외 표시와 못 누르는 단추(disabled)가 있음', /return '기록 없음'/.test(script) && /평가 제외 \$\{o\.total\}건/.test(script) && /b\.disabled = !ArguPick\.selectable\(o\)/.test(render), '');
  ok('앞 단계를 고르기 전의 뒤 단계 단추는 잠긴(locked) 단추로 그려짐', /ArguPick\.topicOptions\(pickIdx, pick\.cls\) : lockedOptions\(/.test(script) && /ArguPick\.groupOptions\(pickIdx, pick\.cls, pick\.topic\) : lockedOptions\(/.test(script), '');
  ok('학급을 바꾸면 주제·모둠이, 주제를 바꾸면 모둠이 비워짐', /function chooseClass\(v\) \{ pick = \{ cls: v, topic: '', group: '' \}/.test(script) && /function chooseTopic\(v\) \{ pick = \{ cls: pick\.cls, topic: v, group: '' \}/.test(script), '');
  ok('선택이 바뀔 때마다 이전 분석의 루브릭 안내가 지워지고 탐구 도우미 안내가 갱신됨', /function afterPickChange\(\) \{ \$\('rubricNote'\)\.innerHTML = ''; renderPicker\(\); updateQnaNote\(\); \}/.test(script) && /normTopic\(pick\.topic\)/.test(script), '');
  ok('분석 버튼은 세 단계가 유효할 때만 켜지고, 분석 중에는 꺼짐', /\$\('btnAnalyze'\)\.disabled = analyzing \|\| !\(pickIdx && ArguPick\.canAnalyze\(pickIdx, pick\)\)/.test(script) && /analyzing = true; syncAnalyzeBtn\(\)/.test(script) && /finally \{ analyzing = false; syncAnalyzeBtn\(\); \}/.test(script) && !/\$\('btnAnalyze'\)\.disabled = false/.test(script), '');
  ok('분석을 실행하기 전에 한 번 더 선택이 유효한지 확인하고, 분석 요청은 고른 값(pick)으로 보냄', /if \(!pickIdx \|\| !ArguPick\.canAnalyze\(pickIdx, pick\)\)/.test(script) && /const f = \{ classValue: pick\.cls, groupValue: pick\.group, topicValue: pick\.topic \}/.test(script), '');
  ok('기록 유무는 getChatOverview 로 불러오고, 실패해도 목록 단추는 그대로 쓰게 하며 옛 GAS 는 안내함', /GasClient\.callPost\('getChatOverview', \{\}\)/.test(script) && /\(error\) => \(\{ error \}\)/.test(script) && /ov\.combos \|\| null/.test(script) && /ov\.error\.oldBackend/.test(script), '');
  ok('늦게 도착한 옛 응답은 버림(새로고침 순번 확인)', /const seq = \+\+pickLoadSeq/.test(script) && (script.match(/seq (!==|===) pickLoadSeq/g) || []).length >= 3 && /if \(seq !== pickLoadSeq\) return;/.test(script), '');
  ok('단추 안내 문구의 조사가 받침에 맞음(탐구 주제를 · 모둠을 · 학급을)', /\$\{pick\.topic \? '모둠을' : '탐구 주제를'\} 골라 주세요/.test(script) && /학급을 골라 주세요/.test(script) && /'탐구 주제를 골라 주세요'/.test(script) && /'모둠을 골라 주세요 · /.test(script) && !/모둠를|주제을|학급를/.test(script), '');
  ok('메뉴 5 에 들어올 때마다 목록·기록을 새로 읽음', /if \(name === 'analyze'\) refreshPicker\(false\)/.test(script) && /id="btnLoadOptions"[^>]*><span class="ms">sync<\/span>목록·기록 새로고침/.test(panel), '');
  ok('getChatOverview 는 콘솔 호출 목록(TEACHER_ACTIONS)과 서버 교사 전용 목록 양쪽에 있고 버전 요구가 3 이상', /'getChatOverview'/.test(gasClient) && /"getChatOverview"/.test(server) && Number((script.match(/const REQUIRED_API_VERSION = (\d+)/) || [])[1]) >= 3, '');
  ok('분석 결과 화면은 입력 폼이 아니라 분석 응답으로만 그림(드롭박스가 없어도 결과 제목이 나옴)', /lastFilters = f;/.test(script) && /\$\('resultTitle'\)\.textContent = `\$\{lastFilters\.classValue\} \$\{lastFilters\.groupValue\} 분석 결과`/.test(script), '');

  ok('pick-logic.js 는 화면·저장소·네트워크를 쓰지 않는 순수 로직', !/\bdocument\b|localStorage|sessionStorage|fetch\(|XMLHttpRequest|eval\(|new Function/.test(logic.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), '');
  ok('단추 스타일: 기록 없음·평가 제외는 점선, 못 누르는 단추는 not-allowed, 선택된 단추는 파란색', /\.pick-btn\.empty, \.pick-btn\.excluded \{[^}]*border-style: dashed/.test(adminCss) && /\.pick-btn:disabled \{ cursor: not-allowed; \}/.test(adminCss) && /\.pick-btn\.on \{[^}]*background: var\(--blue\)/.test(adminCss), '');
  ok('쓰지 않는 .filters 스타일이 정리됨', !/\.filters/.test(adminCss) && !/class="filters"/.test(tea), '');
}

// ───────── 9) 안내 카드 문장: 설명 속 굵은 글씨가 줄을 바꾸지 않음 ─────────
{
  const adminCss = read('public/css/admin.css');
  const tea = pages['public/index.html'];
  ok('.step-card 에서 제목(첫 b)만 블록이고, 설명 속 굵은 글씨(span b)는 인라인(줄바꿈 없음)', /\.step-card > div > b \{ display: block;/.test(adminCss) && /\.step-card span b \{ display: inline;/.test(adminCss) && !/\.step-card b \{ display: block/.test(adminCss), '');
  const cards = [...tea.matchAll(/<div class="step-card">([\s\S]*?)<\/div><\/div>/g)].map((m) => m[1]);
  ok('안내 카드 구조는 <b>제목</b> 다음 <span>설명</span> 하나(CSS 규칙이 전제하는 모양)', cards.length >= 17 && cards.every((c) => /^<span class="n">\d+<\/span><div><b>[^<]+<\/b><span>/.test(c)), cards.filter((c) => !/^<span class="n">\d+<\/span><div><b>[^<]+<\/b><span>/.test(c)).slice(0, 2));
  ok('안내 카드에 줄바꿈 문자가 끼어 있지 않음(한 줄 마크업)', cards.every((c) => !/\n/.test(c)), '');
  // 메뉴 4: 카드가 하나만 남았는데 옛 2열 레이아웃이 그대로여서 카드가 절반 너비로 좁아졌던 문제의 재발 방지
  const linkPanel = tea.slice(tea.indexOf('id="panel-link"'), tea.indexOf('id="panel-analyze"'));
  const linkRule = (adminCss.match(/\.link-layout \{([^}]*)\}/) || [])[1] || '';
  const cardsInLink = (linkPanel.match(/<div class="card">/g) || []).length;
  const colsInRule = ((linkRule.match(/grid-template-columns:([^;]*);/) || [])[1] || '').split('minmax(').length - 1;
  ok('메뉴 4: 카드 수와 .link-layout 의 열 수가 같음(카드 하나면 1열 = 본문 너비 전체)', cardsInLink >= 1 && colsInRule === cardsInLink && !/1\.1fr/.test(linkRule), [cardsInLink, colsInRule, linkRule.slice(0, 80)]);
  ok('결과 분석 카드 제목은 "대화 불러오기 및 논증 분석"', /<h2>대화 불러오기 및 논증 분석<\/h2>/.test(tea) && !/<h2>[^<]*툴민 분석<\/h2>/.test(tea), '');
  ok('옛 이름("논증 분석 스프레드시트")이 안내문에 남지 않고 해요체로 통일됨', !/논증 분석 스프레드시트/.test(tea) && !/복사합니다|엽니다\.|배포합니다|로그인합니다|누릅니다/.test(tea.slice(tea.indexOf('id="gasGuide"'), tea.indexOf('id="securityCard"'))), '');
}

// ───────── 10) 주제 목록 저장 ↔ 시트 '주제 세부설정' 탭 연동 안내 ─────────
{
  const tea = pages['public/index.html'];
  const script = [...tea.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  const guideText = tea.slice(tea.indexOf('id="guideModal"'), tea.indexOf('<script src="js/qrcode.js">')).replace(/<[^>]+>/g, '');
  ok('목록 저장 함수가 서버 응답을 받아 저장 후 처리(onSaved)에 넘김', /const res = await GasClient\.callPost\('saveTeacherSettings', payload\);/.test(script) && /onSaved\(res\);/.test(script), '');
  const topicSave = script.slice(script.indexOf('const saveTopicList'), script.indexOf('// ---- 페르소나 · 루브릭 편집'));
  ok('주제 목록 저장 뒤 "주제 세부설정 탭에 N개의 줄을 만들었어요"를 알리고, 줄 맞추기 실패는 주의로 알림', /res && res\.topicRows/.test(topicSave) && /tr\.added/.test(topicSave) && /주제 세부설정' 탭에 새 주제 \$\{tr\.added\}개의 줄을 만들었어요/.test(topicSave) && /tr && tr\.error\) setStatus\(\$\('topicsStatus'\), 'warn'/.test(topicSave), topicSave.slice(0, 120));
  ok('옛 GAS(topicRows 없음)여도 저장 안내가 정상으로 나옴(topicRows 가 없으면 안내만 빠짐)', /const tr = res && res\.topicRows;/.test(topicSave) && /\(tr && tr\.added \?/.test(topicSave), '');
  ok('저장한 뒤 주제 연결 표를 다시 불러옴(줄이 만들어진 것을 화면도 보게)', /loadProfiles\(\);\s*\}\);/.test(topicSave), '');
  ok('가이드가 "주제 목록 저장 → 시트 주제 세부설정 탭에 줄 자동 생성"과 시트 메뉴를 설명함', /주제 세부설정<\/b>|주제 세부설정/.test(guideText) && guideText.includes('자동으로 만들어져요') && guideText.includes('🔄 주제 세부설정 맞추기'), '');
  ok('서버의 해당 메뉴 이름과 응답 필드(topicRows)가 화면이 쓰는 것과 같음', server.includes("'🔄 주제 세부설정 맞추기', 'syncTopicRowsFromMenu'") && /result\.topicRows = \{ added: sync\.added, removed: sync\.removed \}/.test(server) && /if \(!sync\.success\) result\.topicRows\.error = sync\.error;/.test(server), '');
}

// ───────── 10b) 캐릭터 ↔ 대화 방식(템플릿) 1:1 짝 ─────────
// 학생 첫 화면에 '○○가 함께해요'로 나오는 캐릭터와 설명이 AI의 실제 역할(템플릿)과 어긋나지 않게 하는 규칙.
{
  const sharedCtx = vm.createContext({ window: {}, document: { documentElement: { classList: { add() {} } }, fonts: { load: () => ({ then() {} }) } }, setTimeout: () => 0, localStorage: {} });
  vm.runInContext(read('public/js/argu-shared.js'), sharedCtx);
  const AS = sharedCtx.window.ArguShared;
  const tplCtx = vm.createContext({});
  const TP = vm.runInContext(read('gas-source/Templates.js') + '\nTEMPLATE_PROFILES_', tplCtx);
  const keys = Object.keys(AS.TEMPLATE_NAMES);
  const chars = AS.CHARACTERS;

  ok('캐릭터는 5명이고 대화 방식(템플릿) 5종과 하나씩 짝(1:1)', chars.length === 5 && keys.length === 5 && new Set(chars.map((c) => c.id)).size === 5 && new Set(chars.map((c) => c.template)).size === 5 && keys.every((k) => chars.filter((c) => c.template === k).length === 1), chars.map((c) => [c.id, c.template]));
  ok('찬반 토론형의 짝은 토론 파트너, 탐구 도우미의 짝은 로봇 (옛 짝 비판적 사고 코치·실험 가운 선생님이 아님)', AS.characterFor('debate').id === 'debater' && AS.characterFor('debate').name === '토론 파트너' && AS.characterFor('qna').id === 'robot' && AS.characterFor('socratic').id === 'socrates' && AS.characterFor('cer').id === 'labcoat' && AS.characterFor('advanced').id === 'coach', keys.map((k) => AS.characterFor(k).id));
  ok('모든 캐릭터에 그림이 있고 세 가지 입 모양(질문·생각·칭찬)을 갖춤', chars.every((c) => { const h = AS.avatarHtml(c.id, 'asking'); return /<svg/.test(h) && h.includes('m-ask') && h.includes('m-think') && h.includes('m-happy'); }), '');
  ok("옛 '추천 템플릿(recommend)' 목록은 없어지고 캐릭터마다 template 하나", chars.every((c) => !('recommend' in c) && typeof c.template === 'string' && c.tagline), '');
  ok('Templates.js 의 템플릿 원본이 같은 짝·이름·인사말을 씀(새 시트에 처음부터 맞게 들어감)', TP.length === 5 && TP.every((t) => t.persona.characterId === AS.characterFor(t.key).id && t.persona.characterName === AS.characterFor(t.key).name && t.persona.greeting === AS.GREETINGS[t.key]), TP.map((t) => [t.key, t.persona.characterId, t.persona.characterName]));

  const rc = (t, id, name) => { const r = AS.resolveCharacter(t, id, name); return r.id + '|' + r.name; };
  ok('예전 시트의 어긋난 짝(찬반 토론형=비판적 사고 코치)은 토론 파트너로, 탐구 도우미=실험 가운 선생님은 로봇으로 바뀌어 보임', rc('debate', 'coach', '비판적 사고 코치') === 'debater|토론 파트너' && rc('debate', 'coach', '') === 'debater|토론 파트너' && rc('qna', 'labcoat', '실험 가운 과학 선생님') === 'robot|과학 조교 로봇', [rc('debate', 'coach', '비판적 사고 코치'), rc('qna', 'labcoat', '실험 가운 과학 선생님')]);
  ok('교사가 이름을 직접 바꾼 것은 옛 짝이어도 그대로 둠', rc('debate', 'coach', '토론왕') === 'coach|토론왕' && rc('qna', 'labcoat', '실험 도우미') === 'labcoat|실험 도우미', [rc('debate', 'coach', '토론왕'), rc('qna', 'labcoat', '실험 도우미')]);
  ok('옛 짝이 아닌 정상 조합은 건드리지 않음(고급 논쟁형=코치, CER=가운, 소크라테스형에서 고른 다른 캐릭터)', rc('advanced', 'coach', '비판적 사고 코치') === 'coach|비판적 사고 코치' && rc('cer', 'labcoat', '실험 가운 과학 선생님') === 'labcoat|실험 가운 과학 선생님' && rc('socratic', 'robot', '') === 'robot|과학 조교 로봇' && rc('debate', 'socrates', '소크라테스 선생님') === 'socrates|소크라테스 선생님', '');
  ok('모르는 캐릭터 ID나 빈 값은 그 방식의 짝 캐릭터로(이름은 직접 적은 것을 우선)', rc('debate', 'scientist', '') === 'debater|토론 파트너' && rc('debate', '', '') === 'debater|토론 파트너' && rc('qna', undefined, undefined) === 'robot|과학 조교 로봇' && rc('cer', 'scientist', 'CER쌤') === 'labcoat|CER쌤' && rc('모르는방식', 'zzz', '') === 'socrates|소크라테스 선생님', '');

  ok('이름이 다른 캐릭터의 기본 이름이면 옛 값으로 보고 이 캐릭터의 기본 이름으로(토론 파트너 그림에 비판적 사고 코치 이름이 붙지 않음)', rc('debate', 'debater', '비판적 사고 코치') === 'debater|토론 파트너' && rc('socratic', 'robot', '소크라테스 선생님') === 'robot|과학 조교 로봇' && rc('debate', 'scientist', '소크라테스 선생님') === 'debater|토론 파트너' && rc('advanced', 'coach', '비판적 사고 코치') === 'coach|비판적 사고 코치' && rc('debate', 'debater', '반대 선수') === 'debater|반대 선수', [rc('debate', 'debater', '비판적 사고 코치'), rc('socratic', 'robot', '소크라테스 선생님'), rc('debate', 'scientist', '소크라테스 선생님')]);

  // 빈 칸 규칙: 페르소나 줄(row)과 '기본' 줄(base)로 실제 캐릭터를 정한다 (서버 inheritCharacter_ 와 같은 규칙, gas_profiles.test.js 가 둘을 비교)
  const pc = (row, base) => { const r = AS.personaCharacter(row, base); return r.id + '|' + r.name; };
  const SOCB = { templateKey: 'socratic', characterId: 'socrates', characterName: '소크라테스 선생님' };
  ok('빈 칸 규칙: 기본과 다른 대화 방식인데 캐릭터 칸이 비면 그 방식의 짝(기본의 소크라테스를 물려받지 않음)', pc({ templateKey: 'debate' }, SOCB) === 'debater|토론 파트너' && pc({ templateKey: 'qna' }, SOCB) === 'robot|과학 조교 로봇' && pc({ templateKey: 'cer', characterName: '' }, SOCB) === 'labcoat|실험 가운 과학 선생님', [pc({ templateKey: 'debate' }, SOCB), pc({ templateKey: 'qna' }, SOCB)]);
  ok('빈 칸 규칙: 캐릭터만 정하고 이름을 비우면 기본의 이름이 아니라 그 캐릭터의 이름', pc({ templateKey: 'debate', characterId: 'debater' }, SOCB) === 'debater|토론 파트너' && pc({ templateKey: 'socratic', characterId: 'robot' }, SOCB) === 'robot|과학 조교 로봇', [pc({ templateKey: 'debate', characterId: 'debater' }, SOCB)]);
  ok('빈 칸 규칙: 기본과 같은 대화 방식이면 빈 칸은 기본을 따름(기본에서 바꾼 캐릭터·이름도 그대로)', pc({ templateKey: 'socratic' }, SOCB) === 'socrates|소크라테스 선생님' && pc({}, { templateKey: 'socratic', characterId: 'robot', characterName: '로봇쌤' }) === 'robot|로봇쌤' && pc({ templateKey: 'socratic', characterName: '내 선생님' }, SOCB) === 'socrates|내 선생님', [pc({}, { templateKey: 'socratic', characterId: 'robot', characterName: '로봇쌤' })]);
  ok('빈 칸 규칙: 직접 정한 캐릭터·이름은 대화 방식과 달라도 그대로, 이름만 정하면 이름은 두고 캐릭터는 짝', pc({ templateKey: 'debate', characterId: 'robot', characterName: '내 로봇' }, SOCB) === 'robot|내 로봇' && pc({ templateKey: 'debate', characterName: '반대 선수' }, SOCB) === 'debater|반대 선수', [pc({ templateKey: 'debate', characterName: '반대 선수' }, SOCB)]);
  ok('빈 칸 규칙: 기본 줄이 비어 있거나 없어도 깨지지 않고, 템플릿 칸도 비면 기본을 통째로 따름', pc({}, {}) === 'socrates|소크라테스 선생님' && pc({ templateKey: 'cer' }, undefined) === 'labcoat|실험 가운 과학 선생님' && pc({}, SOCB) === 'socrates|소크라테스 선생님' && AS.personaCharacter({ templateKey: 'debate' }, SOCB).templateKey === 'debate', [pc({}, {}), pc({ templateKey: 'cer' }, undefined)]);

  const sc = keys.map((k) => AS.studentCopy(k));
  ok('대화 방식마다 입장 화면 문구(인사 한 줄·튜터 설명·상태 글자)가 있고 서로 다름', sc.every((c) => c.hero && c.tutor && c.states.asking && c.states.thinking && c.states.praising) && new Set(sc.map((c) => c.tutor)).size === 5 && new Set(sc.map((c) => c.hero)).size === 5, sc.map((c) => c.tutor));
  ok('찬반 토론형의 튜터 설명은 반론·입장을 말하고, 소크라테스형 문구(질문으로 키워 줘요)가 아님', /반론/.test(AS.studentCopy('debate').tutor) && /입장/.test(AS.studentCopy('debate').tutor) && !/정답을 알려주는 대신/.test(AS.studentCopy('debate').tutor) && /반론/.test(AS.studentCopy('debate').states.asking), AS.studentCopy('debate'));
  ok('모르는 방식은 소크라테스형 문구로(깨지지 않음)', AS.studentCopy('모르는방식').tutor === AS.studentCopy('socratic').tutor, '');

  // 화면이 이 규칙을 실제로 쓴다
  const stuScript = [...pages['public/student.html'].matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  const idxScript = [...pages['public/index.html'].matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  ok('학생 화면: 캐릭터를 resolveCharacter 로 정하고, 인사 한 줄·튜터 설명·상태 글자를 studentCopy 에서 가져옴', /AS\.resolveCharacter\(S\.templateKey, c\.id, c\.name\)/.test(stuScript) && /AS\.studentCopy\(S\.templateKey\)/.test(stuScript) && /\$\('heroLine'\)\.textContent = copy\.hero/.test(stuScript) && /\$\('tutorDesc'\)\.textContent = copy\.tutor/.test(stuScript) && /\.states\[state\]/.test(stuScript), '');
  ok('학생 화면 스크립트에 소크라테스형 튜터 문구가 모든 방식에 박혀 있지 않음', !/정답을 알려주는 대신/.test(stuScript), '');
  ok('학생 화면: 캐릭터를 템플릿보다 먼저 정하지 않음(템플릿을 먼저 정한 뒤 짝을 구함)', stuScript.indexOf('S.templateKey = AS.STEPS[c.templateKey]') > -1 && stuScript.indexOf('S.templateKey = AS.STEPS[c.templateKey]') < stuScript.indexOf('AS.resolveCharacter(S.templateKey'), '');
  ok("콘솔: 캐릭터 카드는 template 짝을 보여 주고 recommend 는 더 이상 쓰지 않음", /c\.template === curTpl/.test(idxScript) && !/\.recommend/.test(idxScript), '');
  ok('콘솔: 대화 방식을 바꾸면 고르지 않은 캐릭터·이름이 새 짝으로 바뀌고 카드·미리보기를 다시 그림', /\$\('p_template'\)\.addEventListener\('change'[\s\S]*?AS\.characterFor\(tpl\)\.id[\s\S]*?renderCharGrid\(\); renderPreview\(\)/.test(idxScript), '');
  ok('콘솔: 시트의 값을 불러올 때도 학생 화면과 같은 resolveCharacter 규칙, 초기화 단추는 이 방식의 짝으로', /const ch = AS\.personaCharacter\(row, base\)/.test(idxScript) && !/AS\.resolveCharacter\(tpl, row\.characterId \|\| base\.characterId/.test(idxScript) && /\$\('btnResetChar'\)\.addEventListener\('click'[\s\S]*?AS\.characterFor\(tpl\)/.test(idxScript), '');
  ok('콘솔 미리보기의 상태 글자도 대화 방식을 따름(온화하게 질문하는 중 고정 문구 없음)', /AS\.studentCopy\(\$\('s_templateKey'\)\.value \|\| 'socratic'\)\.states\.asking/.test(idxScript) && !/온화하게 질문하는 중/.test(idxScript), '');
}

// ───────── 10c) 탐구 자료 '예시 채우기': 주제마다 알맞은 예시 ─────────
// 예전에는 어느 주제를 골라도 '전류와 전압의 관계' 예시만 채워졌다. 예시 주제 하나에 자료 예시 하나가 짝이어야 한다.
{
  const matSrc = read('public/js/material-samples.js');
  const matCtx = vm.createContext({}); // window 가 없으면 globalThis(=이 가짜 환경)에 붙는다
  vm.runInContext(matSrc, matCtx);
  const M = matCtx.ArguMaterials;
  const norm = (t) => String(t).replace(/\s+/g, ' ').trim().toLowerCase();
  const exampleTopics = M.TOPIC_EXAMPLES.flatMap((g) => g.items);
  const sampleKeys = Object.keys(M.SAMPLES);
  const total = (s) => ['procedure', 'materials', 'safety', 'notes'].reduce((n, k) => n + s[k].length, 0);

  ok('예시 주제 목록은 4묶음 23개이고 이름에 쉼표가 없음(주제 목록은 쉼표로 구분)', M.TOPIC_EXAMPLES.length === 4 && exampleTopics.length === 23 && new Set(exampleTopics.map(norm)).size === 23 && exampleTopics.every((t) => !t.includes(',')), exampleTopics.length);
  ok('예시 주제마다 탐구 자료 예시가 하나씩 있음(빠진 주제 없음)', exampleTopics.every((t) => M.sampleFor(t)), exampleTopics.filter((t) => !M.sampleFor(t)));
  ok('짝 없는 자료 예시도 없음(예시 주제 이름과 자료 예시 이름이 1:1)', sampleKeys.length === exampleTopics.length && sampleKeys.every((k) => exampleTopics.includes(k)), sampleKeys.filter((k) => !exampleTopics.includes(k)));
  ok('모든 예시가 실험 과정·준비물·유의사항·교사용 메모 네 칸을 다 채움', Object.values(M.SAMPLES).every((s) => ['procedure', 'materials', 'safety', 'notes'].every((k) => typeof s[k] === 'string' && s[k].trim().length > 10)), '');
  // 탐구 자료는 학생이 말할 때마다 AI에게 가므로 짧게 쓴다. 서버 한도(칸당 1500자·전체 3000자)보다 훨씬 작게.
  const sizes = Object.entries(M.SAMPLES).map(([k, s]) => [k, total(s), Math.max(...['procedure', 'materials', 'safety', 'notes'].map((f) => s[f].length))]);
  ok('분량 조절: 한 주제의 예시는 전체 500자 이내, 한 칸은 250자 이내(토큰 절약)', sizes.every(([, t, m]) => t <= 500 && m <= 250), sizes.filter(([, t, m]) => t > 500 || m > 250));
  const serverLimits = { field: Number((server.match(/MATERIAL_MAX_FIELD_\s*=\s*(\d+)/) || [])[1]), total: Number((server.match(/MATERIAL_MAX_TOTAL_\s*=\s*(\d+)/) || [])[1]) };
  ok('서버의 탐구 자료 한도(칸당·전체)를 넘는 예시가 없음', serverLimits.field > 0 && serverLimits.total > 0 && sizes.every(([, t, m]) => t <= serverLimits.total && m <= serverLimits.field), serverLimits);
  ok('주제마다 내용이 다름: 같은 실험 과정·교사용 메모를 쓰는 예시 주제가 없음(전압-전류 예시를 모두에게 채우던 문제)', new Set(Object.values(M.SAMPLES).map((s) => s.notes)).size === 23 && new Set(Object.values(M.SAMPLES).filter((s) => !/찬성·반대 중/.test(s.procedure)).map((s) => s.procedure)).size === 15, '');
  ok("전압계·전류계 같은 전기 회로 내용은 '전류와 전압의 관계' 예시에만 있음", sampleKeys.filter((k) => /전압계|전류계/.test(JSON.stringify(M.SAMPLES[k]))).join() === '전류와 전압의 관계', sampleKeys.filter((k) => /전압계|전류계/.test(JSON.stringify(M.SAMPLES[k]))));
  ok('실험 탐구 주제 15개는 안전 유의사항, 찬반 토론 주제 8개는 토론 태도와 반론 재료를 담음', M.TOPIC_EXAMPLES.slice(0, 3).flatMap((g) => g.items).every((t) => { const s = M.sampleFor(t) || {}; return /조심|주의|않는다|않게|씻|끈다|한다/.test(s.safety || '') && !/토론/.test(s.procedure || '-'); })
    && M.TOPIC_EXAMPLES[3].items.every((t) => { const s = M.sampleFor(t) || {}; return /판정하지 않는다/.test(s.safety || '') && /(반론|쟁점) 재료/.test(s.notes || '') && /입장을 정한다/.test(s.procedure || ''); }), '');
  ok("sampleFor: 공백·대소문자가 달라도 같은 주제로 찾고, 예시가 없는 주제(교사가 만든 주제)는 null", !!M.sampleFor('  전류와   전압의 관계 ') && M.sampleFor('온도와 반응 속도').notes.includes('발포') === false && M.sampleFor('우리 학교 운동장 토양 조사') === null && M.sampleFor('') === null && M.sampleFor(undefined) === null, '');
  ok("sampleFor 의 kind: 실험 주제는 'experiment', 찬반 토론 주제는 'debate'(안내 문구가 갈림)", M.TOPIC_EXAMPLES.slice(0, 3).flatMap((g) => g.items).every((t) => M.sampleFor(t).kind === 'experiment') && M.TOPIC_EXAMPLES[3].items.every((t) => M.sampleFor(t).kind === 'debate'), '');
  const one = M.sampleFor('온도와 반응 속도'); one.procedure = '바꿈';
  ok('sampleFor 는 복사본을 돌려줌(화면에서 고쳐도 원본 예시가 안 바뀜)', M.sampleFor('온도와 반응 속도').procedure !== '바꿈', '');
  ok('예시 파일은 화면·저장소·네트워크를 쓰지 않는 순수 데이터', !/\bdocument\b|localStorage|sessionStorage|fetch\(|XMLHttpRequest|eval\(|new Function/.test(matSrc.replace(/\/\*[\s\S]*?\*\//, '')), '');

  const idxHtml = pages['public/index.html'];
  const idxScript2 = [...idxHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  ok('콘솔이 예시 파일을 내 폴더에서, 인라인 스크립트보다 먼저 불러옴', /<script src="js\/material-samples\.js"><\/script>/.test(idxHtml) && idxHtml.indexOf('js/material-samples.js') < idxHtml.search(/<script>\r?\n/), '');
  ok('예시 채우기: 선택한 주제의 예시(sampleFor)만 채우고, 예시 없는 주제는 아무것도 채우지 않고 안내만 함', /ArguMaterials\.sampleFor\(matSel\)/.test(idxScript2) && /if \(!sample\) \{[\s\S]*?return; \}/.test(idxScript2) && /\$\(id\)\.value = sample\[k\]/.test(idxScript2) && !/MAT_SAMPLE/.test(idxScript2), '');
  ok('주제 예시 드롭박스도 같은 파일(ArguMaterials.TOPIC_EXAMPLES)에서 가져옴(목록이 둘로 갈라지지 않음)', /const TOPIC_EXAMPLES = ArguMaterials\.TOPIC_EXAMPLES;/.test(idxScript2), '');
  ok("완료 안내에 '전류와 전압의 관계' 이름이 박혀 있지 않고 고른 주제 이름을 보여 줌", !/'전류와 전압의 관계' 예시를 채웠어요/.test(idxScript2) && /\$\{matSel\}' 예시를 채웠어요/.test(idxScript2) && /sample\.kind === 'debate'/.test(idxScript2), '');
}

// ───────── 11) 기타 ─────────
const pkg = JSON.parse(read('package.json'));
ok('package.json 에 npm test 가 있음', /node tests\/gas_logic\.test\.js/.test((pkg.scripts || {}).test || '') && /frontend_static/.test((pkg.scripts || {}).test || ''), pkg.scripts);
ok('npm test 에 새 시험(gas_chat_overview·pick_logic)이 들어 있음', /gas_chat_overview\.test\.js/.test((pkg.scripts || {}).test || '') && /pick_logic\.test\.js/.test((pkg.scripts || {}).test || ''), pkg.scripts.test);

asyncChecks.then(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
