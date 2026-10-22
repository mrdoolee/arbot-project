// 탐구 마무리 피드백(getSessionFeedback) 시험: 제한 시간이 끝나 '오늘의 탐구 요약'이 뜰 때 학생에게 주는 100자 이내 피드백.
// (1) 수업 입장 코드·학급/모둠/주제 검사·횟수 제한을 채팅과 똑같이 거친다 (2) 학생이 말하지 않았거나 차단된 모둠은 AI 를 부르지 않는다
// (3) 대화 방식(템플릿)에 맞는 볼 점을 AI 에 알려 준다 (4) 100자 이내로 다듬는다 (5) 시트에 기록하지 않는다 (6) 키가 새지 않는다
//   node tests/gas_feedback.test.js
const { makeEnv } = require('./gas_harness.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { (cond ? pass++ : fail++); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  → ' + JSON.stringify(extra))); };

const PIN = 'teacher-pass-1', CODE = 'K7M2QX', T1 = '전류와 전압의 관계', T2 = '온도와 반응 속도';
const HIST = [{ role: 'ai', text: '반가워요!' }, { role: 'user', text: '전압을 높이면 전류가 커져요.' }, { role: 'ai', text: '왜 그렇게 생각했나요?' }, { role: 'user', text: '실험에서 전압 2배일 때 전류도 2배였어요.' }];
const fb = (env, over) => env.ctx.routeAction('getSessionFeedback', Object.assign({ accessCode: CODE, classValue: '1반', groupValue: '1모둠', topicValue: T1, history: HIST }, over || {}));
const rows = (env) => env.sheets['채팅기록'].rows.length;
const sysOf = (env) => env.calls[env.calls.length - 1].systemInstruction.parts[0].text;
const userOf = (env) => env.calls[env.calls.length - 1].contents[0].parts[0].text;

// ───────── 1) 입구: 채팅과 같은 검사 ─────────
{
  const env = makeEnv({ pin: PIN, accessCode: CODE });
  ok('학생 입구 목록에 getSessionFeedback 이 있음(코드 없이는 못 부름)', env.ctx.STUDENT_ACTIONS_.includes('getSessionFeedback') && !env.ctx.TEACHER_ACTIONS_.includes('getSessionFeedback'), env.ctx.STUDENT_ACTIONS_);
  let r = fb(env, { accessCode: undefined });
  ok('입장 코드가 없으면 거절하고 AI 를 부르지 않음', r.success === false && r.needCode === true && env.calls.length === 0, r);
  r = fb(env, { accessCode: 'WRONG9' });
  ok('입장 코드가 틀리면 거절', r.success === false && env.calls.length === 0, r);
  r = fb(env, { classValue: '9반' });
  ok('목록에 없는 학급은 거절', r.success === false && /목록에 없어요/.test(r.error) && env.calls.length === 0, r);
  r = fb(env, { topicValue: '' });
  ok('주제가 비면 거절', r.success === false && env.calls.length === 0, r);
  r = fb(env, { userQuestion: undefined });
  ok('학생 글(userQuestion)이 없어도 통과(마무리 요청이라 글이 없음)', r.success === true && !!r.feedback, r);
  r = fb(env, { classValue: ' 1반 ', topicValue: '전류와  전압의 관계' });
  ok('학급·주제의 공백 차이는 시트 이름으로 맞춰 받음', r.success === true && userOf(env).length > 0 && sysOf(env).includes("'" + T1 + "'"), sysOf(env).slice(0, 120));
}

// ───────── 2) 정상 피드백 ─────────
{
  const env = makeEnv({ pin: PIN, accessCode: CODE });
  const before = rows(env);
  const r = fb(env);
  ok('피드백이 오고 100자 이내', r.success === true && typeof r.feedback === 'string' && r.feedback.length > 0 && r.feedback.length <= 100, r);
  ok('AI 를 딱 한 번 부름', env.calls.length === 1, env.calls.length);
  ok('채팅기록에 줄을 남기지 않음(분석·기록 집계에 섞이지 않게)', rows(env) === before, [before, rows(env)]);
  ok('AI 에 학생·튜터 대화를 순서대로 넘김', /학생: 전압을 높이면[\s\S]*튜터: 왜 그렇게[\s\S]*학생: 실험에서 전압 2배/.test(userOf(env)), userOf(env));
  ok('지침: 100자 이내, 잘한 점과 다음에 해 볼 점, 정답·개인정보 금지', /100자 이내/.test(sysOf(env)) && /잘한 점/.test(sysOf(env)) && /다음에 해 볼 점/.test(sysOf(env)) && /정답/.test(sysOf(env)) && /개인정보/.test(sysOf(env)), sysOf(env));
  ok('기본(소크라테스 발문형) 주제는 그 방식의 볼 점(주장·근거·이유)을 알려 줌', sysOf(env).includes(env.ctx.FEEDBACK_FOCUS_.socratic), sysOf(env));
  ok('키는 헤더로만 쓰고 응답·주소에 키가 없음', env.keysUsed.length === 1 && !JSON.stringify(r).includes('AIza') && env.urls.every((u) => !/key=/.test(u)), env.urls);
}

// ───────── 3) 대화 방식(템플릿)마다 볼 점 ─────────
{
  const env = makeEnv({ pin: PIN, accessCode: CODE });
  env.ctx.getInitialData();
  ok('(준비) 찬반 토론형 템플릿을 T2 에 연결', env.ctx.saveTopicSetting({ topic: T2, persona: '찬반 토론형' }).success === true, '');
  fb(env, { topicValue: T2 });
  ok('찬반 토론형 주제는 입장·재반박을 보라고 알려 줌', sysOf(env).includes(env.ctx.FEEDBACK_FOCUS_.debate) && /재반박/.test(env.ctx.FEEDBACK_FOCUS_.debate), sysOf(env));
  ok('볼 점이 5개 템플릿 모두에 있음', ['socratic', 'cer', 'advanced', 'debate', 'qna'].every((k) => typeof env.ctx.FEEDBACK_FOCUS_[k] === 'string' && env.ctx.FEEDBACK_FOCUS_[k].length > 10), Object.keys(env.ctx.FEEDBACK_FOCUS_));
}

// ───────── 4) AI 를 부르지 않는 경우 ─────────
{
  const env = makeEnv({ pin: PIN, accessCode: CODE });
  let r = fb(env, { history: [{ role: 'ai', text: '반가워요!' }] });
  ok('학생이 한 마디도 안 했으면 빈 피드백, AI 호출 없음', r.success === true && r.feedback === '' && r.skipped === 'empty' && env.calls.length === 0, r);
  r = fb(env, { history: 'not-an-array' });
  ok('이상한 기록 형식도 빈 피드백으로(멈추지 않음)', r.success === true && r.feedback === '' && env.calls.length === 0, r);
  // 금지어 3회 → 그날 차단된 모둠
  for (let i = 0; i < 3; i++) env.ctx.routeAction('processChatMessage', { accessCode: CODE, classValue: '1반', groupValue: '1모둠', topicValue: T1, userQuestion: '바보', history: [] });
  const calls = env.calls.length;
  r = fb(env);
  ok('금지어로 차단된 모둠은 피드백 없음(차단 안내가 마지막 말), AI 호출 없음', r.success === true && r.feedback === '' && r.skipped === 'blocked' && env.calls.length === calls, r);
}
{
  // AI 차단([강제차단]) 직후 10분 안
  const env = makeEnv({ pin: PIN, accessCode: CODE, geminiReply: (body) => (/마무리 피드백/.test(body.systemInstruction.parts[0].text) ? '좋았어요.' : '[강제차단] 그만') });
  env.ctx.routeAction('processChatMessage', { accessCode: CODE, classValue: '1반', groupValue: '1모둠', topicValue: T1, userQuestion: '아무말', history: [] });
  const calls = env.calls.length;
  const r = fb(env);
  ok('AI 차단 직후(10분 안)인 모둠도 피드백 없음', r.success === true && r.skipped === 'blocked' && env.calls.length === calls, r);
}

// ───────── 5) 모델 출력 다듬기 ─────────
{
  const long = '근거를 실험 결과로 든 점이 아주 좋았어요. 측정값을 표로 정리했으면 더 좋았을 거예요. 다음에는 왜 전압이 커지면 전류가 커지는지 과학 원리로 이유를 붙여 보고, 저항이 다른 경우에도 같은지 따져 보세요.';
  const env = makeEnv({ pin: PIN, accessCode: CODE, geminiReply: () => '**"' + long + '"**\n' });
  const r = fb(env);
  ok('긴 출력은 100자 이내로, 문장 끝에서 자름', r.success === true && r.feedback.length <= 100 && /[.!?]$/.test(r.feedback) && r.feedback.startsWith('근거를'), r.feedback);
  ok('마크다운 기호·따옴표·줄바꿈을 지움', !/[*"\n]/.test(r.feedback), r.feedback);
  const c = env.ctx.clampFeedback_;
  ok('문장 끝이 너무 앞(30자 미만)이면 99자 + … 로 자름', c('좋아요. ' + '가'.repeat(150)).length === 100 && c('좋아요. ' + '가'.repeat(150)).endsWith('…'), c('좋아요. ' + '가'.repeat(150)));
  ok('짧은 출력은 그대로, [강제차단] 태그는 지움', c('  잘했어요!  ') === '잘했어요!' && c('[강제차단] 잘했어요.') === '잘했어요.' && c('') === '' && c(null) === '', [c('  잘했어요!  '), c('[강제차단] 잘했어요.')]);
}
{
  const env = makeEnv({ pin: PIN, accessCode: CODE, geminiReply: () => '' });
  const r = fb(env);
  ok('AI 가 빈 답을 주면 실패로 알리고(학생 화면은 조용히 넘어감) 기록하지 않음', r.success === false && /피드백을 만들지 못했어요/.test(r.error), r);
}
{
  const env = makeEnv({ pin: PIN, accessCode: CODE, keyHandler: () => ({ code: 429, body: { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded for key AIzaSECRETSECRETSECRET' } } }) });
  const r = fb(env);
  ok('모든 키가 한도 소진이면 실패로 알리고 키 글자는 새지 않음', r.success === false && /사용 한도/.test(r.error) && !JSON.stringify(r).includes('AIza'), r);
}

// ───────── 6) 횟수 제한: 채팅과 같은 모둠 몫을 씀 ─────────
{
  const env = makeEnv({ pin: PIN, accessCode: CODE });
  let last = null;
  for (let i = 0; i < 21; i++) last = fb(env);
  ok('한 모둠이 1분에 20번 넘게 부르면 거절(채팅과 같은 제한)', last.success === false && /너무 빨라요/.test(last.error), last);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
