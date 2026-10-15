// 실제 gas-source/Code.js 를 메모리 가짜(시트·캐시·Gemini)로 실행해 로직을 검사한다. 사용: node tests/gas_logic.test.js
const { makeEnv } = require('./gas_harness.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { (cond ? pass++ : fail++); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  → ' + JSON.stringify(extra))); };
const chat = (env, over) => env.ctx.processChatMessage(Object.assign({ classValue: '1반', groupValue: '1모둠', topicValue: '전류와 전압의 관계', userQuestion: '전압계는 어디에 연결해요?', history: [] }, over || {}));
const lastRow = (env) => env.sheets['채팅기록'].rows[env.sheets['채팅기록'].rows.length - 1];
// 세부설정 탭을 직접 고친 것처럼 흉내 낸다(시트를 손으로 편집). 첫 호출 때 옛 칸에서 탭이 만들어진다.
const P = '페르소나 세부설정', R = '루브릭 세부설정', T = '주제 세부설정';
const setTemplate = (env, key) => { env.ctx.ensureProfileTabs_(); env.sheets[P].rows[1][1] = key; env.cache.clear(); };

// 1) 탐구 도우미(qna): 항상 켤 수 있지만, 탐구 자료가 입력된 주제에서만 질문을 받는다
let env = makeEnv({ templateKey: 'qna' });
let threw = null; try { chat(env); } catch (e) { threw = e.message; }
ok('qna: 자료 없는 주제는 질문을 받지 않음(안내 오류)', /탐구 자료를 준비하지 않았어요/.test(threw || ''), threw);
ok('qna: 자료 없는 주제는 기록도 AI 호출도 하지 않음', env.sheets['채팅기록'].rows.length === 1 && env.calls.length === 0, [env.sheets['채팅기록'].rows.length, env.calls.length]);
env.ctx.saveTopicMaterial({ topic: '전류와 전압의 관계', procedure: '직렬 연결', materials: '전류계', safety: '전원을 끈다', notes: '메모' });
let r = chat(env);
ok('qna: 자료를 입력하면 채팅 성공', r.success && !r.isBlocked, r);
ok("qna 행: H열 = 페르소나 이름, I열 = '-'(평가 안 함)", lastRow(env)[7] === '기본' && lastRow(env)[8] === '-', lastRow(env));
ok('qna 행에 학생 글/AI 답이 저장됨', lastRow(env)[5] === '전압계는 어디에 연결해요?' && lastRow(env)[6] === '응답이에요.', lastRow(env));
ok('H1·I1 열 이름 기록', env.sheets['채팅기록'].rows[0][7] === '페르소나' && env.sheets['채팅기록'].rows[0][8] === '루브릭', env.sheets['채팅기록'].rows[0]);
const sys2 = env.calls[0].systemInstruction.parts[0].text;
ok('자료가 시스템 프롬프트에 붙음', sys2.includes('[탐구 자료: 전류와 전압의 관계') && sys2.includes('전원을 끈다'), sys2.slice(0, 80));
env.sheets['기본설정'].rows[12][1] = '전류와 전압의 관계, 온도와 반응 속도';
let init = env.ctx.getInitialData();
ok('qna 학생 화면 정보: 자료가 없는 주제를 알려 줌', JSON.stringify(init.missingMaterialTopics) === JSON.stringify(['온도와 반응 속도']), init.missingMaterialTopics);
ok('다른 주제도 자료가 없으면 질문 불가(주제 우회 방지)', (() => { try { chat(env, { topicValue: '온도와 반응 속도' }); return false; } catch (e) { return /준비하지 않았어요/.test(e.message); } })(), '');
setTemplate(env, 'socratic');
ok('논증 템플릿에서는 missingMaterialTopics 가 비어 있음(자료 없이도 평소대로)', env.ctx.getInitialData().missingMaterialTopics.length === 0, env.ctx.getInitialData());

// 3) 일반(논증) 모드: 자료 없이도 평소대로, H열은 빈 칸
env = makeEnv({ templateKey: 'socratic' });
chat(env);
ok('논증 모드: 자료 없어도 채팅 가능, H·I열 = 페르소나·루브릭 이름', lastRow(env)[7] === '기본' && lastRow(env)[8] === '기본', lastRow(env));

// 4) 금지어 경로도 qna 표시
env = makeEnv({ templateKey: 'qna' });
env.ctx.saveTopicMaterial({ topic: '전류와 전압의 관계', procedure: '과정' });
r = chat(env, { userQuestion: '이 바보야' });
ok("금지어 1차 경고 + 페르소나·루브릭('-') 표시", r.aiReply.includes('[1차 경고]') && lastRow(env)[7] === '기본' && lastRow(env)[8] === '-', [r, lastRow(env)]);

// 5) 분석: qna 행만 있으면 평가 대상 없음 + 안내 메시지
env = makeEnv({ templateKey: 'qna' });
env.ctx.saveTopicMaterial({ topic: '전류와 전압의 관계', procedure: '과정' });
chat(env); chat(env, { userQuestion: '준비물은 왜 필요해요?' });
let an = env.ctx.apiAnalyze('1반', '1모둠', '전류와 전압의 관계', true);
ok('qna 행만 있으면 분석 불가 + 이유 안내', an.success === false && an.empty === true && an.excludedQna === 2 && /탐구 도우미/.test(an.error), an);
ok('qna 행만 있을 때 Gemini 분석 호출 없음', env.calls.length === 2, env.calls.length);

// 6) 분석: qna 와 논증 행이 섞여 있으면 논증 행만 분석에 들어간다
setTemplate(env, 'socratic');
chat(env, { userQuestion: '온도가 높으면 빨라질 것 같아요.' });
env.calls.length = 0;
an = env.ctx.apiAnalyze('1반', '1모둠', '전류와 전압의 관계', true);
ok('혼합 기록: 분석 성공(논증 행 1건)', an.success === true && an.utterances.length === 1 && an.utterances[0].text.includes('온도가 높으면'), an.error || an.utterances);
ok('혼합 기록: qna 발화 내용이 분석 프롬프트에 들어가지 않음', !JSON.stringify(env.calls).includes('준비물은 왜 필요해요'), '');
ok('혼합 기록: excludedQna 개수 반환', an.excludedQna === 2, an.excludedQna);

// 7) 탐구 도우미 템플릿은 자료 없이도 항상 저장(활성화)할 수 있다 — 입력은 화면이 안내하고, 자료 없는 주제는 학생이 쓰지 못한다
env = makeEnv({ templateKey: 'socratic' });
let sv = env.ctx.saveTeacherSettings({ role: 'new-role', templateKey: 'qna' });
ok('자료가 없어도 qna 저장(활성화) 허용(옛 콘솔 호환: 기본 페르소나 줄에 저장)', sv.success === true && env.sheets[P].rows[1][1] === 'qna' && env.sheets[P].rows[1][2] === 'new-role', [sv, env.sheets[P] && env.sheets[P].rows[1]]);
ok('활성화 직후 모든 주제가 "자료 필요"로 내려감', JSON.stringify(env.ctx.getInitialData().missingMaterialTopics) === JSON.stringify(['전류와 전압의 관계', '온도와 반응 속도']), env.ctx.getInitialData().missingMaterialTopics);
env.ctx.saveTopicMaterial({ topic: '온도와 반응 속도', procedure: '과정' });
ok('자료를 입력한 주제만 학생이 쓸 수 있게 풀림', JSON.stringify(env.ctx.getInitialData().missingMaterialTopics) === JSON.stringify(['전류와 전압의 관계']), env.ctx.getInitialData().missingMaterialTopics);
ok('다른 템플릿 저장도 허용', makeEnv({}).ctx.saveTeacherSettings({ role: 'x', templateKey: 'debate' }).success === true, '');
ok('B4(보고서 폴더)는 건드리지 않음', env.sheets['환경설정'].rows[3][1] === 'FOLDER-ID-DO-NOT-TOUCH', env.sheets['환경설정'].rows[3]);

// 8) 수식/날짜 변환 방지(한 번 더): 모둠 이름 1-2 와 =수식 글
env = makeEnv({ templateKey: 'socratic' });
chat(env, { groupValue: '1-2', userQuestion: '=SUM(1,2)' });
ok("모둠 '1-2'와 '=SUM(1,2)' 가 문자열로 저장", lastRow(env)[3] === '1-2' && lastRow(env)[5] === '=SUM(1,2)', lastRow(env));

// 9) 교사 비밀번호
env = makeEnv({});
ok('비밀번호 없음: 교사 액션은 모두 거부(needSetup)', env.ctx.routeAction('getTeacherSettings', {}).needSetup === true, '');
ok('비밀번호 없음: 웹으로는 최초 설정도 못 함(시트 메뉴에서만)', env.ctx.routeAction('setTeacherPin', { newPin: 'secret-123' }).needSetup === true && !env.ctx.isTeacherPinSet_(), '');
ok('비밀번호 설정(시트 메뉴 경로)', env.ctx.setTeacherPin_({ newPin: 'secret-123' }).success === true, '');
ok('비밀번호 없이 거부', env.ctx.routeAction('getTeacherSettings', {}).needPin === true, '');
ok('틀린 비밀번호 거부', env.ctx.routeAction('getTeacherSettings', { pin: 'nope' }).needPin === true, '');
ok('맞는 비밀번호 허용', env.ctx.routeAction('getTeacherSettings', { pin: 'secret-123' }).success === true, '');
ok('학생 기능(getInitialData)은 수업 입장 코드로 열림', env.ctx.routeAction('getInitialData', {}).needCode === true, '');
const tc = env.ctx.routeAction('testConnection', {});
ok('비밀번호 없이 testConnection: 시트 이름·주소 숨김', tc.pinSet === true && tc.authorized === false && tc.sheetUrl === '' && tc.sheetName === '', tc);

// 10) 분석 응답 정규화
const nj = env.ctx.normalizeJudgment_, nl = env.ctx.normalizeLevel_;
ok('판정 정규화', nj('[주장" onfocus="x]') === '[주장]' && nj('판단유보') === '[판단 유보]' && nj('???') === '' && nj('[정당화]') === '[정당화]', [nj('[주장" onfocus="x]'), nj('판단유보'), nj('???')]);
ok('레벨 정규화', nl('Level 3 → 4') === 'Level 3' && nl('Level 3.5') === 'Level 3' && nl('') === '' && nl('4') === 'Level 4', [nl('Level 3 → 4'), nl('Level 3.5')]);

// 11) 여러 API 키 + 한도 소진 시 자동 전환
const PRIMARY = 'AIzaFAKEKEY1234567890', SECOND = 'AIzaSecondKey1234567890', THIRD = 'AIzaThirdKey123456789012';
const GOOD = (t) => ({ code: 200, body: { candidates: [{ content: { parts: [{ text: t }] } }] } });
const DEPLETED = { code: 402, body: { error: { code: 402, message: 'Your prepayment credits are depleted. Please go to AI Studio.' } } };
env = makeEnv({ keyHandler: (key) => (key === PRIMARY ? DEPLETED : GOOD('두번째 키 답변')) });
let sk = env.ctx.saveApiKeys({ keys: [{ label: '학교 키', key: SECOND }, { label: '', key: '' }, { label: '중복', key: PRIMARY }] });
ok('추가 키 저장: 빈 칸·기본 키 중복은 제외', sk.success && sk.count === 1, sk);
ok("API키 탭이 만들어지고 키가 저장됨", env.sheets['API키'] && env.sheets['API키'].rows.length === 2 && env.sheets['API키'].rows[1][1] === SECOND, env.sheets['API키'] && env.sheets['API키'].rows);
r = chat(env);
ok('기본 키 크레딧 소진 → 두 번째 키로 자동 전환해 응답', r.success && r.aiReply === '두번째 키 답변', r);
ok('첫 호출은 기본 키 → 두 번째 키 순서', JSON.stringify(env.keysUsed) === JSON.stringify([PRIMARY, SECOND]), env.keysUsed);
chat(env);
ok('이후 호출은 쉬는 중인 기본 키를 건너뜀', JSON.stringify(env.keysUsed) === JSON.stringify([PRIMARY, SECOND, SECOND]), env.keysUsed);
let ks = env.ctx.getApiKeys();
ok('키 상태: 기본 키 한도 소진, 추가 키 정상 (키 원문은 가려서 줌)', ks.success && ks.primary.status === 'exhausted' && ks.keys[0].status === 'ok' && ks.keys[0].key === env.ctx.maskKey_(SECOND) && !JSON.stringify(ks).includes(SECOND), ks);

// 모든 키가 소진되면 학생/교사에게 알맞은 안내
env = makeEnv({ keyHandler: () => DEPLETED });
env.ctx.saveApiKeys({ keys: [{ label: 'b', key: SECOND }] });
threw = null; try { chat(env); } catch (e) { threw = e.message; }
ok('모든 키 소진: 학생에게 한도 소진 안내(오류로 알리고 기록은 남기지 않음)', /사용 한도 소진/.test(threw || '') && env.sheets['채팅기록'].rows.length === 1, [threw, env.sheets['채팅기록'].rows.length]);
an = env.ctx.apiAnalyze('1반', '1모둠', '전류와 전압의 관계', true);
ok('모든 키 소진: 분석은 empty 안내가 먼저 나옴(기록 없음)', an.success === false, an);
env.sheets['채팅기록'].rows.push(['2026-10-14', '10:00', '1반', '1모둠', '전류와 전압의 관계', '내 생각', 'AI', '']);
an = env.ctx.apiAnalyze('1반', '1모둠', '전류와 전압의 관계', true);
ok('모든 키 소진: 분석 오류가 키 추가/충전을 안내', an.success === false && /등록된 API 키를 모두 사용할 수 없어요/.test(an.error), an);
ok('쉬는 중인 키만 남았어도 충전 후엔 다시 시도(모두 한 번씩 시도)', env.keysUsed.length >= 4, env.keysUsed);
// 충전 후: 상태 초기화하면 기본 키부터 다시 사용
let recovered = false;
env = makeEnv({ keyHandler: (key) => (!recovered ? DEPLETED : GOOD('복구됨')) });
env.ctx.saveApiKeys({ keys: [{ label: 'b', key: SECOND }] });
try { chat(env); } catch (e) {}
recovered = true; env.keysUsed.length = 0;
r = chat(env);
ok('충전 후에는 쉬는 중이던 키도 자동으로 다시 시도해 성공', r.success && r.aiReply === '복구됨', [r, env.keysUsed]);
ok('성공하면 쉬는 중 표시가 풀림', env.ctx.getApiKeys().primary.status === 'ok', env.ctx.getApiKeys());

// 키와 무관한 오류(서버 오류)는 키를 바꾸지 않고, 쉬게도 하지 않는다
env = makeEnv({ keyHandler: (key) => (key === PRIMARY ? { code: 503, body: { error: { code: 503, message: 'The model is overloaded.' } } } : GOOD('두번째')) });
env.ctx.saveApiKeys({ keys: [{ label: 'b', key: SECOND }] });
threw = null; try { chat(env); } catch (e) { threw = e.message; }
ok('503 은 키 전환 대상이 아님(두 번째 키 미사용, 쉬는 중 표시 없음)', !env.keysUsed.includes(SECOND) && env.ctx.getApiKeys().primary.status === 'ok' && /다시 보내/.test(threw || ''), [env.keysUsed, threw]);

// 키 오류(invalid)도 다음 키로
env = makeEnv({ keyHandler: (key) => (key === PRIMARY ? { code: 400, body: { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } } } : GOOD('두번째')) });
env.ctx.saveApiKeys({ keys: [{ label: 'b', key: SECOND }] });
r = chat(env);
ok('잘못된 키 → 다음 키로 전환, 상태는 invalid', r.success && r.aiReply === '두번째' && env.ctx.getApiKeys().primary.status === 'invalid', [r, env.ctx.getApiKeys().primary]);

// 분당 한도(rate): 한 번만 기다려 보고 다음 키로
env = makeEnv({ keyHandler: (key) => (key === PRIMARY ? { code: 429, body: { error: { code: 429, message: 'Too many requests, slow down.', status: 'RESOURCE_EXHAUSTED' } } } : GOOD('세번째 말고 두번째')) });
env.ctx.saveApiKeys({ keys: [{ label: 'b', key: SECOND }] });
r = chat(env);
ok('분당 한도(429): 기본 키 2회만 시도 후 다음 키로', r.success && env.keysUsed.filter((k) => k === PRIMARY).length === 2 && env.keysUsed.includes(SECOND), env.keysUsed);

// 실제로 겪은 무료 등급 오류: 하루 20회 한도 → 오류 문구의 '재시도 시간'만큼(상한 6시간) 쉬고, 무료 키로 표시
const FREE_DAILY = { code: 429, body: { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'You exceeded your current quota, please check your plan and billing details.\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.8-flash\nPlease retry in 21h32m41.914479901s.' } } };
env = makeEnv({ keyHandler: (key) => (key === PRIMARY ? FREE_DAILY : GOOD('두번째')) });
env.ctx.saveApiKeys({ keys: [{ label: 'b', key: SECOND }] });
r = chat(env);
let pst = env.ctx.getApiKeys().primary;
ok('무료 키 하루 한도: 다음 키로 전환', r.success && r.aiReply === '두번째', r);
ok('하루 한도는 "한도 소진"으로 분류되고 무료 키로 표시됨', pst.status === 'exhausted' && pst.free === true && pst.kind === 'exhausted', pst);
const restSec = (pst.until - Date.now()) / 1000;
ok('휴식 시간은 안내된 재시도 시간(상한 6시간)을 따름', restSec > 21000 && restSec <= 21600, restSec);
// 분당 한도(재시도 23초): 짧게만 쉰다
env = makeEnv({ keyHandler: (key) => (key === PRIMARY ? { code: 429, body: { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'You exceeded your current quota. Quota exceeded for metric: generate_content_free_tier_requests, limit: 5, model: x\nPlease retry in 23.4s.' } } } : GOOD('두번째')) });
env.ctx.saveApiKeys({ keys: [{ label: 'b', key: SECOND }] });
chat(env);
pst = env.ctx.getApiKeys().primary;
ok('분당 한도(재시도 23초)는 "rate"로 분류되고 30초 안팎만 쉼', pst.kind === 'rate' && (pst.until - Date.now()) / 1000 < 40, pst);

// 기본(자동) 모델: Flash-Lite 우선, 교사가 고른 모델은 그대로 존중
const modelOf = (opts, setup) => { const e = makeEnv(opts); if (setup) setup(e); chat(e); return e.modelsUsed[0]; };
ok('자동 선택: flash-lite-latest 가 있으면 그것을 씀', modelOf({ models: ['gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-3.8-flash'] }) === 'gemini-flash-lite-latest', '');
ok('flash-lite-latest 가 없으면 최신 정식 Flash-Lite 버전', modelOf({ models: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite-preview', 'gemini-flash-latest'] }) === 'gemini-3.5-flash-lite', modelOf({ models: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite-preview', 'gemini-flash-latest'] }));
ok('Flash-Lite 가 전혀 없으면 flash-latest', modelOf({ models: ['gemini-flash-latest', 'gemini-3.8-flash'] }) === 'gemini-flash-latest', '');
ok('Flash-Lite·flash-latest 가 없으면 최신 일반 Flash', modelOf({ models: ['gemini-3.8-flash', 'gemini-3.6-flash'] }) === 'gemini-3.8-flash', '');
ok('교사가 모델을 직접 고르면(환경설정 B5) 그것을 씀', modelOf({ models: ['gemini-flash-lite-latest', 'gemini-3.8-flash'] }, (e) => { e.sheets['환경설정'].rows[4][1] = 'gemini-3.8-flash'; }) === 'gemini-3.8-flash', '');
ok('콘솔의 자동 선택 표시(listGeminiModels)도 같은 규칙', makeEnv({ models: ['gemini-flash-lite-latest', 'gemini-flash-latest'] }).ctx.listGeminiModels({ apiKey: 'AIzaSomeKey1234567890' }).autoModel === 'gemini-flash-lite-latest', '');
ok('이전 기본값이 캐시에 남아 있어도(v1 키) 새 규칙을 따름', modelOf({ models: ['gemini-flash-lite-latest', 'gemini-flash-latest'] }, (e) => { e.cache.set('auto_model_v1', 'gemini-flash-latest'); }) === 'gemini-flash-lite-latest', '');

// 키 저장 검증과 보호
env = makeEnv({});
ok('형식이 잘못된 키 저장 거부', env.ctx.saveApiKeys({ keys: [{ label: 'x', key: 'bad key!' }] }).success === false, '');
ok('키 목록이 배열이 아니면 거부(불러오기 전 저장 방지)', env.ctx.saveApiKeys({}).success === false && env.ctx.saveApiKeys({ keys: 'x' }).success === false, '');
ok('추가 키 최대 개수 제한', env.ctx.saveApiKeys({ keys: Array.from({ length: 11 }, (_, i) => ({ label: 'k' + i, key: 'AIzaKeyNumber' + String(i).padStart(10, '0') })) }).success === false, '');
env.ctx.saveApiKeys({ keys: [{ label: 'a', key: SECOND }, { label: 'b', key: THIRD }] });
ok('키 2개 저장 후 삭제(빈 목록)도 가능', env.ctx.saveApiKeys({ keys: [] }).success && env.ctx.getApiKeys().keys.length === 0, '');
ok('기본 키(B1)와 보고서 폴더(B4)는 키 저장이 건드리지 않음', env.sheets['환경설정'].rows[0][1] === PRIMARY && env.sheets['환경설정'].rows[3][1] === 'FOLDER-ID-DO-NOT-TOUCH', env.sheets['환경설정'].rows);
env.ctx.setTeacherPin_({ newPin: 'secret-123' });
ok('비밀번호가 있으면 키 관리도 보호됨', env.ctx.routeAction('getApiKeys', {}).needPin === true && env.ctx.routeAction('saveApiKeys', { keys: [] }).needPin === true && env.ctx.routeAction('getApiKeys', { pin: 'secret-123' }).success === true, '');
ok('모델 테스트가 한도 소진 키를 표시', (() => { const e = makeEnv({ keyHandler: () => DEPLETED }); e.ctx.testGeminiModel({ apiKey: SECOND, model: 'gemini-flash-latest' }); return e.ctx.getApiKeys().keys.length === 0 && e.ctx.describeKeyStatus_(SECOND).status === 'exhausted'; })(), '');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
