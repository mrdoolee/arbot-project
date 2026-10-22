// 보안 규칙 시험: 교사 비밀번호 필수, 수업 입장 코드, 학생 입구 검증·횟수 제한, API 키 가리기·헤더 전송, AI 차단 쿨다운.
// 실제 gas-source/Code.js 를 메모리 가짜(시트·캐시·Gemini)로 실행한다. 사용: node tests/gas_security.test.js
const fs = require('fs');
const path = require('path');
const { makeEnv } = require('./gas_harness.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { (cond ? pass++ : fail++); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  → ' + JSON.stringify(extra))); };

const PIN = 'teacher-pass-1', CODE = 'K7M2QX', PRIMARY = 'AIzaFAKEKEY1234567890', SECOND = 'AIzaSecondKey1234567890', THIRD = 'AIzaThirdKey123456789012';
const T1 = '전류와 전압의 관계';
const CODE_PROP = 'STUDENT_ACCESS_CODE';
const route = (env, a, p) => env.ctx.routeAction(a, p);
const teacher = (env, a, p) => route(env, a, Object.assign({ pin: PIN }, p || {}));
const req = (over) => Object.assign({ classValue: '1반', groupValue: '1모둠', topicValue: T1, userQuestion: '전압계는 어디에 연결해요?', history: [], accessCode: CODE }, over || {});
const chat = (env, over) => route(env, 'processChatMessage', req(over));
const newEnv = (opts) => makeEnv(Object.assign({ pin: PIN, accessCode: CODE }, opts || {}));
const logRows = (env) => env.sheets['채팅기록'].rows.length;
// 시계를 고정한다 (횟수 제한·쿨다운 시험이 실제 시각에 흔들리지 않게)
function setNow(env, iso) {
  const FIXED = new Date(iso).getTime();
  env.ctx.Date = class extends Date { constructor(...a) { if (a.length) super(...a); else super(FIXED); } static now() { return FIXED; } };
}
function fakeUi(env, answers) {
  const log = []; let i = 0;
  const ui = {
    ButtonSet: { OK: 'OK', OK_CANCEL: 'OK_CANCEL' }, Button: { OK: 'OK', CANCEL: 'CANCEL' },
    alert: (title, msg) => { log.push({ kind: 'alert', title, msg: String(msg || '') }); return 'OK'; },
    prompt: () => { const a = answers[i++] || { button: 'CANCEL', text: '' }; log.push({ kind: 'prompt' }); return { getSelectedButton: () => a.button || 'OK', getResponseText: () => a.text || '' }; },
  };
  env.ctx.SpreadsheetApp.getUi = () => ui;
  return log;
}

// ───────────────────────── 1) 교사 비밀번호는 필수 ─────────────────────────
let env = makeEnv({});
const TA = env.ctx.TEACHER_ACTIONS_;
const notClosed = TA.filter((a) => { const r = route(env, a, {}); return !(r.success === false && r.needSetup === true && !r.needPin); });
ok('비밀번호가 없으면 모든 교사 전용 action 이 거부됨(needSetup)', notClosed.length === 0, notClosed);
ok('거부 안내에 시트 메뉴 이름이 들어 있음', /교사 비밀번호 설정/.test(route(env, 'getTeacherSettings', {}).error), route(env, 'getTeacherSettings', {}));
ok('웹으로는 최초 비밀번호를 정할 수 없음(시트 메뉴에서만)', route(env, 'setTeacherPin', { newPin: 'abcdefgh12' }).needSetup === true && !env.ctx.isTeacherPinSet_(), '');
ok('비밀번호가 없으면 코드 조회·설정도 거부되고 코드가 만들어지지 않음', route(env, 'getAccessCode', {}).needSetup === true && route(env, 'setAccessCode', { code: 'ABCDEF' }).needSetup === true && !env.props.get(CODE_PROP), '');
let tc = route(env, 'testConnection', {});
ok('testConnection: needSetup 을 알리고 시트 이름·주소는 숨김', tc.needSetup === true && tc.pinSet === false && tc.authorized === false && !tc.sheetName && !tc.sheetUrl, tc);

// 시트 메뉴로 설정
let log = fakeUi(env, [{ text: '1234567' }]);
env.ctx.setTeacherPinFromMenu();
ok('메뉴: 7자 비밀번호는 거부(최소 8자)', !env.ctx.isTeacherPinSet_() && log.some((l) => l.kind === 'alert' && l.title === '다시 정해 주세요'), log);
log = fakeUi(env, [{ text: 'long-enough-1' }, { text: 'long-enough-2' }]);
env.ctx.setTeacherPinFromMenu();
ok('메뉴: 두 번 입력이 다르면 설정하지 않음', !env.ctx.isTeacherPinSet_(), log);
log = fakeUi(env, [{ button: 'CANCEL', text: 'long-enough-1' }]);
env.ctx.setTeacherPinFromMenu();
ok('메뉴: 취소하면 설정하지 않음', !env.ctx.isTeacherPinSet_() && log.length === 1, log);
log = fakeUi(env, [{ text: PIN }, { text: PIN }]);
env.ctx.setTeacherPinFromMenu();
const done = log.filter((l) => l.kind === 'alert').pop() || {};
ok('메뉴: 설정하면 비밀번호가 정해지고 수업 입장 코드도 함께 만들어짐', env.ctx.isTeacherPinSet_() && /^[A-Z0-9]{6}$/.test(env.props.get(CODE_PROP) || ''), [env.ctx.isTeacherPinSet_(), env.props.get(CODE_PROP)]);
ok('메뉴: 완료 안내에는 코드가 보이지만 비밀번호는 보이지 않음', done.msg.includes(env.props.get(CODE_PROP)) && !done.msg.includes(PIN), done.msg);
ok('비밀번호는 원문이 아니라 해시+솔트로만 저장됨', env.props.get('TEACHER_PIN_HASH') && !JSON.stringify([...env.props]).includes(PIN), [...env.props.keys()]);

// 비밀번호 사용
env.sleeps.length = 0;
ok('맞는 비밀번호는 허용', route(env, 'getTeacherSettings', { pin: PIN }).success === true, '');
ok('비밀번호 없이 거부(needPin)', route(env, 'getTeacherSettings', {}).needPin === true, '');
ok('틀린 비밀번호는 거부되고 800ms 지연', route(env, 'getTeacherSettings', { pin: 'wrong-pass-1' }).needPin === true && env.sleeps.includes(800), env.sleeps);
ok('비밀번호가 있으면 모든 교사 전용 action 이 pin 없이 거부됨', TA.every((a) => route(env, a, {}).needPin === true), TA.filter((a) => route(env, a, {}).needPin !== true));
ok('틀린 pin 도 모두 거부됨', TA.every((a) => route(env, a, { pin: 'nope-nope-1' }).needPin === true), '');
tc = route(env, 'testConnection', {});
ok('testConnection(비밀번호 없이): 시트 이름·주소 비공개', tc.pinSet === true && tc.authorized === false && !tc.sheetName && !tc.sheetUrl, tc);
tc = route(env, 'testConnection', { pin: PIN });
ok('testConnection(맞는 비밀번호): 시트 이름·주소 공개', tc.authorized === true && !!tc.sheetName && !!tc.sheetUrl, tc);
ok('비밀번호 변경: 현재 비밀번호 없이는 거부', route(env, 'setTeacherPin', { newPin: 'brand-new-pass-9' }).needPin === true, '');
ok('비밀번호 변경: 8자 미만은 거부', route(env, 'setTeacherPin', { pin: PIN, newPin: '1234567' }).success === false, '');
ok('비밀번호 변경: 현재 비밀번호가 맞으면 변경', route(env, 'setTeacherPin', { pin: PIN, newPin: 'brand-new-pass-9' }).success === true && route(env, 'getTeacherSettings', { pin: PIN }).needPin === true && route(env, 'getTeacherSettings', { pin: 'brand-new-pass-9' }).success === true, '');
ok('setTeacherPin_ 는 7자를 거부, 8자는 허용, 초기 비밀번호(12345678)는 새 비밀번호로 거부', env.ctx.setTeacherPin_({ newPin: '1234567' }).success === false && env.ctx.setTeacherPin_({ newPin: '12345678' }).success === false && env.ctx.setTeacherPin_({ newPin: 'abcd1234' }).success === true, '');

// ───────────────────────── 1b) 초기 비밀번호(12345678): 비밀번호가 없을 때 '새 비밀번호 정하기'만 ─────────────────────────
{
  const e = makeEnv({});
  const INIT = '12345678';
  ok('초기 비밀번호 값은 12345678', e.ctx.DEFAULT_PIN_ === INIT, e.ctx.DEFAULT_PIN_);
  const others = e.ctx.TEACHER_ACTIONS_.filter((a) => a !== 'setTeacherPin');
  const opened = others.filter((a) => { const r = route(e, a, { pin: INIT }); return !(r.success === false && r.needSetup === true); });
  ok('초기 비밀번호로는 다른 교사 기능을 하나도 열 수 없음(설정·기록·키·코드 모두 needSetup)', opened.length === 0, opened);
  const tc0 = route(e, 'testConnection', { pin: INIT });
  ok('초기 비밀번호로 testConnection 해도 authorized 아님, 시트 이름·주소 비공개', tc0.needSetup === true && tc0.authorized === false && !tc0.sheetName && !tc0.sheetUrl, tc0);
  e.sleeps.length = 0;
  const wrong = route(e, 'setTeacherPin', { pin: 'wrong-init', newPin: 'my-new-pass-1' });
  ok('틀린 초기 비밀번호는 거부되고 800ms 지연, 비밀번호는 그대로 없음', wrong.success === false && wrong.needSetup === true && /12345678/.test(wrong.error) && e.sleeps.includes(800) && !e.ctx.isTeacherPinSet_(), wrong);
  ok('초기 비밀번호를 그대로 새 비밀번호로 정할 수 없음', route(e, 'setTeacherPin', { pin: INIT, newPin: INIT }).success === false && !e.ctx.isTeacherPinSet_(), '');
  ok('초기 비밀번호로도 8자 미만은 거부', route(e, 'setTeacherPin', { pin: INIT, newPin: 'short1' }).success === false && !e.ctx.isTeacherPinSet_(), '');
  ok('초기 비밀번호 거부 안내에 초기 비밀번호와 시트 메뉴가 함께 나옴', /12345678/.test(route(e, 'getTeacherSettings', {}).error) && /교사 비밀번호 설정/.test(route(e, 'getTeacherSettings', {}).error), route(e, 'getTeacherSettings', {}).error);
  const set = route(e, 'setTeacherPin', { pin: INIT, newPin: 'my-new-pass-1' });
  ok('맞는 초기 비밀번호 + 새 비밀번호면 정해지고 수업 입장 코드도 만들어짐', set.success === true && e.ctx.isTeacherPinSet_() && /^[A-Z0-9]{6}$/.test(e.props.get(CODE_PROP) || ''), set);
  ok('새 비밀번호를 정하면 초기 비밀번호로는 아무것도 안 됨(변경도 needPin)', route(e, 'setTeacherPin', { pin: INIT, newPin: 'other-pass-22' }).needPin === true && route(e, 'getTeacherSettings', { pin: INIT }).needPin === true && route(e, 'testConnection', { pin: INIT }).authorized === false, '');
  ok('정한 새 비밀번호로는 열림', route(e, 'getTeacherSettings', { pin: 'my-new-pass-1' }).success === true && route(e, 'testConnection', { pin: 'my-new-pass-1' }).authorized === true, '');
  ok('그사이 누가 먼저 정했으면 초기 비밀번호 경로도 거부(setInitialPin_ 직접 호출)', e.ctx.setInitialPin_({ pin: INIT, newPin: 'late-comer-33' }).needPin === true && route(e, 'getTeacherSettings', { pin: 'my-new-pass-1' }).success === true, '');
  ok('비밀번호·초기 비밀번호 원문은 저장되지 않음', !JSON.stringify([...e.props]).includes('my-new-pass-1') && !JSON.stringify([...e.props]).includes(INIT), '');
}

// ───────────────────────── 1c) 시트 메뉴 '♻️ 교사 비밀번호 초기화' ─────────────────────────
{
  const e = makeEnv({ pin: PIN, accessCode: 'K7M2QX' });
  const dlg = [];
  const fakeYesNo = (answer) => { e.ctx.SpreadsheetApp.getUi = () => ({ ButtonSet: { YES_NO: 'YES_NO', OK: 'OK' }, Button: { YES: 'YES', NO: 'NO', OK: 'OK' },
    alert: (title, msg, btn) => { dlg.push({ title, msg: String(msg || ''), btn }); return btn === 'YES_NO' ? answer : 'OK'; } }); };
  e.ctx.onOpen();
  const items = (e.ui.menus[0] || { items: [] }).items.filter((i) => !i.separator);
  ok('시트 메뉴에 ♻️ 교사 비밀번호 초기화가 🔐 교사 비밀번호 설정 바로 다음에 있음', items.findIndex((i) => i.fn === 'resetTeacherPinFromMenu') === items.findIndex((i) => i.fn === 'setTeacherPinFromMenu') + 1, items.map((i) => i.label));
  ok('웹으로는 부를 수 없음(routeAction 에 없음)', /알 수 없는 action/.test(route(e, 'resetTeacherPinFromMenu', { pin: PIN }).error || '') && !e.ctx.TEACHER_ACTIONS_.includes('resetTeacherPinFromMenu'), '');
  fakeYesNo('NO');
  e.ctx.resetTeacherPinFromMenu();
  ok('아니오를 누르면 비밀번호가 그대로', e.ctx.isTeacherPinSet_() && route(e, 'getTeacherSettings', { pin: PIN }).success === true && dlg.length === 1 && /12345678/.test(dlg[0].msg), dlg);
  fakeYesNo('YES');
  e.ctx.resetTeacherPinFromMenu();
  ok('예를 누르면 비밀번호가 지워지고 교사 기능이 다시 잠김(needSetup)', !e.ctx.isTeacherPinSet_() && route(e, 'getTeacherSettings', { pin: PIN }).needSetup === true, '');
  ok('완료 안내에 초기 비밀번호가 나옴', /12345678/.test(dlg[dlg.length - 1].msg), dlg[dlg.length - 1]);
  ok('수업 입장 코드는 그대로(학생 대화는 계속)', e.props.get(CODE_PROP) === 'K7M2QX' && route(e, 'getInitialData', { accessCode: 'K7M2QX' }).success === true, '');
  ok('초기화 뒤 초기 비밀번호로는 새 비밀번호 정하기만 되고, 정하면 다시 열림', route(e, 'getTeacherSettings', { pin: '12345678' }).needSetup === true
    && route(e, 'setTeacherPin', { pin: '12345678', newPin: 'after-reset-77' }).success === true && route(e, 'getTeacherSettings', { pin: 'after-reset-77' }).success === true, '');
}

// ───────────────────────── 2) 수업 입장 코드 ─────────────────────────
env = makeEnv({ pin: PIN }); // 비밀번호만 있고 코드는 아직 없음
ok('코드가 아직 없으면 학생 입구는 닫혀 있음(코드를 만들어 주지 않음)',
  route(env, 'getInitialData', req()).needCode === true && route(env, 'processChatMessage', req()).needCode === true && !env.props.get(CODE_PROP), '');
ok('코드가 없을 때 안내 문구', /정하지 않았어요/.test(route(env, 'getInitialData', req()).error), route(env, 'getInitialData', req()));
const g1 = teacher(env, 'getAccessCode');
ok('교사가 조회하면 코드가 만들어짐(6자, 헷갈리는 글자 I·O·0·1 제외)', g1.success && /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(g1.code), g1);
ok('다시 조회해도 같은 코드', teacher(env, 'getAccessCode').code === g1.code, '');
const gen = Array.from({ length: 400 }, () => env.ctx.generateAccessCode_());
ok('생성 코드는 모두 허용 글자 6자이고 거의 겹치지 않음', gen.every((c) => /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(c)) && new Set(gen).size > 395, new Set(gen).size);
const usedChars = new Set(gen.join(''));
ok('32글자가 고르게 쓰임(치우침 점검)', usedChars.size === 32, usedChars.size);

env = newEnv();
env.sleeps.length = 0;
let r = route(env, 'getInitialData', {});
ok('코드 없이 getInitialData 거부(안내: 입력해 주세요)', r.needCode === true && /입력해 주세요/.test(r.error) && !r.data, r);
ok('코드 없이 거부할 때는 지연하지 않음', env.sleeps.length === 0, env.sleeps);
r = route(env, 'getInitialData', { accessCode: 'WRONG1' });
ok('틀린 코드 거부 + 1초 지연', r.needCode === true && /맞지 않아요/.test(r.error) && env.sleeps.includes(1000), [r, env.sleeps]);
ok('틀린 코드로는 학급·모둠·주제 목록이 내려가지 않음', !JSON.stringify(r).includes('1모둠') && !JSON.stringify(r).includes(T1), r);
r = route(env, 'processChatMessage', req({ accessCode: 'WRONG1' }));
ok('틀린 코드로는 채팅도 불가(기록·AI 호출 없음)', r.needCode === true && logRows(env) === 1 && env.calls.length === 0, [r, logRows(env), env.calls.length]);
ok('맞는 코드는 대소문자·앞뒤 공백·하이픈을 무시', [CODE, CODE.toLowerCase(), '  ' + CODE.toLowerCase() + ' ', CODE.slice(0, 3) + '-' + CODE.slice(3), CODE.slice(0, 3) + ' ' + CODE.slice(3)]
  .every((c) => route(env, 'getInitialData', { accessCode: c }).success === true), '');
r = route(env, 'getInitialData', { accessCode: CODE });
ok('getInitialData 응답에 코드·비밀번호 정보·키가 없음', !JSON.stringify(r).includes(CODE) && !JSON.stringify(r).includes('TEACHER_PIN') && !JSON.stringify(r).includes(PRIMARY) && !('role' in r.data), Object.keys(r.data));
ok('기존 응답 필드는 그대로', ['timeLimitMinutes', 'classList', 'groupList', 'topicList', 'topicConfigs', 'missingMaterialTopics', 'character'].every((k) => k in r.data), Object.keys(r.data));

// 직접 정하기·새로 만들기
ok('직접 정하기: 소문자는 대문자로 정리해 저장', teacher(env, 'setAccessCode', { code: 'science7' }).code === 'SCIENCE7' && env.props.get(CODE_PROP) === 'SCIENCE7', env.props.get(CODE_PROP));
const badCodes = ['1234', 'abc', 'AB12', '12345', 'ABCDEFGHIJKLM', 'AB CD!@#', '과학수업코드', '', '   '];
ok('너무 짧거나 긴 코드, 기호·한글 코드는 거부(4자리 숫자 포함)', badCodes.every((c) => teacher(env, 'setAccessCode', { code: c }).success === false), badCodes.filter((c) => teacher(env, 'setAccessCode', { code: c }).success !== false));
ok('거부한 뒤에도 기존 코드는 그대로', env.props.get(CODE_PROP) === 'SCIENCE7', env.props.get(CODE_PROP));
ok('경계: 6자와 12자는 허용', teacher(env, 'setAccessCode', { code: 'ABC234' }).success === true && teacher(env, 'setAccessCode', { code: 'ABCDEFGH2345' }).success === true, '');
ok('비밀번호 없이는 코드를 바꿀 수 없음', route(env, 'setAccessCode', { code: 'HACKED1' }).needPin === true && env.props.get(CODE_PROP) === 'ABCDEFGH2345', env.props.get(CODE_PROP));
const before = env.props.get(CODE_PROP);
const rg = teacher(env, 'setAccessCode', { regenerate: true });
ok('새 코드 만들기: 이전 코드는 즉시 무효, 새 코드로는 입장됨', rg.success && rg.code !== before && route(env, 'getInitialData', { accessCode: before }).needCode === true && route(env, 'getInitialData', { accessCode: rg.code }).success === true, rg);
ok('코드를 바꾸면 이미 입장한 학생의 다음 채팅도 막힘', route(env, 'processChatMessage', req({ accessCode: before })).needCode === true, '');

// 시트 초기화는 비밀번호·코드를 건드리지 않는다
env = newEnv();
const hashBefore = env.props.get('TEACHER_PIN_HASH');
env.ctx.resetSheetToDefaults_();
ok('시트 초기화는 교사 비밀번호와 수업 입장 코드를 그대로 둠', env.props.get('TEACHER_PIN_HASH') === hashBefore && env.props.get(CODE_PROP) === CODE, '');
const hasBeforeReset = JSON.stringify(env.sheets['환경설정'].rows);
ok('코드는 시트에 적히지 않음', !JSON.stringify(Object.values(env.sheets).map((s) => s.rows)).includes(CODE), '');

// ───────────────────────── 3) 학생 입구 입력 검증 ─────────────────────────
env = newEnv();
r = chat(env);
ok('정상 요청은 통과', r.success === true && r.isBlocked === false, r);
let rows0 = logRows(env), calls0 = env.calls.length;
r = chat(env, { userQuestion: '가'.repeat(1001) });
ok('1001자 질문 거부(안내: 1000자까지), 기록·AI 호출 없음', r.success === false && /1000자/.test(r.error) && logRows(env) === rows0 && env.calls.length === calls0, [r, logRows(env) - rows0, env.calls.length - calls0]);
ok('30만 자 질문도 거부되어 Gemini 로 나가지 않음', chat(env, { userQuestion: '가'.repeat(300000) }).success === false && env.calls.length === calls0, '');
ok('1000자 질문은 허용', chat(env, { userQuestion: '가'.repeat(1000) }).success === true, '');
rows0 = logRows(env); calls0 = env.calls.length;
const badQ = ['', '   ', '\n\t', 5, { a: 1 }, ['x'], null, undefined, true];
ok('빈 질문·공백·숫자·객체·배열·null 은 거부(기록·AI 호출 없음)', badQ.every((q) => chat(env, { userQuestion: q }).success === false) && logRows(env) === rows0 && env.calls.length === calls0, badQ.filter((q) => chat(env, { userQuestion: q }).success !== false));
r = route(env, 'processChatMessage', { accessCode: CODE, classValue: '1반', groupValue: '1모둠', topicValue: T1 });
ok('질문 항목이 아예 없는 요청도 알아볼 수 있는 안내로 거부(내부 오류 문구 아님)', r.success === false && !/Cannot read/.test(r.error) && /입력해 주세요/.test(r.error), r);
const badList = [{ classValue: '해킹반' }, { groupValue: '아무모둠' }, { topicValue: '목록에 없는 주제' }, { classValue: '' }, { groupValue: 5 }, { topicValue: 'x'.repeat(101) }, { classValue: '1반'.repeat(60) }];
ok('목록에 없거나 형식이 틀린 학급·모둠·주제는 거부(기록·AI 호출 없음)', badList.every((o) => chat(env, o).success === false) && logRows(env) === rows0 && env.calls.length === calls0, badList.filter((o) => chat(env, o).success !== false));
ok('목록 밖 값 거부 안내', /목록에 없어요|확인할 수 없어요/.test(chat(env, { classValue: '해킹반' }).error), chat(env, { classValue: '해킹반' }));

// 이름 정규화: 공백·대소문자가 달라도 시트에 적힌 이름으로 기록돼 경고 횟수 세기를 피할 수 없다
env = newEnv();
env.sheets['기본설정'].rows[2][1] = 'A모둠, B모둠';
chat(env, { groupValue: '  a모둠 ', classValue: ' 1반', userQuestion: '질문' });
let last = env.sheets['채팅기록'].rows.slice(-1)[0];
ok('공백·대소문자만 다른 이름은 시트에 적힌 이름으로 정리돼 기록됨', last[2] === '1반' && last[3] === 'A모둠' && last[4] === T1, last.slice(2, 5));
const variants = ['A모둠', ' A모둠', 'a모둠 ', ' A모둠 '];
const resp = variants.map((g) => chat(env, { groupValue: g, userQuestion: '이 바보야' }));
ok('이름을 변형해도 금지어 3회 차단을 피할 수 없음(1·2차 경고 뒤 3번째에 차단)', /1차 경고/.test(resp[0].aiReply) && /2차 경고/.test(resp[1].aiReply) && resp[2].isBlocked === true && resp[3].isBlocked === true, resp.map((x) => x.aiReply.slice(0, 12)));
ok('다른 모둠은 영향 없음', chat(env, { groupValue: 'B모둠', userQuestion: '질문입니다' }).isBlocked === false, '');

// 이전 대화 정리
env = newEnv();
const messy = [{ role: 'ai', text: '인사' }, null, 5, 'x', { role: 'hacker', text: 'a' }, { role: 'user', text: { x: 1 } }, { role: 'user', text: '' }, { role: 'user', text: 'U'.repeat(9000) }]
  .concat(Array.from({ length: 100 }, (_, i) => ({ role: i % 2 ? 'ai' : 'user', text: '대화 ' + i })));
const pr = req({ history: messy });
let v = env.ctx.validateChatRequest_(pr);
ok('이전 대화: 형식이 틀린 항목 제거·최근 60개만·긴 글 자르기', v === null && pr.history.length === 60 && pr.history.every((h) => (h.role === 'ai' || h.role === 'user') && typeof h.text === 'string' && h.text.length > 0 && h.text.length <= 6000), [v, pr.history.length]);
ok('이전 대화가 배열이 아니어도(문자열·객체) 통과하며 빈 목록으로 정리', [undefined, 'x', { a: 1 }, 7].every((h) => { const p = req({ history: h }); return env.ctx.validateChatRequest_(p) === null && Array.isArray(p.history) && p.history.length === 0; }), '');
ok('엉터리 이전 대화가 섞여도 채팅 성공', chat(env, { history: messy }).success === true, '');

// ───────────────────────── 4) 횟수 제한 (시계 고정) ─────────────────────────
env = newEnv();
env.sheets['기본설정'].rows[2][1] = '1모둠, 2모둠';
setNow(env, '2026-10-15T10:30:00');
const res = Array.from({ length: 22 }, (_, i) => chat(env, { userQuestion: '질문 ' + i }));
ok('한 모둠은 1분에 20번까지', res.slice(0, 20).every((x) => x.success === true) && res[20].success === false && /너무 빨라요/.test(res[20].error) && res[21].success === false, res.map((x) => x.success));
ok('제한에 걸린 요청은 기록·AI 호출을 하지 않음', logRows(env) === 1 + 20 && env.calls.length === 20, [logRows(env), env.calls.length]);
ok('다른 모둠은 영향 없음', chat(env, { groupValue: '2모둠', userQuestion: '질문' }).success === true, '');
setNow(env, '2026-10-15T10:31:05');
ok('1분이 지나면 다시 보낼 수 있음', chat(env, { userQuestion: '질문 다시' }).success === true, '');

env = newEnv();
env.sheets['기본설정'].rows[2][1] = Array.from({ length: 25 }, (_, i) => (i + 1) + '모둠').join(', ');
setNow(env, '2026-10-15T11:00:00');
const all = [];
for (let round = 0; round < 10; round++) for (let g = 1; g <= 25; g++) all.push(chat(env, { groupValue: g + '모둠', userQuestion: '질문 ' + round }));
const okCount = all.filter((x) => x.success).length, limited = all.filter((x) => !x.success && /너무 빨라요/.test(x.error)).length;
ok('전체 학생 합쳐 1분에 200번까지(API 할당량 보호)', okCount === 200 && limited === 50, [okCount, limited]);

// ───────────────────────── 5) API 키: 가리기·헤더 전송 ─────────────────────────
env = newEnv();
chat(env);
ok('Gemini 요청 주소에 키가 들어 있지 않고 헤더로만 감', env.urls.length > 0 && env.urls.every((u) => !/[?&]key=/i.test(u) && !u.includes(PRIMARY)) && env.keysUsed[0] === PRIMARY, [env.urls, env.keysUsed]);
teacher(env, 'listGeminiModels'); teacher(env, 'testGeminiModel', { model: 'gemini-flash-latest' });
ok('모델 목록·모델 시험도 헤더로 키를 보냄(주소에 키 없음)', env.urls.every((u) => !/[?&]key=/i.test(u) && !u.includes(PRIMARY)) && env.keysUsed.filter((k) => k === PRIMARY).length >= 2, [env.urls, env.keysUsed]);
const ts = teacher(env, 'getTeacherSettings');
ok('getTeacherSettings: 키 원문 대신 가린 모양, 설정 여부 표시', ts.data.geminiApiKey === env.ctx.maskKey_(PRIMARY) && ts.data.geminiApiKey.includes('••••') && ts.data.geminiApiKeySet === true && !JSON.stringify(ts).includes(PRIMARY), ts.data.geminiApiKey);
ok('가린 모양은 앞 4자·뒤 4자만', ts.data.geminiApiKey === 'AIza••••7890', ts.data.geminiApiKey);
const keyCell = () => env.sheets['환경설정'].rows[0][1];
let sv = teacher(env, 'saveTeacherSettings', { classList: '1반', geminiApiKey: ts.data.geminiApiKey });
ok('화면이 가린 값을 그대로 돌려보내도 키는 바뀌지 않음', sv.success === true && keyCell() === PRIMARY, [sv, keyCell()]);
sv = teacher(env, 'saveTeacherSettings', { classList: '1반', geminiApiKey: 'AIzaNewKey1234567890' });
ok('새 키를 보내면 저장됨', sv.success === true && keyCell() === 'AIzaNewKey1234567890', keyCell());
sv = teacher(env, 'saveTeacherSettings', { classList: '1반', geminiApiKey: 'bad key & more\nline' });
ok('형식이 잘못된 키는 거부되고 시트는 그대로', sv.success === false && keyCell() === 'AIzaNewKey1234567890', [sv, keyCell()]);
sv = teacher(env, 'saveTeacherSettings', { classList: '1반', geminiApiKey: '' });
ok('비워서 저장하면 키를 지움', sv.success === true && keyCell() === '', keyCell());
env.sheets['환경설정'].rows[0][1] = PRIMARY;
ok('백업 시트 ID: 잘못된 형식은 거부, 올바른 ID·빈 값은 허용', teacher(env, 'saveTeacherSettings', { classList: '1반', backupSheetId: 'x y;z' }).success === false
  && teacher(env, 'saveTeacherSettings', { classList: '1반', backupSheetId: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789' }).success === true
  && teacher(env, 'saveTeacherSettings', { classList: '1반', backupSheetId: '' }).success === true, env.sheets['환경설정'].rows[1]);

// 추가 키
teacher(env, 'saveApiKeys', { keys: [{ label: '학교', key: SECOND }, { label: '개인', key: THIRD }] });
const gk = teacher(env, 'getApiKeys');
const gkJson = JSON.stringify(gk);
ok('getApiKeys: 키 원문 없이 가린 모양과 식별값(id)만', gk.keys.length === 2 && !gkJson.includes(SECOND) && !gkJson.includes(THIRD) && !gkJson.includes(PRIMARY) && gk.keys.every((k) => k.key.includes('••••') && /^[0-9a-f]{32}$/.test(k.id)) && /^[0-9a-f]{32}$/.test(gk.primary.id), gk);
const extraRows = () => JSON.stringify(env.sheets['API키'].rows);
const rowsBefore = extraRows();
ok('가린 값 + id 를 그대로 다시 저장해도 키가 그대로 유지됨', teacher(env, 'saveApiKeys', { keys: gk.keys.map((k) => ({ label: k.label, key: k.key, id: k.id })) }).success === true && extraRows() === rowsBefore, extraRows());
ok('id 만 보내도(키 칸 비움) 유지됨', teacher(env, 'saveApiKeys', { keys: gk.keys.map((k) => ({ label: k.label, key: '', id: k.id })) }).success === true && extraRows() === rowsBefore, extraRows());
ok('한 줄만 남기고 저장하면 나머지는 삭제됨', teacher(env, 'saveApiKeys', { keys: [{ label: '개인', key: gk.keys[1].key, id: gk.keys[1].id }] }).success === true && teacher(env, 'getApiKeys').keys.length === 1 && extraRows().includes(THIRD) && !extraRows().includes(SECOND), extraRows());
ok('알 수 없는 id(목록이 바뀐 경우)는 오류로 알려 줌', teacher(env, 'saveApiKeys', { keys: [{ label: 'x', key: 'AIza••••9999', id: 'f'.repeat(32) }] }).success === false, '');
ok('id 없는 가린 값은 무시됨(키로 저장되지 않음)', teacher(env, 'saveApiKeys', { keys: [{ label: 'x', key: 'AIza••••9999' }] }).success === true && teacher(env, 'getApiKeys').keys.length === 0, extraRows());
teacher(env, 'saveApiKeys', { keys: [{ label: '학교', key: SECOND }] });
const secondId = teacher(env, 'getApiKeys').keys[0].id;
env.keysUsed.length = 0;
const tm = teacher(env, 'testGeminiModel', { keyId: secondId, model: 'gemini-flash-latest' });
ok('keyId 로 저장된 추가 키를 시험할 수 있음(원문을 화면이 몰라도)', tm.success === true && env.keysUsed[0] === SECOND, [tm, env.keysUsed]);
env.keysUsed.length = 0;
teacher(env, 'testGeminiModel', { apiKey: 'AIza••••7890', model: 'gemini-flash-latest' });
ok('가린 apiKey 를 보내면 기본 키로 시험', env.keysUsed[0] === PRIMARY, env.keysUsed);
env.keysUsed.length = 0;
teacher(env, 'listGeminiModels', { keyId: teacher(env, 'getApiKeys').primary.id });
ok('keyId 로 기본 키를 가리킬 수 있음', env.keysUsed.length === 0 /* 모델 목록 호출은 키 기록 대상이 아님 */ && env.urls.every((u) => !u.includes(PRIMARY)), env.urls.slice(-1));

// ───────────────────────── 6) 오류·로그에 키가 섞이지 않음 ─────────────────────────
env = newEnv({ keyHandler: () => ({ code: 400, body: { error: { message: 'Bad request: https://generativelanguage.googleapis.com/v1beta/models/x:generateContent?key=' + PRIMARY + '&alt=json' } } }) });
let e1 = chat(env);
ok('Gemini 오류 문구에 키가 섞여도 응답에서 가려짐', !JSON.stringify(e1).includes(PRIMARY), e1);
env = newEnv();
const logs = []; env.ctx.Logger.log = (m) => logs.push(String(m));
env.ctx.UrlFetchApp.fetch = () => { throw new Error('Exception: DNS error: https://generativelanguage.googleapis.com/v1beta/models/m:generateContent?key=' + PRIMARY); };
e1 = chat(env); const e2 = teacher(env, 'teacherAnalyze', { classValue: '1반', groupValue: '1모둠', topicValue: T1 }); const e3 = teacher(env, 'listGeminiModels');
ok('네트워크 예외에 키가 들어 있어도 채팅·분석·모델 목록 응답에서 가려짐', !JSON.stringify([e1, e2, e3]).includes(PRIMARY), [e1, e2, e3]);
env = newEnv(); env.ctx.Logger.log = (m) => logs.push(String(m));
teacher(env, 'saveApiKeys', { keys: [{ label: '학교', key: SECOND }] });
chat(env); teacher(env, 'getTeacherSettings'); teacher(env, 'getApiKeys');
ok('로그에 API 키가 남지 않음', !logs.join('\n').includes(PRIMARY) && !logs.join('\n').includes(SECOND), logs.slice(0, 5));

// ───────────────────────── 7) 진단 정보 비공개 ─────────────────────────
env = newEnv();
r = chat(env, { debug: true });
ok('debug:true 를 보내도 진단 정보가 돌아오지 않음', r.success === true && !('timing' in r) && !JSON.stringify(r).includes('gemini-flash') && !JSON.stringify(r).includes('기본 키'), r);

// ───────────────────────── 8) AI 차단 쿨다운 (시계 고정) ─────────────────────────
env = newEnv({ geminiReply: (b) => (b.contents[b.contents.length - 1].parts[0].text.includes('장난') ? '안 돼요 [강제차단]' : '네, 좋아요.') });
env.sheets['기본설정'].rows[2][1] = '1모둠, 2모둠';
setNow(env, '2026-10-15T10:30:00');
const b1 = chat(env, { userQuestion: '장난장난' });
ok('AI 가 [강제차단]하면 차단 응답', b1.isBlocked === true && /강제 차단/.test(b1.aiReply), b1);
let callsB = env.calls.length;
const b2 = chat(env, { userQuestion: '이제 진지하게 질문' });
ok('새로고침 후 곧바로 다시 보내도 차단 유지(AI 호출 없음)', b2.isBlocked === true && /10분 뒤/.test(b2.aiReply) && env.calls.length === callsB, [b2, env.calls.length - callsB]);
ok('차단 중에는 같은 줄이 기록으로 쌓이지 않음', logRows(env) === 2, logRows(env));
setNow(env, '2026-10-15T10:35:00');
const b3 = chat(env, { userQuestion: '이제 진지하게 질문' });
ok('5분 뒤에도 차단 유지(남은 시간 안내)', b3.isBlocked === true && /5분 뒤/.test(b3.aiReply), b3);
ok('다른 모둠은 영향 없음', chat(env, { groupValue: '2모둠', userQuestion: '진지한 질문' }).isBlocked === false, '');
setNow(env, '2026-10-15T10:40:00');
const b4 = chat(env, { userQuestion: '진지한 질문입니다' });
ok('10분이 지나면 다시 대화 가능', b4.success === true && b4.isBlocked === false && env.calls.length === callsB + 2, b4);
// 금지어 3회 차단은 그날 내내 유지 (기존 동작)
env = newEnv();
setNow(env, '2026-10-15T09:00:00');
['이 바보야 1', '이 바보야 2', '이 바보야 3'].forEach((q) => chat(env, { userQuestion: q }));
setNow(env, '2026-10-15T23:30:00');
ok('금지어 3회 차단은 그날 내내 유지', chat(env, { userQuestion: '정말 진지한 질문' }).isBlocked === true && /오늘 탐구 대화가 차단/.test(chat(env, { userQuestion: '정말 진지한 질문' }).aiReply), '');
// 다음 날에는 풀림
setNow(env, '2026-10-16T09:00:00');
ok('다음 날에는 차단이 풀림', chat(env, { userQuestion: '새로운 날의 질문' }).isBlocked === false, '');
// 실제 Google Sheets 는 날짜·시간 칸을 Date 로 돌려준다. 그 상태에서도 차단·분석이 이어져야 한다.
// (주의: 가짜 시트에 넣는 Date 는 Code.js 가 도는 실행 환경의 Date 여야 한다. 밖의 Date 는 instanceof 가 맞지 않아 시험이 헛돈다.)
const sheetsDates = (e) => {
  const D = require('vm').runInContext('Date', e.ctx);
  e.sheets['채팅기록'].rows.forEach((r, i) => {
    if (!i) return;
    if (typeof r[0] === 'string') r[0] = new D(r[0] + 'T00:00:00');
    if (typeof r[1] === 'string') { const [h, m] = r[1].split(':').map(Number); r[1] = new D(1899, 11, 30, h, m, 0); }
  });
  return D;
};
const blockOnlyJoke = (b) => (b.contents[b.contents.length - 1].parts[0].text.includes('장난') ? '안 돼요 [강제차단]' : '네, 좋아요.');
env = newEnv({ geminiReply: blockOnlyJoke });
setNow(env, '2026-10-15T14:20:00');
chat(env, { userQuestion: '장난' });
const DateOfCtx = sheetsDates(env);
ok('(시험 자체 점검) 기록의 날짜·시간 칸이 실제로 Date 로 바뀌었음', env.sheets['채팅기록'].rows[1][0] instanceof DateOfCtx && env.sheets['채팅기록'].rows[1][1] instanceof DateOfCtx, '');
callsB = env.calls.length;
const dateBlocked = chat(env, { userQuestion: '이제 진지한 질문' });
ok('날짜·시간 칸이 Date 로 읽혀도 AI 차단 쿨다운이 유지됨(새 AI 호출 없이)', dateBlocked.isBlocked === true && /10분 뒤/.test(dateBlocked.aiReply) && env.calls.length === callsB, [dateBlocked, env.calls.length - callsB]);
setNow(env, '2026-10-15T14:31:00');
ok('Date 칸이어도 10분이 지나면 풀림', chat(env, { userQuestion: '이제 진지한 질문' }).isBlocked === false, '');
env = newEnv();
setNow(env, '2026-10-15T09:00:00');
['이 바보야 1', '이 바보야 2'].forEach((q) => chat(env, { userQuestion: q }));
sheetsDates(env);
const strike3 = chat(env, { userQuestion: '이 바보야 3' });
sheetsDates(env);
ok('날짜·시간 칸이 Date 로 읽혀도 금지어 3회 차단이 이어짐', strike3.isBlocked === true && chat(env, { userQuestion: '진지한 질문' }).isBlocked === true, '');
env = newEnv();
setNow(env, '2026-10-15T09:00:00');
chat(env, { userQuestion: '첫 발화' }); chat(env, { userQuestion: '둘째 발화' });
sheetsDates(env);
const anDate = teacher(env, 'teacherAnalyze', { classValue: '1반', groupValue: '1모둠', topicValue: T1 });
ok('날짜·시간 칸이 Date 여도 분석 결과가 yyyy-MM-dd / HH:mm 로 정리됨', anDate.success && anDate.utterances.length === 2 && anDate.utterances[0].date === '2026-10-15' && /^\d\d:\d\d$/.test(anDate.utterances[0].time), anDate.success ? anDate.utterances[0] : anDate);

// ───────────────────────── 9) doGet / doPost ─────────────────────────
env = newEnv();
const gp = JSON.parse(env.ctx.doGet({ parameter: { _action: 'getTeacherSettings', pin: PIN } }).content);
ok('doGet 은 어떤 action 도 실행하지 않고 상태 한 줄만 돌려줌(주소창에 비밀번호·코드가 남지 않게)', gp.success === true && gp.service && !gp.data && !JSON.stringify(gp).includes('geminiApiKey'), gp);
const gq = JSON.parse(env.ctx.doGet({ parameter: { _action: 'getInitialData', accessCode: CODE } }).content);
ok('doGet 으로 getInitialData 를 불러도 목록이 내려가지 않음', !gq.data, gq);
const pp = JSON.parse(env.ctx.doPost({ postData: { contents: JSON.stringify({ _action: 'getInitialData', accessCode: CODE }) } }).content);
ok('doPost: 맞는 코드면 getInitialData 성공', pp.success === true && Array.isArray(pp.data.topicList), pp);
const pb = JSON.parse(env.ctx.doPost({ postData: { contents: '{깨진 JSON' } }).content);
ok('doPost: 깨진 JSON 은 안내와 함께 거부', pb.success === false && /JSON/.test(pb.error), pb);
const pn = JSON.parse(env.ctx.doPost({ postData: { contents: '"문자열"' } }).content);
ok('doPost: 객체가 아닌 본문도 거부', pn.success === false, pn);
const pu = JSON.parse(env.ctx.doPost({ postData: { contents: JSON.stringify({ _action: 'noSuchAction' }) } }).content);
ok('알 수 없는 action 은 거부', pu.success === false && /알 수 없는/.test(pu.error), pu);

// 콘솔은 모두가 공유하지만 GAS 는 시트마다 따로 배포된다 → testConnection 이 코드 버전을 알려 줘서 콘솔이 옛 GAS 를 알아보게 한다
env = newEnv();
const v1 = route(env, 'testConnection', {}), v2 = route(env, 'testConnection', { pin: PIN });
ok('testConnection 이 GAS 코드 버전(version)을 알려 줌(비밀번호 확인 전에도, 숫자 2 이상)', typeof v1.version === 'number' && v1.version >= 2 && v1.version === v2.version && v1.version === env.ctx.API_VERSION_, [v1.version, v2.version]);
ok('버전 정보 때문에 시트 이름·주소가 새지는 않음', !v1.sheetName && !v1.sheetUrl, v1);

// ───────────────────────── 10) 소스 점검 ─────────────────────────
const src = fs.readFileSync(path.join(__dirname, '..', 'gas-source', 'Code.js'), 'utf8');
const code = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'); // 주석 제외
ok('소스에 키를 주소(?key= / &key=)로 붙이는 코드가 없음', !/[?&]key="?\s*\+|\?key=" \+/.test(code) && !/generateContent\?key=/.test(code) && !/models\?pageSize=1000&key=/.test(code), '');
ok('모든 Gemini 호출이 x-goog-api-key 헤더를 씀', (code.match(/UrlFetchApp\.fetch\(/g) || []).length === (code.match(/headers: geminiHeaders_\(apiKey\)/g) || []).length, [(code.match(/UrlFetchApp\.fetch\(/g) || []).length, (code.match(/headers: geminiHeaders_\(apiKey\)/g) || []).length]);
ok('디버그 응답 코드가 남아 있지 않음', !/payload\.debug/.test(code) && !/GEMINI_TRACE_/.test(code) && !/timing:/.test(code), '');
ok('교사 전용 action 목록에 getAccessCode·setAccessCode 포함', env.ctx.TEACHER_ACTIONS_.includes('getAccessCode') && env.ctx.TEACHER_ACTIONS_.includes('setAccessCode'), env.ctx.TEACHER_ACTIONS_);
ok('학생 입구 목록은 getInitialData·processChatMessage·getSessionFeedback 셋뿐', JSON.stringify(env.ctx.STUDENT_ACTIONS_) === JSON.stringify(['getInitialData', 'processChatMessage', 'getSessionFeedback']), env.ctx.STUDENT_ACTIONS_);
ok('testConnection 만 교사 전용도 학생 입구도 아닌 공개 action(스스로 비밀번호를 확인)',
  (src.match(/case "([A-Za-z]+)":/g) || []).map((s) => s.replace(/case "|":/g, '')).filter((a) => !env.ctx.TEACHER_ACTIONS_.includes(a) && !env.ctx.STUDENT_ACTIONS_.includes(a)).join() === 'testConnection', '');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
