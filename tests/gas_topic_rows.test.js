// 주제 목록 ↔ '주제 세부설정' 탭 연동: 주제 목록(기본설정 B13)에 주제를 저장하면 그 주제의 줄이 '주제 세부설정' 탭에도 생기는지,
// 줄을 지우거나 덮어쓰지 않는지, 학생 화면 경로는 시트를 건드리지 않는지, 실패해도 목록 저장은 성공으로 남는지 시험한다.
//   node tests/gas_topic_rows.test.js
const { makeEnv } = require('./gas_harness.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { (cond ? pass++ : fail++); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  → ' + JSON.stringify(extra).slice(0, 500))); };

const PIN = 'teacher-pass-1', CODE = 'K7M2QX', T = '주제 세부설정';
const A = '전류와 전압의 관계', B = '온도와 반응 속도', C = '원자력 발전은 앞으로 늘려야 한다';
const dataRows = (e) => e.sheets[T].rows.slice(1);
const names = (e) => dataRows(e).map((r) => r[0]);
const rowOf = (e, topic) => e.sheets[T].rows.find((r, i) => i > 0 && r[0] === topic);
const isBlank = (r) => !!r && [1, 2, 3, 4].every((i) => r[i] === '' || r[i] === undefined);
const fresh = (list, opts) => {
  const e = makeEnv(Object.assign({ pin: PIN, accessCode: CODE }, opts || {}));
  e.sheets['기본설정'].rows[3][1] = list === undefined ? '' : list;
  e.ctx.ensureProfileTabs_();
  return e;
};
const save = (e, s) => e.ctx.routeAction('saveTeacherSettings', Object.assign({ pin: PIN }, s));
const snapshot = (e) => JSON.stringify([Object.keys(e.sheets), Object.values(e.sheets).map((s) => s.rows), [...e.props.entries()]]);

// ───────── 1) 콘솔에서 주제 목록을 저장하면 주제 세부설정 탭에 줄이 생김 ─────────
{
  const e = fresh('');
  ok('(준비) 처음에는 (기본) 줄만 있음', names(e).join() === '(기본)', names(e));
  const r = save(e, { topicList: `${A}, ${B}, ${C}` });
  ok('주제 목록 저장이 성공하고 추가한 줄 수를 알려 줌', r.success === true && r.topicRows && r.topicRows.added === 3 && r.topicRows.removed === 0 && !r.topicRows.error, r);
  ok('새 주제마다 한 줄씩 생기고 순서는 목록 순서(기본 줄 다음)', names(e).join('|') === ['(기본)', A, B, C].join('|'), names(e));
  ok('새 줄의 페르소나·루브릭·제한 시간·기억 쌍 칸은 빈 칸(= (기본) 줄을 따름)', [A, B, C].every((t) => isBlank(rowOf(e, t))), dataRows(e));
  ok('(기본) 줄은 건드리지 않음(기본·기본·20·3)', JSON.stringify(rowOf(e, '(기본)')) === JSON.stringify(['(기본)', '기본', '기본', 20, 3]), rowOf(e, '(기본)'));
  ok('주제 목록 칸(B13)에는 입력한 그대로 저장됨', e.sheets['기본설정'].rows[3][1] === `${A}, ${B}, ${C}`, e.sheets['기본설정'].rows[3]);
  const again = save(e, { topicList: `${A}, ${B}, ${C}` });
  ok('같은 목록을 다시 저장해도 줄이 늘거나 줄지 않음(멱등)', again.success && again.topicRows.added === 0 && again.topicRows.removed === 0 && names(e).length === 4, [again, names(e)]);
}

// ───────── 2) 이미 값이 든 줄은 덮어쓰지 않고, 중복·표기 차이도 한 줄로 ─────────
{
  const e = fresh(`${A}`);
  e.ctx.saveTopicSetting({ topic: A, timeLimitMinutes: 30, windowPairs: 5 });
  ok('(준비) A 주제에 직접 정한 값이 있음', JSON.stringify(rowOf(e, A)) === JSON.stringify([A, '', '', 30, 5]), rowOf(e, A));
  const r = save(e, { topicList: `${A}, ${B}` });
  ok('값이 든 줄은 그대로이고 새 주제 줄만 추가됨', r.topicRows.added === 1 && JSON.stringify(rowOf(e, A)) === JSON.stringify([A, '', '', 30, 5]) && isBlank(rowOf(e, B)), dataRows(e));
  const e2 = fresh('');
  const r2 = save(e2, { topicList: 'Topic One,  topic   one , TOPIC ONE, Topic Two' });
  ok('공백·대소문자만 다른 같은 이름은 한 줄(처음 쓴 표기 유지)', r2.topicRows.added === 2 && names(e2).join('|') === '(기본)|Topic One|Topic Two', names(e2));
  const e3 = fresh('');
  e3.sheets[T].rows.push(['중복 주제', '', '', 10, ''], ['중복 주제', '', '', 20, '']); // 손으로 같은 주제 줄을 둘 만든 경우
  const r3 = save(e3, { topicList: '중복 주제, 다른 주제' });
  ok('손으로 만든 중복 줄은 건드리지 않고 없는 주제만 추가함', r3.topicRows.added === 1 && r3.topicRows.removed === 0 && names(e3).filter((n) => n === '중복 주제').length === 2, names(e3));
  const e5 = fresh('');
  e5.sheets[T].rows.push(['topic   ONE', '', '', 10, '']); // 시트에 공백·대소문자만 다르게 적어 둔 줄
  const r5 = save(e5, { topicList: 'Topic One' });
  ok('시트에 공백·대소문자만 다른 표기의 줄이 이미 있으면 새 줄을 또 만들지 않음(값도 그대로)', r5.topicRows.added === 0 && names(e5).filter((n) => /topic/i.test(n)).length === 1 && rowOf(e5, 'topic   ONE')[3] === 10, names(e5));
  const e6 = fresh(`${A}`);
  save(e6, { topicList: A }); e6.ctx.saveTopicSetting({ topic: A, timeLimitMinutes: 33 });
  const rr = e6.ctx.routeAction('saveTopicSetting', { pin: PIN, topic: A, remove: true });
  e6.ctx.getProfiles(); save(e6, { topicList: A });
  ok('목록에 있는 주제를 기본 설정으로 되돌려도(remove) 줄이 남고 칸만 비워지며, 다시 맞춰도 줄이 늘지 않음', rr.success && rr.reset === true && isBlank(rowOf(e6, A)) && names(e6).filter((n) => n === A).length === 1, [rr, names(e6)]);
  const e4 = fresh('');
  save(e4, { topicList: '=SUM(1), 3-1반 탐구, @멘션, +주제' }); // (쉼표는 목록 구분자라 이름에 쓸 수 없다)
  ok('수식·날짜처럼 보이는 주제 이름도 글자 그대로 저장됨(수식으로 실행되지 않음)', ['=SUM(1)', '3-1반 탐구', '@멘션', '+주제'].every((t) => !!rowOf(e4, t)), names(e4));
}

// ───────── 3) 목록에서 뺀 주제: 빈 줄은 정리, 값이 든 줄은 보존 ─────────
{
  const e = fresh('');
  save(e, { topicList: `${A}, ${B}, ${C}` });
  e.ctx.saveTopicSetting({ topic: B, timeLimitMinutes: 40 });
  const r = save(e, { topicList: `${B}` });
  ok('목록에서 뺀 주제의 빈 줄(A·C)은 지워지고, 값이 든 줄(B)과 (기본) 줄은 남음', r.topicRows.removed === 2 && names(e).join('|') === `(기본)|${B}`, [r.topicRows, names(e)]);
  const r2 = save(e, { topicList: `${A}` });
  ok('목록에서 빠진 주제라도 값이 든 줄은 지우지 않음(연결 안 됨으로만 표시)', r2.topicRows.removed === 0 && !!rowOf(e, B) && rowOf(e, B)[3] === 40 && !!rowOf(e, A), names(e));
  const gp = e.ctx.getProfiles();
  ok('빠진 주제는 연결 화면에서 orphan 으로 보이고 목록의 주제는 정상으로 보임', gp.topics.find((t) => t.topic === B).orphan === true && gp.topics.find((t) => t.topic === A).orphan === false, gp.topics.map((t) => [t.topic, t.orphan]));
  const r3 = save(e, { topicList: '' , classList: '1반' });
  ok('목록을 비우면 모든 빈 줄이 정리되고 (기본) 줄은 남음', r3.topicRows.removed === 1 && !rowOf(e, A) && !!rowOf(e, '(기본)') && !!rowOf(e, B), names(e));
}

// ───────── 4) 목록을 보내지 않는 저장은 주제 줄을 건드리지 않음 ─────────
{
  const e = fresh(`${A}, ${B}`);
  const before = JSON.stringify(e.sheets[T].rows);
  const r = save(e, { bannedWords: '나쁜말', classList: '1반, 2반' });
  ok('금지어·학급 저장은 주제 줄을 만들지도 지우지도 않고 응답에 topicRows 도 없음', r.success && r.topicRows === undefined && JSON.stringify(e.sheets[T].rows) === before, [r, names(e)]);
}

// ───────── 5) 연결 화면(getProfiles)이 줄을 맞춤: 시트에서 목록을 직접 고친 경우 ─────────
{
  const e = fresh(`${A}`);
  e.sheets['기본설정'].rows[3][1] = `${A}, 새로 적은 주제, 또 다른 주제`; // 시트에서 B13 을 직접 편집
  ok('(준비) 시트에서만 고치면 주제 세부설정 탭에는 아직 줄이 없음', !rowOf(e, '새로 적은 주제'), names(e));
  const gp = e.ctx.getProfiles();
  ok('연결 화면을 불러오면 목록의 모든 주제 줄이 만들어짐', gp.success && ['새로 적은 주제', '또 다른 주제'].every((t) => !!rowOf(e, t)) && gp.topics.filter((t) => !t.orphan).length === 3, [names(e), gp.topics.map((t) => t.topic)]);
  ok('새 주제는 기본 설정을 따르는 값으로 해석됨(기본 페르소나·기본 루브릭·기본 시간)', (() => { const t = gp.topics.find((x) => x.topic === '새로 적은 주제'); return t.resolved.personaName === '기본' && t.resolved.rubricName === '기본' && t.resolved.timeLimitMinutes === 20 && t.resolved.windowPairs === 3; })(), gp.topics);
  ok('줄이 이미 맞는 상태에서 다시 불러와도 줄이 늘지 않음', (() => { const n = names(e).length; e.ctx.getProfiles(); return names(e).length === n; })(), names(e));
}

// ───────── 6) 학생 화면 경로는 시트를 건드리지 않음 ─────────
{
  const e = fresh(`${A}, ${B}`);
  e.sheets['기본설정'].rows[1][1] = '1반'; e.sheets['기본설정'].rows[2][1] = '1모둠';
  const before = JSON.stringify(e.sheets[T].rows);
  const init = e.ctx.routeAction('getInitialData', { accessCode: CODE });
  const chat = e.ctx.routeAction('processChatMessage', { accessCode: CODE, classValue: '1반', groupValue: '1모둠', topicValue: A, userQuestion: '질문입니다', history: [] });
  ok('학생 입장·채팅은 줄이 없는 주제도 문제없이 처리하고 주제 세부설정 탭을 바꾸지 않음', init.success && chat.success && JSON.stringify(e.sheets[T].rows) === before, [init.error, chat.error, names(e)]);
}

// ───────── 7) 줄이 생겨도 동작은 그대로: 빈 줄 = 줄 없음 ─────────
{
  const e = fresh(`${A}`);
  const noRow = e.ctx.resolveTopicConfig_(e.ctx.readCoreConfig_(true), A);
  save(e, { topicList: `${A}` });
  const blank = e.ctx.resolveTopicConfig_(e.ctx.readCoreConfig_(true), A);
  const strip = (c) => { const o = Object.assign({}, c); delete o.linked; return JSON.stringify(o); };
  ok('빈 칸 줄이 생겨도 그 주제에 적용되는 설정은 줄이 없을 때와 같음', strip(noRow) === strip(blank), [noRow, blank]);
  e.ctx.saveTopicSetting({ topic: '(기본)', timeLimitMinutes: 25, windowPairs: 4 });
  const follow = e.ctx.resolveTopicConfig_(e.ctx.readCoreConfig_(true), A);
  ok('빈 칸은 (기본) 줄의 값이 바뀌면 따라 바뀜(고정된 20이 아님)', follow.timeLimitMinutes === 25 && follow.windowPairs === 4, follow);
  e.ctx.saveTopicSetting({ topic: A, timeLimitMinutes: 50 });
  const own = e.ctx.resolveTopicConfig_(e.ctx.readCoreConfig_(true), A);
  ok('시트의 그 줄에 값을 채우면 그 값이 우선함', own.timeLimitMinutes === 50 && own.windowPairs === 4, own);
}

// ───────── 8) 캐시: 줄을 만들면 학생 화면이 쓰는 설정 캐시를 비움 ─────────
{
  const e = fresh(`${A}`);
  e.ctx.readCoreConfig_(); // 캐시를 채운다
  e.sheets['기본설정'].rows[3][1] = `${A}, ${B}`;
  const r = e.ctx.syncTopicRows_();
  const cached = e.ctx.readCoreConfig_(); // 캐시를 지웠다면 새로 읽어 B 줄이 보인다
  ok('줄을 추가하면 설정 캐시가 비워져 새 줄이 바로 읽힘', r.added === 2 && cached.topics.some((t) => t.topic === B), [r, cached.topics.map((t) => t.topic)]);
  const e2 = fresh(`${A}`); save(e2, { topicList: `${A}` });
  e2.ctx.readCoreConfig_(); const k = [...e2.cache.keys()].filter((x) => /cfg_core/.test(x));
  const r2 = e2.ctx.syncTopicRows_();
  ok('바뀐 것이 없으면 캐시를 건드리지 않음', r2.added === 0 && r2.removed === 0 && [...e2.cache.keys()].filter((x) => /cfg_core/.test(x)).length === k.length && k.length === 1, [k, [...e2.cache.keys()]]);
}

// ───────── 9) 실패해도 목록 저장은 성공 ─────────
{
  const e = makeEnv({ pin: PIN, accessCode: CODE, noProfileTabs: true, insertSheetFails: true }); // 세부설정 탭을 못 만드는 시트(보호 등)
  const r = save(e, { topicList: `${A}, ${B}` });
  ok('세부설정 탭을 만들 수 없어도 주제 목록 저장은 성공하고 이유를 알려 줌', r.success === true && e.sheets['기본설정'].rows[3][1] === `${A}, ${B}` && r.topicRows && r.topicRows.error && r.topicRows.added === 0, r);
  const gp = e.ctx.getProfiles();
  ok('그 상태에서도 연결 화면은 열리고(옛 설정으로 동작) 예외가 나지 않음', gp.success === true && gp.fallback === true, gp);
  const e2 = fresh(`${A}`);
  e2.ctx.LockService = { getScriptLock: () => ({ waitLock() { throw new Error('Lock timeout'); }, releaseLock() {} }) }; // 다른 저장이 오래 걸리는 경우
  const r2 = save(e2, { topicList: `${A}, ${B}` });
  ok('락을 못 잡아도 목록 저장은 성공하고, 줄 맞추기 실패만 알려 줌', r2.success && e2.sheets['기본설정'].rows[3][1] === `${A}, ${B}` && r2.topicRows.error && !rowOf(e2, B), r2);
  const gp2 = e2.ctx.getProfiles();
  ok('락 실패 때 연결 화면은 열리고 경고를 한 줄 보여 줌', gp2.success && gp2.warnings.some((w) => /주제 세부설정.*맞추지 못했어요/.test(w)), gp2.warnings);
  const sync = e2.ctx.syncTopicRows_();
  ok('syncTopicRows_ 는 실패해도 예외를 던지지 않고 결과로 알림', sync.success === false && typeof sync.error === 'string', sync);
}

// ───────── 10) 시트 메뉴 '🔄 주제 세부설정 맞추기' ─────────
{
  const em = makeEnv({ pin: PIN, accessCode: CODE }); em.ctx.onOpen();
  const menuItems = em.ui.menus[0].items;
  ok('시트 메뉴에 🔄 주제 세부설정 맞추기 → syncTopicRowsFromMenu 가 등록돼 있고 함수도 있음', menuItems.some((i) => i.label === '🔄 주제 세부설정 맞추기' && i.fn === 'syncTopicRowsFromMenu') && typeof em.ctx.syncTopicRowsFromMenu === 'function', menuItems);
  const e = fresh('');
  e.sheets['기본설정'].rows[3][1] = `${A}, ${B}`;
  const alerts = [];
  e.ctx.SpreadsheetApp.getUi = () => ({ ButtonSet: { OK: 'OK' }, alert: (t, m) => { alerts.push([t, String(m)]); } });
  const others = () => JSON.stringify([e.sheets['환경설정'].rows, e.sheets['기본설정'].rows, e.sheets['채팅기록'].rows, [...e.props.entries()]]);
  const before = others();
  e.ctx.syncTopicRowsFromMenu();
  ok('메뉴: 새로 만든 줄 수와 주제 이름을 알려 주고 줄이 만들어짐', alerts[0] && /새로 만든 줄 2개/.test(alerts[0][1]) && alerts[0][1].includes(A) && alerts[0][1].includes(B) && !!rowOf(e, A) && !!rowOf(e, B), alerts);
  ok('메뉴: 다른 탭·설정·비밀번호는 바꾸지 않음(주제 세부설정 탭만)', others() === before, '');
  e.ctx.syncTopicRowsFromMenu();
  ok('메뉴: 이미 맞으면 바꿀 것이 없다고 알려 줌', /이미 주제 목록과 맞아요/.test(alerts[1][1]), alerts[1]);
  e.sheets['기본설정'].rows[3][1] = `${A}`;
  e.ctx.syncTopicRowsFromMenu();
  ok('메뉴: 목록에서 빠진 빈 줄을 지웠다고 알려 줌', /빈 줄 1개를 지웠어요/.test(alerts[2][1]) && !rowOf(e, B), alerts[2]);
  const e2 = fresh(`${A}`); e2.ctx.LockService = { getScriptLock: () => ({ waitLock() { throw new Error('Lock timeout'); }, releaseLock() {} }) };
  const al2 = []; e2.ctx.SpreadsheetApp.getUi = () => ({ ButtonSet: { OK: 'OK' }, alert: (t, m) => { al2.push(String(m)); } });
  e2.ctx.syncTopicRowsFromMenu();
  ok('메뉴: 실패하면 이유를 알려 줌(예외 없이)', /맞추지 못했어요/.test(al2[0]), al2);
  const e3 = fresh(`${A}`);
  const web = ['syncTopicRows_', 'syncTopicRows', 'syncTopicRowsFromMenu', 'readTopicList_'].map((a) => e3.ctx.routeAction(a, { pin: PIN }));
  ok('웹 API 로는 줄 맞추기를 따로 부를 수 없음(목록 저장·연결 화면을 통해서만)', web.every((r) => r.success === false), web);
}

// ───────── 11) 시트 구조 점검과 초기화 ─────────
{
  const e = fresh(`${A}, ${B}`);
  const before = e.ctx.inspectSheetStructure_();
  ok('구조 점검: 줄이 없는 주제를 참고로 알리고 맞추기 메뉴를 안내함', before.items.some((i) => i.level === 'info' && /줄이 없는 주제/.test(i.text) && /주제 세부설정 맞추기/.test(i.text)), before.items.filter((i) => i.level !== 'ok'));
  const snap = snapshot(e); e.ctx.inspectSheetStructure_();
  ok('구조 점검은 여전히 읽기 전용(줄을 만들지 않음)', snapshot(e) === snap && !rowOf(e, A), names(e));
  e.ctx.syncTopicRows_();
  const after = e.ctx.inspectSheetStructure_();
  ok('줄을 맞추면 그 안내가 사라짐', !after.items.some((i) => /줄이 없는 주제/.test(i.text)), after.items.filter((i) => i.level !== 'ok'));
  e.ctx.resetSheetToDefaults_();
  ok('설정·기록 초기화 뒤에는 (기본) 줄만 남음(목록도 비워지므로)', names(e).join() === '(기본)' && e.sheets['기본설정'].rows[3][1] === '', [names(e), e.sheets['기본설정'].rows[3]]);
}

// ───────── 12) 큰 목록 ─────────
{
  const e = fresh('');
  const list = Array.from({ length: 60 }, (_, i) => '주제' + (i + 1)).join(', ');
  const t0 = Date.now(), r = save(e, { topicList: list }), ms = Date.now() - t0;
  ok('주제 60개도 한 번에 모두 줄이 만들어지고 순서·개수가 맞음', r.topicRows.added === 60 && names(e).length === 61 && names(e)[1] === '주제1' && names(e)[60] === '주제60' && ms < 2000, [r.topicRows, names(e).length, ms]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
