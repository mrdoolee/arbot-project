// 시트 초기화(resetSheetToDefaults_ / 시트 메뉴) 시험. 실제 Code.js 를 메모리 가짜 시트로 실행한다. 사용: node tests/gas_reset.test.js
const { makeEnv } = require('./gas_harness.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { (cond ? pass++ : fail++); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  → ' + JSON.stringify(extra).slice(0, 400))); };
const P = '페르소나 세부설정', R = '루브릭 세부설정', T = '주제 세부설정';
const T1 = '전류와 전압의 관계', T2 = '온도와 반응 속도';
const chat = (env, over) => env.ctx.processChatMessage(Object.assign({ classValue: '1반', groupValue: '1모둠', topicValue: T1, userQuestion: '전압계는 어디에 연결해요?', history: [] }, over || {}));

// 한참 쓴 시트를 흉내 낸다: 직접 만든 페르소나·루브릭·주제 연결, 탐구 자료, 대화 기록, 추가 API 키, 교사 비밀번호, 옛 대시보드 탭
function usedSheet() {
  const env = makeEnv({ templateKey: 'cer' });
  env.sheets['기본설정'].rows[12][1] = `${T1}, ${T2}`;
  env.sheets['환경설정'].rows[1][1] = 'PDF-FOLDER'; env.sheets['환경설정'].rows[2][1] = 'BACKUP-SHEET-ID'; env.sheets['환경설정'].rows[4][1] = 'gemini-flash-latest';
  env.ctx.ensureProfileTabs_();
  env.ctx.saveProfile({ kind: 'persona', name: '내 CER', values: { templateKey: 'cer', role: 'MY-ROLE' } });
  env.ctx.saveProfile({ kind: 'rubric', name: '내 루브릭', values: { role: 'r', criteria: 'MY-CRITERIA' } });
  env.ctx.saveTopicSetting({ topic: T1, persona: '내 CER', rubric: '내 루브릭', timeLimitMinutes: 7 });
  env.ctx.saveTopicMaterial({ topic: T1, procedure: '직렬 연결' }); env.ctx.saveTopicMaterial({ topic: T2, procedure: '온도 변화' });
  chat(env); chat(env, { topicValue: T2 }); chat(env, { userQuestion: '이 바보야' });
  env.ctx.saveApiKeys({ keys: [{ label: '학교', key: 'AIzaSecondKey1234567890' }] });
  env.ctx.setTeacherPin_({ newPin: 'secret-123' });
  const dash = env.ss.insertSheet('대시보드'); dash.rows.push(['옛 분석 결과']);
  return env;
}
const snap = (env, names) => JSON.stringify(names.map((n) => env.sheets[n] && env.sheets[n].rows));

let env = usedSheet();
ok('초기화 전: 대화·자료·옛 탭·직접 만든 설정이 있음', env.sheets['채팅기록'].rows.length > 3 && env.sheets['탐구자료'].rows.length === 3 && !!env.sheets['논증평가설정'] && !!env.sheets['대시보드'] && env.sheets[P].rows.some((r) => r[0] === '내 CER'), '');
chat(env); // 설정 캐시를 데운다 (초기화 뒤 옛 설정이 캐시에서 나오면 안 됨)
const keep = snap(env, ['환경설정', 'API키']);
const pinBefore = env.props.get('TEACHER_PIN_HASH');
const rep = env.ctx.resetSheetToDefaults_();

// ── 지운 것 ──
ok('보고: 지운 대화·자료 수와 삭제한 옛 탭', rep.chatRows >= 3 && rep.materialRows === 2 && rep.deletedTabs.includes('논증평가설정') && rep.deletedTabs.includes('대시보드'), rep);
ok('채팅기록은 머리글만 남음(페르소나·루브릭 열 이름 포함)', env.sheets['채팅기록'].rows.length === 1 && env.sheets['채팅기록'].rows[0][7] === '페르소나' && env.sheets['채팅기록'].rows[0][8] === '루브릭', env.sheets['채팅기록'].rows);
ok('탐구자료는 머리글만 남음', env.sheets['탐구자료'].rows.length === 1 && env.sheets['탐구자료'].rows[0][0] === '주제', env.sheets['탐구자료'].rows);
ok("옛 '논증평가설정'·'대시보드' 탭 삭제", !env.sheets['논증평가설정'] && !env.sheets['대시보드'], Object.keys(env.sheets));
const cfg = env.sheets['기본설정'].rows;
ok('금지어·학급·모둠·주제 목록이 비어 있음', [9, 10, 11, 12].every((i) => cfg[i][1] === ''), cfg.slice(9, 13));
ok('쓰이지 않는 옛 칸(1~9행·14~17행, A~C열)이 비어 있음', [0, 1, 2, 3, 4, 5, 6, 7, 8, 13, 14, 15, 16].every((i) => cfg[i].slice(0, 3).every((v) => v === '')), cfg.slice(0, 6));
ok('쓰이지 않는 File API 칸(7·8행)도 비워짐', cfg[6].slice(0, 3).every((v) => v === '') && cfg[7].slice(0, 3).every((v) => v === ''), [cfg[6], cfg[7]]);

// ── 새 기본 상태 ──
const TP = env.ctx.TEMPLATE_PROFILES_, soc = TP.find((t) => t.key === 'socratic');
ok('페르소나 탭: 머리글 + 기본 줄 + 템플릿 5종, 직접 만든 줄은 없음', env.sheets[P].rows.length === 7 && env.sheets[P].rows[1][0] === '기본' && !env.sheets[P].rows.some((r) => r[0] === '내 CER'), env.sheets[P].rows.map((r) => r[0]));
ok('기본 페르소나 = 소크라테스 발문형 내용(템플릿 표시는 없음)', env.sheets[P].rows[1][1] === 'socratic' && env.sheets[P].rows[1][2] === soc.persona.role && env.sheets[P].rows[1][3] === soc.persona.action && env.sheets[P].rows[1][9] === soc.persona.greeting && !env.sheets[P].rows[1][10], env.sheets[P].rows[1].map((v) => String(v).slice(0, 20)));
ok('루브릭 탭: 머리글 + 기본 줄(소크라테스 루브릭) + 템플릿 4종', env.sheets[R].rows.length === 6 && env.sheets[R].rows[1][0] === '기본' && env.sheets[R].rows[1][3] === soc.rubric.criteria && !env.sheets[R].rows.some((r) => r[0] === '내 루브릭'), env.sheets[R].rows.map((r) => r[0]));
ok("주제 탭: '(기본)' 줄 하나(제한 시간 20, 기억 쌍 3), 주제 연결 없음", env.sheets[T].rows.length === 2 && env.sheets[T].rows[1][0] === '(기본)' && env.sheets[T].rows[1][3] === 20 && env.sheets[T].rows[1][4] === 3, env.sheets[T].rows);
ok('템플릿 줄은 보호 표시(구분)가 붙어 있음', env.sheets[P].rows.slice(2).every((r) => r[10] === '템플릿') && env.sheets[R].rows.slice(2).every((r) => r[6] === '템플릿'), '');

// ── 건드리지 않은 것 ──
ok('환경설정(키·모델·폴더·백업 시트 ID)과 API키 탭은 그대로', snap(env, ['환경설정', 'API키']) === keep, '');
ok('교사 비밀번호는 그대로', env.props.get('TEACHER_PIN_HASH') === pinBefore && !!pinBefore, '');
ok('초기화 뒤에도 비밀번호가 필요함', env.ctx.routeAction('getProfiles', {}).needPin === true && env.ctx.routeAction('getProfiles', { pin: 'secret-123' }).success === true, '');

// ── 초기화 뒤 동작 ──
const core = env.ctx.readCoreConfig_();
ok('옛 설정이 캐시에서 나오지 않음', core.personas.length === 6 && !core.personas.some((p) => p.name === '내 CER') && core.topics.length === 1, core.personas.map((p) => p.name));
const init = env.ctx.getInitialData();
ok('학생 화면 데이터: 목록은 비고 설정은 소크라테스 기본', init.classList.length === 0 && init.topicList.length === 0 && Object.keys(init.topicConfigs).length === 0 && init.character.templateKey === 'socratic' && init.timeLimitMinutes === 20 && init.settingsFallback === false, init);
env.calls.length = 0;
const r = chat(env);
ok('초기화 뒤 채팅이 소크라테스 기본 페르소나로 동작하고 기록됨', r.success && env.calls[0].systemInstruction.parts[0].text.includes('[역할]\n' + soc.persona.role) && env.sheets['채팅기록'].rows.length === 2 && env.sheets['채팅기록'].rows[1][7] === '기본' && env.sheets['채팅기록'].rows[1][8] === '기본', env.sheets['채팅기록'].rows);
ok('옛 탭이 없어도 설정 조회·저장이 동작함', env.ctx.getTeacherSettings().role === soc.persona.role && env.ctx.saveTeacherSettings({ geminiApiKey: 'AIzaFAKEKEY1234567890', classList: '1반, 2반' }).success && env.ctx.getInitialData().classList.length === 2, '');
env.ctx.saveTeacherSettings({ bannedWords: '바보' });
ok('금지어를 다시 정하면 이전 경고 횟수는 0부터(첫 경고가 1차 경고)', chat(env, { userQuestion: '이 바보야' }).aiReply.includes('[1차 경고]'), '');
ok('초기화 뒤 학생 선택 주제의 템플릿 첫 인사말이 소크라테스 기본', env.ctx.getInitialData().character.greeting === soc.persona.greeting, '');

// ── 안전장치: 웹으로는 호출할 수 없다 ──
ok('웹 API 로는 초기화할 수 없음(어떤 이름으로도 라우팅되지 않음)', ['resetSheetToDefaults_', 'resetSheetToDefaults', 'resetSheetToDefaultsFromMenu', 'reset'].every((a) => env.ctx.routeAction(a, { pin: 'secret-123' }).success === false && /알 수 없는 action/.test(env.ctx.routeAction(a, { pin: 'secret-123' }).error)), '');
ok('교사 전용 목록에도 초기화가 없음', !env.ctx.TEACHER_ACTIONS_.some((a) => /reset(Sheet|Default)/i.test(a)), '');

// ── 시트 메뉴: 두 번 확인해야만 실행 ──
function fakeUi(env, answers) {
  const log = [];
  const ui = {
    ButtonSet: { YES_NO: 'YES_NO', OK: 'OK', OK_CANCEL: 'OK_CANCEL' }, Button: { YES: 'YES', NO: 'NO', OK: 'OK', CANCEL: 'CANCEL' },
    alert: (title, msg) => { log.push(['alert', title]); return title.startsWith('⚠️') ? answers.first : 'OK'; },
    prompt: () => { log.push(['prompt']); return { getSelectedButton: () => answers.button || 'OK', getResponseText: () => answers.text || '' }; },
  };
  env.ctx.SpreadsheetApp.getUi = () => ui;
  return log;
}
const menuRows = (e) => e.sheets['채팅기록'].rows.length;
env = usedSheet();
const before = menuRows(env);
let log = fakeUi(env, { first: 'NO' });
env.ctx.resetSheetToDefaultsFromMenu();
ok("첫 확인에서 '아니오'면 아무것도 지우지 않고 두 번째 질문도 하지 않음", menuRows(env) === before && !log.some((l) => l[0] === 'prompt') && !!env.sheets['대시보드'], log);
log = fakeUi(env, { first: 'YES', text: '초기 화' });
env.ctx.resetSheetToDefaultsFromMenu();
ok("'초기화'를 정확히 입력하지 않으면 지우지 않음", menuRows(env) === before && !!env.sheets['대시보드'] && log.some((l) => l[1] === '취소했어요'), log);
log = fakeUi(env, { first: 'YES', text: '초기화', button: 'CANCEL' });
env.ctx.resetSheetToDefaultsFromMenu();
ok('입력 창에서 취소를 누르면 지우지 않음', menuRows(env) === before && !!env.sheets['대시보드'], log);
log = fakeUi(env, { first: 'YES', text: ' 초기화 ' });
env.ctx.resetSheetToDefaultsFromMenu();
ok("'예' + '초기화' 입력이면 초기화하고 결과를 알림", menuRows(env) === 1 && !env.sheets['대시보드'] && log.some((l) => l[1] === '초기화 완료'), log);

// ── 일부 탭이 이미 없어도 멈추지 않는다 / 두 번 해도 같은 상태 ──
env = makeEnv({ templateKey: 'socratic' });
delete env.sheets['채팅기록'];
let threw = null; try { env.ctx.resetSheetToDefaults_(); } catch (e) { threw = e.message; }
ok('채팅기록·탐구자료·옛 탭이 없는 시트에서도 오류 없이 초기화', threw === null && env.sheets[P].rows.length === 7, threw);
const once = snap(env, [P, R, T, '기본설정']);
env.ctx.resetSheetToDefaults_();
ok('두 번 실행해도 같은 상태(멱등)', snap(env, [P, R, T, '기본설정']) === once, '');

// ── 세부설정 탭이 없는 새 시트: 옛 칸(기본설정 1~17행·논증평가설정)이 남아 있어도 읽지 않고 기본 템플릿 내용으로 만든다 ──
env = makeEnv({ templateKey: 'socratic', noProfileTabs: true });
env.ctx.ensureProfileTabs_();
ok('기본 줄은 옛 칸이 아니라 소크라테스 템플릿 내용(옛 칸 값은 쓰이지 않음)', env.sheets[P].rows[1][2] === soc.persona.role && env.sheets[R].rows[1][3] === soc.rubric.criteria && env.sheets[P].rows[1][2] !== 'role-text', env.sheets[P].rows[1].map((v) => String(v).slice(0, 12)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
