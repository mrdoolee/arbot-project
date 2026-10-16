// 주제별 설정(페르소나·루브릭·주제 세부설정) 시험. 실제 Code.js 를 메모리 가짜 시트로 실행한다. 사용: node tests/gas_profiles.test.js
const { makeEnv } = require('./gas_harness.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { (cond ? pass++ : fail++); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  → ' + JSON.stringify(extra))); };
const P = '페르소나 세부설정', R = '루브릭 세부설정', T = '주제 세부설정';
const T1 = '전류와 전압의 관계', T2 = '온도와 반응 속도';
const chat = (env, over) => env.ctx.processChatMessage(Object.assign({ classValue: '1반', groupValue: '1모둠', topicValue: T1, userQuestion: '전압계는 어디에 연결해요?', history: [] }, over || {}));
const lastRow = (env) => env.sheets['채팅기록'].rows[env.sheets['채팅기록'].rows.length - 1];
const sysOf = (env) => env.calls[env.calls.length - 1].systemInstruction.parts[0].text;
const cerValues = { templateKey: 'cer', role: 'CER-ROLE', action: 'CER-ACTION', characterId: 'scientist', characterName: 'CER쌤', greeting: '안녕 CER {주제}' };
const cerRubric = { templateKey: 'cer', role: 'CER-RUBRIC-ROLE', criteria: 'CER-CRITERIA', level: 'Level 1: a\nLevel 3: c', guideline: 'CER-GUIDE' };

// ── 1) 옛 시트 → 처음 실행될 때 세부설정 탭이 만들어지고 옛 값이 '기본' 줄로 복사된다 ──
let env = makeEnv({ templateKey: 'socratic', noProfileTabs: true });
const SOC = env.ctx.TEMPLATE_PROFILES_.find((t) => t.key === 'socratic');
ok('처음에는 세부설정 탭이 없음(새 시트)', !env.sheets[P] && !env.sheets[R] && !env.sheets[T], Object.keys(env.sheets));
chat(env);
ok('첫 채팅이 세 탭을 만듦', !!env.sheets[P] && !!env.sheets[R] && !!env.sheets[T], Object.keys(env.sheets));
ok('페르소나 탭: 머리글 + 기본 줄이 소크라테스 발문형 기본 상태', env.sheets[P].rows[0][0] === '이름' && env.sheets[P].rows[1][0] === '기본' && env.sheets[P].rows[1][1] === 'socratic' && env.sheets[P].rows[1][2] === SOC.persona.role && env.sheets[P].rows[1][3] === SOC.persona.action
  && env.sheets[P].rows[1][7] === 'socrates' && env.sheets[P].rows[1][9] === SOC.persona.greeting && !env.sheets[P].rows[1][10], env.sheets[P].rows[1].map((v) => String(v).slice(0, 14)));
ok('루브릭 탭: 기본 줄이 소크라테스 루브릭', env.sheets[R].rows[1][0] === '기본' && env.sheets[R].rows[1][2] === SOC.rubric.role && env.sheets[R].rows[1][3] === SOC.rubric.criteria && env.sheets[R].rows[1][4] === SOC.rubric.level, env.sheets[R].rows[1].map((v) => String(v).slice(0, 14)));
ok("주제 탭: '(기본)' 줄에 제한 시간 20·기억 쌍 3", env.sheets[T].rows[1][0] === '(기본)' && env.sheets[T].rows[1][3] === 20 && env.sheets[T].rows[1][4] === 3, env.sheets[T].rows[1]);
ok('기본설정의 옛 칸과 논증평가설정은 읽지도 쓰지도 않음(내용·메모 그대로)', env.sheets['기본설정'].rows[0].length === 2 && env.sheets['기본설정'].rows[0][1] === 'role-text' && env.sheets['논증평가설정'].rows[0].length === 2 && !sysOf(env).includes('role-text'), [env.sheets['기본설정'].rows[0], sysOf(env).slice(0, 60)]);
ok('기본 프롬프트가 소크라테스 발문형 내용으로 AI 호출에 쓰임', sysOf(env).includes('[역할]\n' + SOC.persona.role) && sysOf(env).includes('[행동 지침]\n' + SOC.persona.action), sysOf(env).slice(0, 80));
chat(env); env.ctx.getInitialData();
ok('두 번째부터는 탭을 다시 만들지 않음', env.sheets[P].rows.length === 7 && env.sheets[R].rows.length === 6 && env.sheets[T].rows.length === 2, [env.sheets[P].rows.length, env.sheets[R].rows.length, env.sheets[T].rows.length]);

// ── 2) 주제별 적용: 이름으로 연결, 빈 칸은 기본을 따름, 줄 없는 주제는 기본 ──
env = makeEnv({ templateKey: 'socratic' });
ok('페르소나 저장(새로 만들기)', env.ctx.saveProfile({ kind: 'persona', name: 'CER 코치', values: cerValues }).success, '');
ok('루브릭 저장(새로 만들기)', env.ctx.saveProfile({ kind: 'rubric', name: 'CER 루브릭', values: cerRubric }).success, '');
ok('주제 연결 저장(페르소나·루브릭·제한 시간 15)', env.ctx.saveTopicSetting({ topic: T2, persona: 'CER 코치', rubric: 'CER 루브릭', timeLimitMinutes: 15 }).success, '');
chat(env, { topicValue: T2 });
let s2 = sysOf(env);
ok('연결된 주제는 그 페르소나로 AI 호출(역할 덮어쓰기)', s2.includes('[역할]\nCER-ROLE') && s2.includes('[행동 지침]\nCER-ACTION'), s2.slice(0, 120));
ok('비워 둔 칸(절대 제한)은 기본 페르소나를 따름', s2.includes('[제한 사항]\nrestrict-text') && s2.includes('[예외 대처]\nexception-text'), s2.slice(0, 300));
ok('채팅기록 H·I = 페르소나·루브릭 이름', lastRow(env)[7] === 'CER 코치' && lastRow(env)[8] === 'CER 루브릭', lastRow(env));
chat(env, { topicValue: T1 });
ok('줄이 없는 주제는 기본 페르소나', sysOf(env).includes('[역할]\nrole-text') && lastRow(env)[7] === '기본' && lastRow(env)[8] === '기본', [sysOf(env).slice(0, 60), lastRow(env)]);
ok('주제 이름은 공백·대소문자 차이를 무시하고 연결', (() => { chat(env, { topicValue: '온도와  반응   속도' }); return sysOf(env).includes('CER-ROLE'); })(), '');
// 학생 화면 초기 데이터
env.sheets['기본설정'].rows[12][1] = `${T1}, ${T2}`;
let init = env.ctx.getInitialData();
ok('학생 화면: 주제마다 캐릭터·제한 시간이 다름', init.topicConfigs[T2].character.id === 'scientist' && init.topicConfigs[T2].character.name === 'CER쌤' && init.topicConfigs[T2].timeLimitMinutes === 15
  && init.topicConfigs[T1].character.id === 'labcoat' && init.topicConfigs[T1].timeLimitMinutes === 20, init.topicConfigs);
ok('학생 화면: 템플릿 종류와 인사말이 주제별', init.topicConfigs[T2].character.templateKey === 'cer' && init.topicConfigs[T2].character.greeting === '안녕 CER {주제}', init.topicConfigs[T2].character);
ok('학생 화면: 최상위 값은 기본 설정(옛 화면 호환)', init.character.id === 'labcoat' && init.timeLimitMinutes === 20, [init.character, init.timeLimitMinutes]);
ok('학생에게 페르소나·루브릭 내용은 내려가지 않음', !JSON.stringify(init).includes('CER-ROLE') && !JSON.stringify(init).includes('role-text') && !JSON.stringify(init).includes('CER-CRITERIA'), '');

// ── 3) 탐구 도우미는 주제 단위: 도우미 주제만 자료가 필요하고 다른 주제는 평소대로 ──
env = makeEnv({ templateKey: 'socratic' });
env.sheets['기본설정'].rows[12][1] = `${T1}, ${T2}`;
env.ctx.saveProfile({ kind: 'persona', name: '내 도우미', values: { templateKey: 'qna', role: 'QNA-ROLE', action: 'QNA-ACTION' } });
env.ctx.saveTopicSetting({ topic: T1, persona: '내 도우미' });
init = env.ctx.getInitialData();
ok('도우미에 연결한 주제만 "자료 필요"', JSON.stringify(init.missingMaterialTopics) === JSON.stringify([T1]), init.missingMaterialTopics);
let threw = null; try { chat(env, { topicValue: T1 }); } catch (e) { threw = e.message; }
ok('도우미 주제는 자료가 없으면 질문을 받지 않음(기록·AI 호출 없음)', /탐구 자료를 준비하지 않았어요/.test(threw || '') && env.calls.length === 0 && env.sheets['채팅기록'].rows.length === 1, [threw, env.calls.length]);
ok('같은 시트의 다른 주제(논증 페르소나)는 자료 없이도 채팅 가능', chat(env, { topicValue: T2 }).success === true, '');
env.ctx.saveTopicMaterial({ topic: T1, procedure: '직렬 연결' });
ok('자료를 입력하면 도우미 주제도 채팅 가능', chat(env, { topicValue: T1 }).success === true && sysOf(env).includes('QNA-ROLE'), '');
ok('도우미 대화의 루브릭은 "-"(평가 안 함)', lastRow(env)[7] === '내 도우미' && lastRow(env)[8] === '-', lastRow(env));
ok('도우미 페르소나에 루브릭을 연결해도 평가 안 함으로 처리', (() => { env.ctx.saveTopicSetting({ topic: T1, rubric: '기본' }); return env.ctx.resolveTopicConfig_(env.ctx.readCoreConfig_(true), T1).rubricName === '-'; })(), '');
init = env.ctx.getInitialData();
ok('자료를 입력하면 "자료 필요"에서 빠짐', init.missingMaterialTopics.length === 0, init.missingMaterialTopics);

// ── 4) 분석: 대화마다 남은 루브릭 이름으로 어떤 대화를 어떤 루브릭으로 평가할지 가른다 ──
env = makeEnv({ templateKey: 'socratic' });
env.ctx.saveProfile({ kind: 'persona', name: 'CER 코치', values: cerValues });
env.ctx.saveProfile({ kind: 'rubric', name: 'CER 루브릭', values: cerRubric });
chat(env, { userQuestion: '기본 루브릭 대화 1' });
env.ctx.saveTopicSetting({ topic: T1, persona: 'CER 코치', rubric: 'CER 루브릭' });
chat(env, { userQuestion: 'CER 루브릭 대화 1' }); chat(env, { userQuestion: 'CER 루브릭 대화 2' });
env.sheets['채팅기록'].rows.splice(1, 0, ['2026-09-01', '09:00', '1반', '1모둠', T1, '옛 기록(루브릭 이름 없음)', '옛 AI', '', '']);
env.calls.length = 0;
let an = env.ctx.apiAnalyze('1반', '1모둠', T1, true);
ok('기본: 지금 주제의 루브릭(CER)으로 평가하고 그 루브릭 대화 + 옛 기록(이름 없음)만 포함', an.success && an.rubricName === 'CER 루브릭' && an.utterances.length === 3 && an.utterances[0].text.startsWith('옛 기록'), an.error || an.utterances.map((u) => u.text));
ok('분석 프롬프트에 CER 루브릭 내용', env.calls[0].systemInstruction.parts[0].text.includes('CER-CRITERIA') && !env.calls[0].systemInstruction.parts[0].text.includes('\ncriteria'), env.calls[0].systemInstruction.parts[0].text.slice(0, 100));
ok('다른 루브릭으로 진행한 대화는 개수만 알려 줌', JSON.stringify(an.otherRubrics) === JSON.stringify([{ name: '기본', count: 1, exists: true }]), an.otherRubrics);
ok('응답에 루브릭 이름·템플릿·최고 Level', an.templateKey === 'cer' && an.levelMax === 3, [an.templateKey, an.levelMax]);
ok('응답에 이 주제에 지금 연결된 루브릭 이름', an.currentRubricName === 'CER 루브릭', an.currentRubricName);
env.ctx.saveProfile({ kind: 'rubric', originalName: 'CER 루브릭', name: 'CER 루브릭', values: { templateKey: 'debate' } }); // 옛 시트에 남은 '권장 템플릿'이 엇갈려도
ok("분석의 템플릿 종류는 루브릭의 '권장 템플릿'이 아니라 대화를 나눈 페르소나를 따름", env.ctx.apiAnalyze('1반', '1모둠', T1, true).templateKey === 'cer', '');
env.calls.length = 0;
an = env.ctx.apiAnalyze('1반', '1모둠', T1, true, '기본');
ok('옛 루브릭을 골라 분석해도 currentRubricName 은 지금 연결된 루브릭', env.ctx.apiAnalyze('1반', '1모둠', T1, true, '기본').currentRubricName === 'CER 루브릭', '');
ok('이전 루브릭(기본)을 골라 옛 대화를 원래 루브릭으로 분석', an.success && an.rubricName === '기본' && an.utterances.length === 2 && an.utterances[1].text === '기본 루브릭 대화 1'
  && env.calls[0].systemInstruction.parts[0].text.includes('\ncriteria'), an.error || an.utterances.map((u) => u.text));
ok('이 경우 CER 대화 2건이 다른 루브릭으로 안내됨', an.otherRubrics.length === 1 && an.otherRubrics[0].name === 'CER 루브릭' && an.otherRubrics[0].count === 2, an.otherRubrics);
an = env.ctx.apiAnalyze('1반', '1모둠', T1, true, '없는 루브릭');
ok('없는 루브릭 이름을 요청하면 오류', an.success === false && /찾을 수 없어요/.test(an.error), an);
// 모든 대화가 다른 루브릭이면 안내
env.sheets['채팅기록'].rows.length = 1;
env.sheets['채팅기록'].rows.push(['2026-10-01', '10:00', '1반', '1모둠', T1, '기본 루브릭으로만 한 대화', 'AI', '기본', '기본']);
an = env.ctx.apiAnalyze('1반', '1모둠', T1, true);
ok('지금 루브릭으로 진행한 대화가 없으면 다른 루브릭을 안내', an.success === false && an.empty === true && /'기본' 1건/.test(an.error) && an.otherRubrics[0].name === '기본', an);
// 평가 제외: '-' 와 옛 'qna'
env.sheets['채팅기록'].rows.push(['2026-10-01', '10:05', '1반', '1모둠', T1, '도우미 대화', 'AI', '내 도우미', '-'], ['2026-10-01', '10:06', '1반', '1모둠', T1, '옛 qna 기록', 'AI', 'qna', '']);
an = env.ctx.apiAnalyze('1반', '1모둠', T1, true, '기본');
ok("I열 '-' 와 옛 H열 'qna' 대화는 평가에서 제외하고 개수만 셈", an.success && an.excludedQna === 2 && an.utterances.length === 1, an);
// 지금 평가하지 않는 주제(도우미)라도 예전 대화는 그때 루브릭으로 분석 가능
env.ctx.saveProfile({ kind: 'persona', name: '내 도우미', values: { templateKey: 'qna', role: 'QNA' } });
env.ctx.saveTopicSetting({ topic: T1, persona: '내 도우미' });
an = env.ctx.apiAnalyze('1반', '1모둠', T1, true);
ok('지금 도우미 주제여도 기본 분석은 가장 최근의 평가 대화 루브릭을 씀', an.success && an.rubricName === '기본' && an.utterances.length === 1, an.error || an.rubricName);
// 루브릭이 삭제된 뒤 옛 이름의 대화
env.sheets['채팅기록'].rows.push(['2026-10-02', '09:00', '1반', '1모둠', T1, '지워진 루브릭 대화', 'AI', 'X', '사라진 루브릭']);
an = env.ctx.apiAnalyze('1반', '1모둠', T1, true, '기본');
ok('없어진 루브릭 이름의 대화는 exists:false 로 안내', an.otherRubrics.some((o) => o.name === '사라진 루브릭' && o.exists === false), an.otherRubrics);

// ── 5) 저장 규칙 ──
env = makeEnv({ templateKey: 'socratic' });
const sp = (name, values, extra) => env.ctx.saveProfile(Object.assign({ kind: 'persona', name, values }, extra || {}));
ok('같은 이름 중복 거부(공백·대소문자 무시)', sp('A팀', { role: 'x' }).success && sp(' a팀 ', { role: 'y' }).success === false, '');
ok('예약어 이름 거부', ['-', '없음', 'qna', '(기본)'].every((n) => sp(n, { role: 'x' }).success === false), '');
ok('이름 비어 있으면 거부', sp('  ', { role: 'x' }).success === false, '');
ok('이름 길이 제한', sp('가'.repeat(31), { role: 'x' }).success === false, '');
ok('내용이 모두 비면 거부', sp('빈 페르소나', {}).success === false && sp('빈 페르소나2', { role: '   ', action: '' }).success === false, '');
ok('알 수 없는 템플릿 거부', sp('T팀', { role: 'x', templateKey: 'weird' }).success === false, '');
ok('캐릭터 ID 형식 검사', sp('C팀', { role: 'x', characterId: 'a b<' }).success === false, '');
ok('한 칸 길이 제한', sp('L팀', { role: 'x'.repeat(10001) }).success === false, '');
ok('기본 페르소나는 역할을 비울 수 없음', sp('기본', { role: '', action: 'a' }, { originalName: '기본' }).success === false, '');
ok('기본 페르소나 이름 바꾸기 거부', sp('다른이름', { role: 'x' }, { originalName: '기본' }).success === false, '');
ok('존재하지 않는 원래 이름 수정 거부', sp('Z', { role: 'x' }, { originalName: '없는이름' }).success === false, '');
ok('수식처럼 시작하는 글도 저장(텍스트로)', sp('수식팀', { role: '=SUM(1,2)', action: '-1 이런 글' }).success && env.sheets[P].rows[env.sheets[P].rows.length - 1][2] === '=SUM(1,2)', '');
// 이름 바꾸기는 주제 연결까지 따라감
env.ctx.saveTopicSetting({ topic: T1, persona: 'A팀' });
ok('이름 바꾸기 성공', sp('A팀 새이름', { role: 'x' }, { originalName: 'A팀' }).success, '');
ok('이름을 바꾸면 주제 연결도 같이 바뀜', env.sheets[T].rows.some((r) => r[0] === T1 && r[1] === 'A팀 새이름'), env.sheets[T].rows);
ok('바뀐 이름으로도 AI 호출에 적용', (() => { chat(env, { topicValue: T1 }); return lastRow(env)[7] === 'A팀 새이름'; })(), lastRow(env));
// 삭제 규칙
let del = env.ctx.deleteProfile({ kind: 'persona', name: 'A팀 새이름' });
ok('주제가 쓰는 페르소나는 삭제 거부 + 쓰는 주제 안내', del.success === false && del.usedBy && del.usedBy[0] === T1 && del.error.includes(T1), del);
ok('기본 페르소나 삭제 거부', env.ctx.deleteProfile({ kind: 'persona', name: '기본' }).success === false, '');
env.ctx.saveTopicSetting({ topic: T1, remove: true });
ok('연결을 끊으면 삭제 가능', env.ctx.deleteProfile({ kind: 'persona', name: 'A팀 새이름' }).success && !env.sheets[P].rows.some((r) => r[0] === 'A팀 새이름'), '');
ok('없는 이름 삭제 오류', env.ctx.deleteProfile({ kind: 'persona', name: '없음X' }).success === false && env.ctx.deleteProfile({ kind: 'weird', name: 'x' }).success === false, '');
// 루브릭 규칙
ok('기본 루브릭은 판정 기준을 비울 수 없음', env.ctx.saveProfile({ kind: 'rubric', name: '기본', originalName: '기본', values: { role: 'r', criteria: '' } }).success === false, '');
ok('기본 루브릭 삭제 거부', env.ctx.deleteProfile({ kind: 'rubric', name: '기본' }).success === false, '');
env.ctx.saveProfile({ kind: 'rubric', name: '루브릭1', values: cerRubric });
env.ctx.saveTopicSetting({ topic: T2, rubric: '루브릭1' });
ok('주제가 쓰는 루브릭 삭제 거부', env.ctx.deleteProfile({ kind: 'rubric', name: '루브릭1' }).success === false, '');
ok('루브릭 이름 바꾸기 + 연결 따라감', env.ctx.saveProfile({ kind: 'rubric', originalName: '루브릭1', name: '루브릭2', values: cerRubric }).success && env.sheets[T].rows.some((r) => r[0] === T2 && r[2] === '루브릭2'), env.sheets[T].rows);

// ── 6) 주제 연결 저장 규칙 ──
env = makeEnv({ templateKey: 'socratic' });
env.ctx.saveProfile({ kind: 'persona', name: 'P1', values: { role: 'x' } });
env.ctx.saveProfile({ kind: 'rubric', name: 'R1', values: { criteria: 'c', role: 'r' } });
const st = (o) => env.ctx.saveTopicSetting(o);
ok('없는 페르소나 연결 거부', st({ topic: T1, persona: '없는팀' }).success === false, '');
ok('없는 루브릭 연결 거부', st({ topic: T1, rubric: '없는루브릭' }).success === false, '');
ok('제한 시간 범위 검사', st({ topic: T1, timeLimitMinutes: 0 }).success === false && st({ topic: T1, timeLimitMinutes: 999 }).success === false && st({ topic: T1, timeLimitMinutes: 'abc' }).success === false, '');
ok('기억 쌍 범위 검사', st({ topic: T1, windowPairs: 21 }).success === false, '');
ok('주제 비어 있으면 거부', st({ topic: '  ', persona: 'P1' }).success === false, '');
st({ topic: T1, persona: 'P1', rubric: 'R1', timeLimitMinutes: 12, windowPairs: 5 });
let rc = env.ctx.resolveTopicConfig_(env.ctx.readCoreConfig_(true), T1);
ok('연결 저장 후 해석 결과', rc.personaName === 'P1' && rc.rubricName === 'R1' && rc.timeLimitMinutes === 12 && rc.windowPairs === 5, rc);
st({ topic: T1, timeLimitMinutes: 30 });
rc = env.ctx.resolveTopicConfig_(env.ctx.readCoreConfig_(true), T1);
ok('요청에 있는 칸만 바꿈(페르소나 유지)', rc.personaName === 'P1' && rc.timeLimitMinutes === 30 && rc.windowPairs === 5, rc);
st({ topic: T1, rubric: '없음' });
rc = env.ctx.resolveTopicConfig_(env.ctx.readCoreConfig_(true), T1);
ok("루브릭 '없음' = 평가 안 함", rc.noRubric === true && rc.rubricName === '-', rc);
st({ topic: '(기본)', timeLimitMinutes: 25, windowPairs: 4 });
rc = env.ctx.resolveTopicConfig_(env.ctx.readCoreConfig_(true), T2);
ok('(기본) 줄의 제한 시간·기억 쌍이 줄 없는 주제에 적용', rc.timeLimitMinutes === 25 && rc.windowPairs === 4, rc);
rc = env.ctx.resolveTopicConfig_(env.ctx.readCoreConfig_(true), T1);
ok('주제 줄에 값이 있으면 (기본)보다 우선, 빈 칸은 (기본)을 따름', rc.timeLimitMinutes === 30 && rc.windowPairs === 5, rc);
st({ topic: T1, windowPairs: '' });
rc = env.ctx.resolveTopicConfig_(env.ctx.readCoreConfig_(true), T1);
ok('칸을 비우면 (기본)을 따름', rc.windowPairs === 4, rc);
ok('(기본) 줄은 지울 수 없음', st({ topic: '(기본)', remove: true }).success === false, '');
ok('(기본) 줄에 페르소나·루브릭은 못 바꿈(시간·쌍만)', (() => { st({ topic: '(기본)', persona: 'P1' }); const row = env.sheets[T].rows[1]; return row[1] === '기본' && row[2] === '기본'; })(), env.sheets[T].rows[1]);
st({ topic: T1, persona: '기본', rubric: '기본', timeLimitMinutes: '', windowPairs: '' });
const blankRowOf = (topic) => { const r = env.sheets[T].rows.find((x) => x[0] === topic); return !!r && !r[1] && !r[2] && !r[3] && !r[4]; };
ok('주제 목록에 있는 주제는 모든 칸이 기본과 같아져도 줄이 남고 칸만 비워짐(시트에서 계속 고칠 수 있게)', blankRowOf(T1), env.sheets[T].rows);
ok('remove:true 로 되돌리기(목록에 있는 주제): 줄은 남고 칸만 비워짐', (() => { st({ topic: T2, persona: 'P1' }); const r = st({ topic: T2, remove: true }); return r.success && r.reset === true && blankRowOf(T2); })(), env.sheets[T].rows);
ok('되돌린 주제는 (기본)을 따름(기본 시간·쌍 적용)', (() => { const c = env.ctx.resolveTopicConfig_(env.ctx.readCoreConfig_(true), T2); return c.personaName === '기본' && c.timeLimitMinutes === 25 && c.windowPairs === 4; })(), '');
ok('주제 목록에 없는 주제는 기본과 같아지면 줄이 지워짐', (() => { st({ topic: '목록밖주제', persona: 'P1' }); const had = env.sheets[T].rows.some((r) => r[0] === '목록밖주제'); st({ topic: '목록밖주제', persona: '기본' }); return had && !env.sheets[T].rows.some((r) => r[0] === '목록밖주제'); })(), env.sheets[T].rows);
ok('주제 목록에 없는 주제는 remove:true 로 줄이 지워짐', (() => { st({ topic: '목록밖주제', persona: 'P1' }); const r = st({ topic: '목록밖주제', remove: true }); return r.success && r.removed === true && !env.sheets[T].rows.some((x) => x[0] === '목록밖주제'); })(), env.sheets[T].rows);
ok('없는 줄 remove 도 성공(멱등)', st({ topic: '없는주제', remove: true }).success, '');

// ── 7) getProfiles ──
env = makeEnv({ templateKey: 'socratic' });
env.sheets['기본설정'].rows[12][1] = `${T1}, ${T2}`;
env.ctx.saveProfile({ kind: 'persona', name: 'P1', values: { role: 'x', templateKey: 'debate' } });
env.ctx.saveTopicSetting({ topic: T1, persona: 'P1', timeLimitMinutes: 10 });
env.ctx.saveTopicSetting({ topic: '목록에 없는 주제', persona: 'P1' });
let gp = env.ctx.getProfiles();
ok('getProfiles: 페르소나·루브릭·주제 목록', gp.success && gp.personas.length === 7 && gp.rubrics.length === 5 && gp.topics.length === 3, gp);
ok('getProfiles: 쓰는 주제(usedBy)와 기본 표시', gp.personas.find((p) => p.name === 'P1').usedBy[0] === T1 && gp.personas.find((p) => p.isBase).usedBy.includes(T2), gp.personas.map((p) => [p.name, p.usedBy]));
ok('getProfiles: 해석된 값(템플릿·제한 시간) 포함', gp.topics[0].resolved.templateKey === 'debate' && gp.topics[0].resolved.timeLimitMinutes === 10 && gp.topics[1].resolved.templateKey === 'socratic', gp.topics.map((t) => t.resolved));
ok('getProfiles: 목록에 없는 주제 줄은 orphan + 경고', gp.topics[2].orphan === true && gp.warnings.some((w) => w.includes('목록에 없어서')), [gp.topics[2], gp.warnings]);
ok('getProfiles: 기본 제한 시간 값', gp.topicDefault.timeLimitMinutes === 20 && gp.topicDefault.windowPairs === 3, gp.topicDefault);
// 시트에서 직접 고치는 상황: getProfiles 가 만들어 둔 그 주제의 줄에서 페르소나·루브릭 칸을 없는 이름으로 바꾼다
const t2Row = env.sheets[T].rows.find((r) => r[0] === '온도와 반응 속도');
ok('(준비) getProfiles 가 목록의 주제 줄을 미리 만들어 둠', !!t2Row, env.sheets[T].rows);
t2Row[1] = '없는 페르소나'; t2Row[2] = '없는 루브릭';
env.cache.clear();
gp = env.ctx.getProfiles();
ok('getProfiles: 존재하지 않는 페르소나·루브릭 이름은 경고하고 기본으로 대체', gp.warnings.some((w) => w.includes('없는 페르소나')) && gp.warnings.some((w) => w.includes('없는 루브릭')) && gp.topics[1].resolved.personaName === '기본', gp.warnings);
env.sheets[P].rows.push(['p1', '', 'dup', '', '', '', '', '', '', '']);
gp = env.ctx.getProfiles();
ok('getProfiles: 이름이 겹치면 경고(위쪽 줄만 사용)', gp.warnings.some((w) => w.includes("이름 'p1'")), gp.warnings);

// ── 8) 옛 콘솔 호환 + 캐시 ──
env = makeEnv({ templateKey: 'socratic' });
let gs = env.ctx.getTeacherSettings();
ok('getTeacherSettings: 옛 이름 그대로(기본 줄에서 읽음)', gs.role === 'role-text' && gs.templateKey === 'socratic' && gs.characterId === 'labcoat' && gs.rubricCriteria === 'criteria' && gs.timeLimitMinutes === 20 && gs.windowPairs === 3 && gs.classList === '1반' && gs.bannedWords === '바보, 멍청이', gs);
env.ctx.saveTeacherSettings({ role: 'NEW-ROLE', rubricCriteria: 'NEW-CRIT', timeLimitMinutes: 33, windowPairs: 6, characterName: '새이름' });
gs = env.ctx.getTeacherSettings();
ok('saveTeacherSettings(옛 형식): 기본 줄에 저장', gs.role === 'NEW-ROLE' && gs.rubricCriteria === 'NEW-CRIT' && gs.timeLimitMinutes === 33 && gs.windowPairs === 6 && gs.characterName === '새이름' && gs.action === 'action-text', gs);
ok('옛 칸(기본설정 B1)은 그대로', env.sheets['기본설정'].rows[0][1] === 'role-text', env.sheets['기본설정'].rows[0]);
chat(env);
ok('저장하자마자 채팅에 반영(캐시 비움)', sysOf(env).includes('[역할]\nNEW-ROLE'), sysOf(env).slice(0, 60));
ok('공통 설정 저장은 기본설정 탭에 씀(금지어·목록)', env.ctx.saveTeacherSettings({ geminiApiKey: 'AIzaFAKEKEY1234567890', bannedWords: '나쁜말', topicList: 'A, B' }).success && env.sheets['기본설정'].rows[9][1] === '나쁜말' && env.sheets['기본설정'].rows[12][1] === 'A, B', '');
ok('옛 가드: 핵심 칸이 모두 비면 저장 거부', env.ctx.saveTeacherSettings({ role: '', classList: '', geminiApiKey: '', rubricCriteria: '' }).success === false, '');
// 캐시: 시트를 직접 고쳐도 캐시가 살아 있는 동안은 이전 값(5분), 저장 API는 즉시 반영
env = makeEnv({ templateKey: 'socratic' });
chat(env);
const fetchesBefore = env.calls.length;
env.sheets[P].rows[1][2] = 'HAND-EDITED';
chat(env);
ok('시트 직접 수정은 캐시(5분) 때문에 바로는 안 보임', sysOf(env).includes('role-text'), sysOf(env).slice(0, 40));
env.cache.clear();
chat(env);
ok('캐시가 지나면 직접 수정한 값이 반영됨', sysOf(env).includes('HAND-EDITED'), sysOf(env).slice(0, 40));

// ── 8-2) File API(PDF 자료)는 쓰지 않는다: 시트에 옛 값이 남아 있어도 채팅·설정에 영향이 없다 ──
env = makeEnv({ templateKey: 'socratic' });
env.sheets['기본설정'].rows[6][1] = 'ON'; env.sheets['기본설정'].rows[7][1] = 'files/abc, files/def'; // 옛 File API 칸에 값이 남아 있는 시트
chat(env);
const lastContent = env.calls[0].contents[env.calls[0].contents.length - 1];
ok('옛 File API 칸이 ON 이어도 Gemini 요청에는 학생 글만 들어감(fileData 없음)', lastContent.parts.length === 1 && lastContent.parts[0].text && !JSON.stringify(env.calls[0]).includes('fileData'), lastContent);
gs = env.ctx.getTeacherSettings();
ok('교사 설정 조회에 PDF 폴더·File API 항목이 없음', !('pdfFolderId' in gs) && !('fileApiOnOff' in gs) && !('fileUris' in gs), Object.keys(gs));
env.ctx.saveTeacherSettings({ geminiApiKey: 'AIzaFAKEKEY1234567890', pdfFolderId: 'NEW-PDF', fileApiOnOff: 'ON', classList: '9반' });
ok('PDF 폴더·File API 값을 보내도 시트에 쓰지 않음(환경설정 B2·기본설정 B7 그대로)', env.sheets['환경설정'].rows[1][1] === '' && env.sheets['기본설정'].rows[6][1] === 'ON' && env.sheets['기본설정'].rows[10][1] === '9반', [env.sheets['환경설정'].rows[1], env.sheets['기본설정'].rows[6]]);
const SRC = require('fs').readFileSync(require('path').join(__dirname, '..', 'gas-source', 'Code.js'), 'utf8');
ok('백엔드 코드에 File API·Drive·Docs·옛 대시보드 분석 코드가 남아 있지 않음', !/DriveApp|DocumentApp|fileData|syncDriveFilesToGemini|uploadBlobToGemini|runToulminAnalysis|exportAnalysisToDoc|readLegacyValues_|markLegacyCells_/.test(SRC), SRC.match(/DriveApp|DocumentApp|fileData|syncDriveFilesToGemini|uploadBlobToGemini|runToulminAnalysis|exportAnalysisToDoc|readLegacyValues_|markLegacyCells_/g));

// ── 9) 새 탭을 못 만들 때도 수업은 멈추지 않는다(기본 상태로 대체) ──
env = makeEnv({ templateKey: 'socratic', noProfileTabs: true, insertSheetFails: true });
let r = chat(env);
ok('탭을 못 만들어도 기본 상태(소크라테스)로 채팅 성공', r.success && sysOf(env).includes('[역할]\n' + SOC.persona.role) && lastRow(env)[7] === '기본', [r, lastRow(env)]);
init = env.ctx.getInitialData();
ok('학생 화면 초기 데이터도 기본 상태로(대체 동작 진단 표시 포함)', init.character.id === 'socrates' && init.timeLimitMinutes === 20 && init.settingsFallback === true, init);
ok('getProfiles 가 대체 동작 중임을 알려 줌', env.ctx.getProfiles().fallback === true, '');
ok('정상일 때 settingsFallback 은 false', makeEnv({}).ctx.getInitialData().settingsFallback === false, '');
an = env.ctx.apiAnalyze('1반', '1모둠', T1, true);
ok('탭을 못 만들어도 분석은 기본 루브릭으로', an.success && env.calls[env.calls.length - 1].systemInstruction.parts[0].text.includes(SOC.rubric.criteria.slice(0, 40)), an.error);
ok('탭을 못 만드는 상태에서 설정 저장은 이유를 알려 주며 실패', env.ctx.routeAction('saveProfile', { kind: 'persona', name: 'X', values: { role: 'x' } }).success === false, '');

// ── 10) 교사 비밀번호: 새 요청도 보호된다 ──
env = makeEnv({ templateKey: 'socratic' });
env.ctx.setTeacherPin_({ newPin: 'secret-123' });
ok('새 교사 전용 요청이 비밀번호 없이는 거부됨', ['getProfiles', 'saveProfile', 'deleteProfile', 'saveTopicSetting'].every((a) => env.ctx.routeAction(a, {}).needPin === true), '');
ok('비밀번호가 맞으면 getProfiles 허용', env.ctx.routeAction('getProfiles', { pin: 'secret-123' }).success === true, '');
ok('학생 요청(getInitialData·processChatMessage)은 수업 입장 코드가 있어야 열림', env.ctx.routeAction('getInitialData', {}).needCode === true && env.ctx.routeAction('processChatMessage', {}).needCode === true, '');
ok('routeAction 경유 saveProfile 동작', env.ctx.routeAction('saveProfile', { pin: 'secret-123', kind: 'persona', name: 'Q', values: { role: 'z' } }).success === true, '');

// ── 11) 학생이 설정을 바꿀 수 없다: 요청의 다른 필드는 무시 ──
env = makeEnv({ templateKey: 'socratic' });
env.ctx.saveProfile({ kind: 'persona', name: 'CER 코치', values: cerValues });
env.ctx.saveTopicSetting({ topic: T2, persona: 'CER 코치' });
chat(env, { topicValue: T1, personaName: 'CER 코치', role: '해킹', templateKey: 'qna' });
ok('요청에 페르소나·역할을 실어 보내도 무시', sysOf(env).includes('[역할]\nrole-text') && !sysOf(env).includes('해킹') && lastRow(env)[7] === '기본', lastRow(env));

// ── 12) 템플릿 원본이 세부설정 탭에 미리 들어 있고, 고치면 새 이름으로 따로 저장된다 ──
env = makeEnv({ templateKey: 'socratic' });
env.ctx.ensureProfileTabs_();
const TP = env.ctx.TEMPLATE_PROFILES_;
const tplRows = (sh) => sh.rows.slice(1).filter((r) => r[sh.rows[0].length - 1] === '템플릿');
ok('템플릿 5종(페르소나)과 4종(루브릭, 탐구 도우미는 없음)이 미리 들어감', TP.length === 5 && tplRows(env.sheets[P]).length === 5 && tplRows(env.sheets[R]).length === 4, [tplRows(env.sheets[P]).length, tplRows(env.sheets[R]).length]);
ok("머리글에 '구분' 열", env.sheets[P].rows[0][10] === '구분' && env.sheets[R].rows[0][6] === '구분', [env.sheets[P].rows[0], env.sheets[R].rows[0]]);
ok("'기본' 줄은 템플릿이 아님(고칠 수 있음)", env.sheets[P].rows[1][0] === '기본' && !env.sheets[P].rows[1][10], env.sheets[P].rows[1]);
const cerT = TP.find((t) => t.key === 'cer');
const cerRow = env.sheets[P].rows.find((r) => r[0] === 'CER 코치형');
ok('시트의 템플릿 줄이 Templates.js 원본과 글자까지 같음', cerRow[1] === 'cer' && cerRow[2] === cerT.persona.role && cerRow[3] === cerT.persona.action && cerRow[4] === cerT.persona.restrict && cerRow[5] === cerT.persona.exception && cerRow[6] === cerT.persona.extra, '');
ok('템플릿 줄은 캐릭터·템플릿별 인사말까지 채워져 있음', cerRow[7] === 'labcoat' && cerRow[8] === '실험 가운 과학 선생님' && cerRow[9].includes('주장 → 증거 → 추론'), cerRow.slice(7, 10));
const tplChar = (name) => { const r = env.sheets[P].rows.find((x) => x[0] === name); return r && r[7] + '|' + r[8]; };
ok('템플릿 5종의 캐릭터는 서로 다른 1:1 짝(소크라테스·가운·코치·토론 파트너·로봇)', tplChar('소크라테스 발문형') === 'socrates|소크라테스 선생님' && tplChar('CER 코치형') === 'labcoat|실험 가운 과학 선생님' && tplChar('고급 논쟁형') === 'coach|비판적 사고 코치' && tplChar('찬반 토론형') === 'debater|토론 파트너' && tplChar('탐구 도우미') === 'robot|과학 조교 로봇', ['소크라테스 발문형', 'CER 코치형', '고급 논쟁형', '찬반 토론형', '탐구 도우미'].map(tplChar));
const cerRub = env.sheets[R].rows.find((r) => r[0] === 'CER 코치형');
ok('루브릭 템플릿도 원본과 같음', cerRub[2] === cerT.rubric.role && cerRub[3] === cerT.rubric.criteria && cerRub[4] === cerT.rubric.level && cerRub[5] === cerT.rubric.guideline, '');
ok('도우미 템플릿(qna)은 평가 루브릭이 없음', !env.sheets[R].rows.some((r) => r[0] === '탐구 도우미') && env.sheets[P].rows.some((r) => r[0] === '탐구 도우미' && r[1] === 'qna'), '');
// 한 번 넣으면 다시 넣지 않는다: 교사가 시트에서 지운 줄을 되살리지 않음
env.sheets[P].rows = env.sheets[P].rows.filter((r) => r[0] !== '고급 논쟁형');
env.cache.clear(); env.ctx.readCoreConfig_(true); chat(env);
ok('지운 템플릿 줄은 되살아나지 않음(한 번만 채움)', !env.sheets[P].rows.some((r) => r[0] === '고급 논쟁형') && env.sheets[P].rows.length === 6, env.sheets[P].rows.length);
ok('채우기 기록이 스크립트 속성에 남음', env.props.get('PROFILE_TEMPLATES_SEEDED') === '1', [...env.props.entries()]);
// 템플릿을 바로 주제에 연결해서 쓴다
env = makeEnv({ templateKey: 'socratic' });
env.sheets['기본설정'].rows[12][1] = `${T1}, ${T2}`;
env.ctx.ensureProfileTabs_();
ok('템플릿 페르소나·루브릭을 그대로 주제에 연결', env.ctx.saveTopicSetting({ topic: T2, persona: 'CER 코치형', rubric: 'CER 코치형' }).success, '');
chat(env, { topicValue: T2 });
ok('연결한 주제의 AI 호출에 템플릿 원본 역할·행동 지침이 쓰임', sysOf(env).includes('[역할]\n' + cerT.persona.role) && sysOf(env).includes('[행동 지침]\n' + cerT.persona.action) && lastRow(env)[7] === 'CER 코치형' && lastRow(env)[8] === 'CER 코치형', sysOf(env).slice(0, 80));
init = env.ctx.getInitialData();
ok('학생 화면에는 그 템플릿의 캐릭터·인사말·템플릿 종류가 내려감', init.topicConfigs[T2].character.templateKey === 'cer' && init.topicConfigs[T2].character.greeting === cerT.persona.greeting && init.topicConfigs[T2].character.id === 'labcoat', init.topicConfigs[T2]);
env.calls.length = 0;
const anT = env.ctx.apiAnalyze('1반', '1모둠', T2, true);
ok('템플릿 루브릭으로 분석(원본 판정 기준이 프롬프트에 들어감)', anT.success && anT.rubricName === 'CER 코치형' && env.calls[0].systemInstruction.parts[0].text.includes(cerT.rubric.criteria.slice(0, 40)), anT.error || anT.rubricName);
env.ctx.saveTopicSetting({ topic: T1, persona: '탐구 도우미' });
ok('탐구 도우미 템플릿에 연결한 주제는 자료가 필요함', JSON.stringify(env.ctx.getInitialData().missingMaterialTopics) === JSON.stringify([T1]), env.ctx.getInitialData().missingMaterialTopics);
// 원본 보호
const sp2 = (o) => env.ctx.saveProfile(Object.assign({ kind: 'persona' }, o));
ok('템플릿 원본은 고칠 수 없음', sp2({ originalName: 'CER 코치형', name: 'CER 코치형', values: { role: '바꿈' } }).success === false && /템플릿 원본/.test(sp2({ originalName: 'CER 코치형', name: 'CER 코치형', values: { role: '바꿈' } }).error), '');
ok('템플릿 원본은 이름도 바꿀 수 없음', sp2({ originalName: 'CER 코치형', name: '내 CER', values: { role: '바꿈' } }).success === false && env.sheets[P].rows.some((r) => r[0] === 'CER 코치형' && r[2] === cerT.persona.role), '');
ok('템플릿 원본은 지울 수 없음', env.ctx.deleteProfile({ kind: 'persona', name: 'CER 코치형' }).success === false && env.ctx.deleteProfile({ kind: 'rubric', name: 'CER 코치형' }).success === false, '');
ok('템플릿과 같은 이름으로는 새로 저장할 수 없음', sp2({ name: 'CER 코치형', values: { role: 'x' } }).success === false, '');
// 고친 것은 새 이름으로 따로 저장된다
const copy = Object.assign({}, cerT.persona, { role: '우리 반용으로 고친 역할' });
ok('고친 내용은 새 이름의 페르소나로 따로 저장됨', sp2({ name: 'CER 코치형 (수정)', values: copy }).success, '');
const mine = env.sheets[P].rows.find((r) => r[0] === 'CER 코치형 (수정)');
ok('새로 저장한 줄은 템플릿 표시가 없고 고친 내용이 담김, 원본은 그대로', mine && !mine[10] && mine[2] === '우리 반용으로 고친 역할' && env.sheets[P].rows.find((r) => r[0] === 'CER 코치형')[2] === cerT.persona.role, mine);
ok("요청으로 '구분'을 템플릿으로 만들 수 없음", sp2({ name: '가짜 템플릿', values: { role: 'x', kind: '템플릿' } }).success && !env.sheets[P].rows.find((r) => r[0] === '가짜 템플릿')[10], '');
ok('새로 저장한 페르소나는 이후 고치고 지울 수 있음', sp2({ originalName: 'CER 코치형 (수정)', name: 'CER 코치형 (수정)', values: { role: '또 고침' } }).success && env.ctx.deleteProfile({ kind: 'persona', name: 'CER 코치형 (수정)' }).success, '');
const gpT = env.ctx.getProfiles();
ok('getProfiles 가 템플릿 줄을 isTemplate 로 알려 줌', gpT.personas.filter((p) => p.isTemplate).length === 5 && gpT.rubrics.filter((r) => r.isTemplate).length === 4 && !gpT.personas.find((p) => p.isBase).isTemplate, gpT.personas.map((p) => [p.name, p.isTemplate]));
// 이미 운영 중인 시트(옛 버전이 만든 세부설정 탭, '구분' 열·템플릿 줄 없음)에도 한 번 채운다
env = makeEnv({ templateKey: 'socratic' });
env.ctx.ensureProfileTabs_();
env.sheets[P].rows = env.sheets[P].rows.slice(0, 2).map((r) => r.slice(0, 10)); env.sheets[P].rows[0] = env.sheets[P].rows[0].slice(0, 10);
env.sheets[R].rows = env.sheets[R].rows.slice(0, 2).map((r) => r.slice(0, 6)); env.sheets[R].rows[0] = env.sheets[R].rows[0].slice(0, 6);
env.props.delete('PROFILE_TEMPLATES_SEEDED'); env.cache.clear();
env.ctx.ensureProfileTabs_();
ok('운영 중인 시트: 기본 줄은 그대로 두고 템플릿 줄만 추가, 머리글도 채움', env.sheets[P].rows.length === 7 && env.sheets[P].rows[1][2] === 'role-text' && env.sheets[P].rows[0][10] === '구분' && env.sheets[R].rows.length === 6 && env.sheets[R].rows[0][6] === '구분', [env.sheets[P].rows.length, env.sheets[P].rows[0]]);
// 교사가 같은 이름의 페르소나를 이미 만들어 둔 경우: 덮어쓰지 않고 템플릿 표시도 붙이지 않는다
env = makeEnv({ templateKey: 'socratic' });
env.ctx.ensureProfileTabs_();
env.sheets[P].rows = env.sheets[P].rows.filter((r) => r[0] !== 'CER 코치형');
env.sheets[P].rows.push(['CER 코치형', 'cer', '교사가 직접 쓴 역할', '', '', '', '', '', '', '', '']);
env.props.delete('PROFILE_TEMPLATES_SEEDED'); env.cache.clear();
env.ctx.ensureProfileTabs_();
const own = env.sheets[P].rows.filter((r) => r[0] === 'CER 코치형');
ok('같은 이름의 교사 줄은 덮어쓰지도 않고 템플릿으로 표시하지도 않음(고칠 수 있음)', own.length === 1 && own[0][2] === '교사가 직접 쓴 역할' && !own[0][10] && env.ctx.saveProfile({ kind: 'persona', originalName: 'CER 코치형', name: 'CER 코치형', values: { role: '또 고침' } }).success, own);
// 옛 시트에서 처음 이관될 때도 템플릿이 함께 들어간다
env = makeEnv({ templateKey: 'qna' });
try { chat(env, { topicValue: T2 }); } catch (e) { /* qna 기본 페르소나 + 자료 없음이라 오류가 나는 것이 정상: 이 요청이 이관을 일으키는 것이 목적 */ }
env.ctx.ensureProfileTabs_();
ok('옛 시트 이관과 함께 템플릿도 들어가고 기본 줄은 옛 설정 그대로', env.sheets[P].rows.length === 7 && env.sheets[P].rows[1][0] === '기본' && env.sheets[P].rows[1][1] === 'qna' && env.sheets[P].rows[1][2] === 'role-text', env.sheets[P].rows.map((r) => r[0]));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
