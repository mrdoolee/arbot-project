// 스프레드시트 구조: (1) 핵심 탭이 없을 때 알아볼 수 있는 안내가 나오는지 (2) 읽기 전용 '시트 구조 점검'이 어긋난 곳을 찾아내는지
// (3) 실제 Google Sheets 처럼 날짜·시간 칸이 Date 로 읽히는 경우를 포함해 시트가 지저분해도 멈추지 않는지.
//   node tests/gas_structure.test.js
const { makeEnv } = require('./gas_harness.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { (cond ? pass++ : fail++); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  → ' + JSON.stringify(extra))); };

const PIN = 'teacher-pass-1', CODE = 'K7M2QX', T1 = '전류와 전압의 관계';
const P = '페르소나 세부설정', R = '루브릭 세부설정', T = '주제 세부설정';
const fresh = (o) => { const e = makeEnv(Object.assign({ pin: PIN, accessCode: CODE }, o || {})); e.ctx.ensureProfileTabs_(); return e; };
const teacher = (env, a, p) => env.ctx.routeAction(a, Object.assign({ pin: PIN }, p || {}));
const req = (o) => Object.assign({ accessCode: CODE, classValue: '1반', groupValue: '1모둠', topicValue: T1, userQuestion: '질문입니다', history: [] }, o || {});
const inspect = (env) => env.ctx.inspectSheetStructure_();
const find = (r, level, re) => r.items.filter((i) => i.level === level && re.test(i.area + ' ' + i.text));
const snapshot = (env) => JSON.stringify([Object.keys(env.sheets), Object.values(env.sheets).map((s) => s.rows), [...env.props.entries()]]);

// ───────── 1) 핵심 탭이 없을 때: 내부 오류 문구 대신 안내 ─────────
const RAW = /Cannot read properties|is not a function|TypeError|ReferenceError/i;
const need = {
  '환경설정': [['학생 채팅', (e) => e.ctx.routeAction('processChatMessage', req())], ['교사 설정', (e) => teacher(e, 'getTeacherSettings')], ['API 키 목록', (e) => teacher(e, 'getApiKeys')], ['분석', (e) => teacher(e, 'teacherAnalyze', { classValue: '1반', groupValue: '1모둠', topicValue: T1 })], ['설정 저장', (e) => teacher(e, 'saveTeacherSettings', { classList: '1반' })]],
  '기본설정': [['학생 입장', (e) => e.ctx.routeAction('getInitialData', { accessCode: CODE })], ['학생 채팅', (e) => e.ctx.routeAction('processChatMessage', req())], ['교사 설정', (e) => teacher(e, 'getTeacherSettings')], ['프로필', (e) => teacher(e, 'getProfiles')], ['탐구 자료', (e) => teacher(e, 'getTopicMaterials')], ['설정 저장', (e) => teacher(e, 'saveTeacherSettings', { classList: '1반' })]],
  '채팅기록': [['학생 채팅', (e) => e.ctx.routeAction('processChatMessage', req())], ['분석', (e) => teacher(e, 'teacherAnalyze', { classValue: '1반', groupValue: '1모둠', topicValue: T1 })]],
};
for (const [tabName, actions] of Object.entries(need)) {
  const bad = [];
  for (const [label, fn] of actions) {
    const e = fresh(); delete e.sheets[tabName];
    let res; try { res = fn(e); } catch (err) { res = { success: false, error: 'THROW ' + err.message }; }
    if (res.success !== false || RAW.test(res.error || '') || !(res.error || '').includes("'" + tabName + "' 탭")) bad.push(label + ': ' + (res.error || 'success'));
  }
  ok(`'${tabName}' 탭이 없으면 ${actions.map((a) => a[0]).join('·')}이(가) 탭 이름이 든 안내로 실패함(내부 오류 문구 없음)`, bad.length === 0, bad);
}
// 없어도 되는 탭은 멈추지 않는다
for (const tabName of [P, R, T, '탐구자료', 'API키']) {
  const e = fresh(); delete e.sheets[tabName];
  const a = e.ctx.routeAction('getInitialData', { accessCode: CODE }), b = e.ctx.routeAction('processChatMessage', req());
  ok(`'${tabName}' 탭이 없어도 학생 입장·채팅은 계속됨`, a.success && b.success, [a.error, b.error]);
}
{
  const e = fresh(); delete e.sheets['채팅기록'];
  let threw = null; try { e.ctx.resetSheetToDefaults_(); } catch (err) { threw = err.message; }
  ok('시트 초기화는 채팅기록 탭이 없어도 멈추지 않음(requireSheet_ 를 쓰지 않는 곳)', threw === null, threw);
}

// ───────── 2) 구조 점검: 정상 시트 ─────────
let env = fresh();
let r = inspect(env);
ok('정상 시트: 오류·주의 없음', r.counts.error === 0 && r.counts.warn === 0, r.items.filter((i) => i.level === 'error' || i.level === 'warn'));
ok('정상 시트: 핵심 탭·API 키·목록·보안이 ok 로 보고됨', ['탭', '환경설정', '기본설정', '보안'].every((a) => r.items.some((i) => i.level === 'ok' && i.area === a)), r.items.filter((i) => i.level === 'ok').map((i) => i.area));
ok('점검 결과에 API 키 원문이 없음(가린 모양만)', !JSON.stringify(r).includes('AIzaFAKEKEY1234567890') && JSON.stringify(r).includes('AIza••••7890'), '');
ok('옛 시트처럼 채팅기록 H1·I1 머리글이 없으면 참고로만 알림', find(r, 'info', /H1·I1/).length === 1, r.items.filter((i) => i.area === '채팅기록'));

// ───────── 3) 구조 점검: 어긋난 곳을 찾아낸다 ─────────
const cases = [
  ['핵심 탭이 없음 → 오류', (e) => { delete e.sheets['채팅기록']; }, 'error', /'채팅기록' 탭이 없어요/],
  ['API 키가 비어 있음', (e) => { e.sheets['환경설정'].rows[0][1] = ''; }, 'warn', /B1.*비어 있어요/],
  ['API 키 모양이 이상함(공백 섞임)', (e) => { e.sheets['환경설정'].rows[0][1] = 'AIza bad key'; }, 'warn', /API 키 모양이 이상/],
  ['백업 시트 ID 모양이 이상함', (e) => { e.sheets['환경설정'].rows[2][1] = 'https://docs.google.com/x'; }, 'warn', /B3/],
  ['모델 이름이 모델 모양이 아님', (e) => { e.sheets['환경설정'].rows[4][1] = 'my model!'; }, 'warn', /B5/],
  ['학급 목록이 비어 있음', (e) => { e.sheets['기본설정'].rows[10][1] = ''; }, 'warn', /학급 목록.*비어/],
  ['모둠 이름이 겹침', (e) => { e.sheets['기본설정'].rows[11][1] = '1모둠, 2모둠, 1모둠'; }, 'warn', /모둠 목록에 같은 이름/],
  ['주제 이름이 100자를 넘음 → 오류', (e) => { e.sheets['기본설정'].rows[12][1] = '가'.repeat(101); }, 'error', /100자를 넘어요/],
  ["'기본' 페르소나 줄이 없음", (e) => { e.sheets[P].rows.splice(1, 1); }, 'warn', /기본.*줄이 없어요/],
  ["'기본' 페르소나의 역할이 비어 있음 → 오류", (e) => { e.sheets[P].rows[1][2] = ''; }, 'error', /역할이 비어/],
  ["'기본' 루브릭의 판정 기준이 비어 있음 → 오류", (e) => { e.sheets[R].rows[1][3] = ''; }, 'error', /판정 기준이 비어/],
  ['페르소나 이름이 겹침', (e) => { e.sheets[P].rows.push(['기본', 'socratic', 'dup']); }, 'warn', /같은 이름의 줄이 여러 개/],
  ['알 수 없는 템플릿 값', (e) => { e.sheets[P].rows[1][1] = 'weird'; }, 'warn', /템플릿 값 'weird'/],
  ['페르소나 머리글 열 순서가 바뀜', (e) => { const h = e.sheets[P].rows[0]; [h[2], h[3]] = [h[3], h[2]]; }, 'warn', /머리글이 달라요/],
  ['주제 줄이 없는 페르소나를 가리킴', (e) => { e.sheets[T].rows.push([T1, '없는 페르소나', '', '', '']); }, 'warn', /없는 페르소나/],
  ['주제 줄이 없는 루브릭을 가리킴', (e) => { e.sheets[T].rows.push([T1, '', '없는 루브릭', '', '']); }, 'warn', /없는 루브릭/],
  ['주제 목록에 없는 주제 줄', (e) => { e.sheets[T].rows.push(['목록에 없는 주제', '', '', 10, '']); }, 'warn', /주제 목록에 없어서/],
  ['제한 시간이 숫자가 아님/범위 밖', (e) => { e.sheets[T].rows.push([T1, '', '', 9999, 'abc']); }, 'warn', /제한 시간 '9999'/],
  ['탐구 도우미 주제에 탐구 자료가 없음', (e) => { e.sheets[P].rows.push(['도우미', 'qna', '역할']); e.sheets[T].rows.push([T1, '도우미', '', '', '']); }, 'warn', /탐구 자료가 없어요/],
  ['탐구자료 주제가 겹침', (e) => { e.ctx.saveTopicMaterial({ topic: T1, procedure: 'a' }); e.sheets['탐구자료'].rows.push([T1, 'b', '', '', '']); }, 'warn', /탐구자료.*같은 이름/],
  ['탐구자료가 글자 수 제한을 넘음', (e) => { e.ctx.saveTopicMaterial({ topic: T1, procedure: 'a' }); e.sheets['탐구자료'].rows[1][1] = 'x'.repeat(1600); }, 'warn', /글자 수 제한/],
  ['추가 API 키 모양이 이상함', (e) => { e.ctx.saveApiKeys({ keys: [{ label: 'x', key: 'AIzaSecondKey1234567890' }] }); e.sheets['API키'].rows[1][1] = 'bad key!'; }, 'warn', /모양이 이상한 추가 키/],
  ['채팅기록에 학급·모둠·주제가 빈 줄', (e) => { e.sheets['채팅기록'].rows.push(['2026-10-15', '10:00', '', '', '', '질문', '답']); }, 'warn', /칸이 빈 줄이 1줄/],
  ['채팅기록에 지금 목록에 없는 기록', (e) => { e.sheets['채팅기록'].rows.push(['2026-10-15', '10:00', '옛반', '1모둠', T1, '질문', '답']); }, 'info', /목록에 없는 학급·모둠·주제의 기록/],
  ['교사 비밀번호가 없음', (e) => { e.props.delete('TEACHER_PIN_HASH'); }, 'warn', /교사 비밀번호가 아직 없어요/],
  ['수업 입장 코드가 없음', (e) => { e.props.delete('STUDENT_ACCESS_CODE'); }, 'warn', /수업 입장 코드가 아직 없어요/],
];
for (const [name, mutate, level, re] of cases) {
  const e = fresh(); mutate(e);
  const res = inspect(e);
  ok('구조 점검: ' + name, find(res, level, re).length >= 1, res.items.filter((i) => i.level !== 'ok'));
}
{
  const e = makeEnv({ noProfileTabs: true, pin: PIN, accessCode: CODE }); // 세부설정 탭이 아직 없는 새 시트
  const res = inspect(e);
  ok('구조 점검: 세부설정 탭이 아직 없으면 오류가 아니라 참고(자동으로 만들어진다고 안내)', res.counts.error === 0 && find(res, 'info', /세부설정 탭.*자동으로 만들어져요/).length === 1, res.items.filter((i) => i.level !== 'ok'));
  ok('구조 점검: 세부설정 탭이 없어도 만들지 않음(읽기 전용)', !e.sheets[P] && !e.sheets[R] && !e.sheets[T], Object.keys(e.sheets));
}

// ───────── 4) 읽기 전용·웹 비공개·메뉴 ─────────
env = fresh();
env.sheets['채팅기록'].rows.push(['2026-10-15', '10:00', '옛반', '', '', '질문', '답']);
env.sheets['기본설정'].rows[11][1] = '1모둠, 1모둠';
const before = snapshot(env);
inspect(env);
ok('구조 점검은 시트·탭·Script Properties 를 하나도 바꾸지 않음', snapshot(env) === before, '');
ok('웹 API 로는 구조 점검을 부를 수 없음', env.ctx.routeAction('inspectSheetStructure', {}).success === false && env.ctx.routeAction('inspectSheetStructure_', { pin: PIN }).success === false && !env.ctx.TEACHER_ACTIONS_.some((a) => /inspect|structure/i.test(a)) && !env.ctx.STUDENT_ACTIONS_.some((a) => /inspect|structure/i.test(a)), '');
function fakeUi(e) {
  const log = [];
  const ui = { ButtonSet: { OK: 'OK' }, Button: { OK: 'OK' }, alert: (title, msg) => { log.push({ title, msg: String(msg) }); return 'OK'; } };
  e.ctx.SpreadsheetApp.getUi = () => ui;
  return log;
}
let log = fakeUi(env);
env.ctx.checkSheetStructureFromMenu();
ok('메뉴: 오류·주의·참고 개수와 각 항목을 보여 줌', /오류 0 · 주의 \d+ · 참고 \d+/.test(log[0].msg) && /같은 이름이 겹쳐/.test(log[0].msg) && /읽기 전용/.test(log[0].msg), log[0] && log[0].msg.slice(0, 200));
ok('메뉴: 알림 문구에 API 키 원문이 없음', !log[0].msg.includes('AIzaFAKEKEY1234567890'), '');
env = fresh(); env.sheets['채팅기록'].rows[0] = ['날짜', '시간', '학급', '모둠', '주제', '학생', 'AI', '페르소나', '루브릭'];
log = fakeUi(env); env.ctx.checkSheetStructureFromMenu();
ok('메뉴: 문제가 없으면 문제가 없다고 알려 줌', /문제가 발견되지 않았어요/.test(log[0].msg), log[0].msg);
env = fresh(); for (let i = 0; i < 30; i++) env.sheets['기본설정'].rows[12][1] += ', ' + T1.slice(0, 5) + i; env.sheets['주제 세부설정'].rows.push(...Array.from({ length: 30 }, (_, i) => ['orphan' + i, '', '', 5, '']));
log = fakeUi(env); env.ctx.checkSheetStructureFromMenu();
ok('메뉴: 항목이 많으면 20건만 보여 주고 나머지는 개수로 알려 줌', /외 \d+건/.test(log[0].msg), log[0].msg.slice(-120));

// ───────── 5) 실제 Google Sheets 는 날짜·시간을 Date 로 돌려준다: 그 상태에서 점검·분석이 동작 ─────────
env = fresh();
['첫 발화', '둘째 발화'].forEach((q) => env.ctx.routeAction('processChatMessage', req({ userQuestion: q })));
const D = require('vm').runInContext('Date', env.ctx); // Code.js 가 도는 실행 환경의 Date (밖의 Date 는 instanceof 가 맞지 않는다)
env.sheets['채팅기록'].rows.forEach((row, i) => { if (!i) return; row[0] = new D(row[0] + 'T00:00:00'); const [h, m] = row[1].split(':').map(Number); row[1] = new D(1899, 11, 30, h, m, 0); });
let rr; try { rr = inspect(env); } catch (e) { rr = { threw: e.message }; }
ok('날짜·시간 칸이 Date 여도 구조 점검이 동작', !rr.threw && rr.counts.error === 0, rr.threw || rr.items.filter((i) => i.level === 'error'));

// ───────── 6) 지저분한 시트에서도 멈추지 않는다 ─────────
env = fresh();
env.sheets['채팅기록'].rows.push([], ['', '', '', '', '', '', ''], ['2026-10-15']);
const a1 = env.ctx.routeAction('processChatMessage', req()), a2 = teacher(env, 'teacherAnalyze', { classValue: '1반', groupValue: '1모둠', topicValue: T1 });
ok('채팅기록에 빈 줄·짧은 줄이 섞여도 채팅·분석이 동작', a1.success && a2.success, [a1.error, a2.error]);
env = fresh();
env.sheets['기본설정'].rows[10][1] = ' 1반 , ,2반,, 1반 '; env.sheets['기본설정'].rows[11][1] = '1모둠,,'; env.sheets['기본설정'].rows[12][1] = T1 + ', ' + T1 + ' ,  ,온도와 반응 속도,';
const ini = env.ctx.routeAction('getInitialData', { accessCode: CODE });
ok('목록 칸에 빈 항목·끝 쉼표가 있어도 입장 데이터가 정상(빈 항목은 걸러짐)', ini.success && ini.data.classList.every(Boolean) && ini.data.groupList.length === 1 && ini.data.topicList.every(Boolean), ini.data);
env = fresh();
env.sheets[P].rows.splice(1, 1);
const c1 = teacher(env, 'getProfiles'), c2 = env.ctx.routeAction('getInitialData', { accessCode: CODE }), c3 = env.ctx.routeAction('processChatMessage', req());
ok("'기본' 페르소나 줄을 지워도 화면·채팅이 멈추지 않음", c1.success && c2.success && c3.success, [c1.error, c2.error, c3.error]);
env = fresh();
env.sheets[T].rows.push([T1, '없는 페르소나', '없는 루브릭', 9999, 'abc']);
const d1 = env.ctx.routeAction('processChatMessage', req()), d2 = env.ctx.routeAction('getInitialData', { accessCode: CODE });
ok('주제 줄이 엉터리여도 채팅은 계속되고 제한 시간은 1~180분으로 묶임', d1.success && d2.data.topicConfigs[T1].timeLimitMinutes === 180, [d1.error, d2.data && d2.data.topicConfigs[T1]]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
