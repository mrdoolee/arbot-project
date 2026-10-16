// getChatOverview(결과 분석의 학급 → 주제 → 모둠 단추가 쓰는 기록 집계): (1) 교사 전용·읽기 전용인지 (2) 기록을 올바르게 세는지
// (3) 분석(teacherAnalyze)과 같은 규칙인지 — 단추가 "기록 있음"이면 분석이 성공하고 "기록 없음"이면 분석도 비어 있어야 한다.
//   node tests/gas_chat_overview.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeEnv } = require('./gas_harness.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { (cond ? pass++ : fail++); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  → ' + JSON.stringify(extra).slice(0, 500))); };

const PIN = 'teacher-pass-1', CODE = 'K7M2QX';
const T1 = '전류와 전압의 관계', T2 = '온도와 반응 속도', T3 = '원자력 발전';
const RAW = /Cannot read properties|is not a function|TypeError|ReferenceError/i;
const snapshot = (e) => JSON.stringify([Object.keys(e.sheets), Object.values(e.sheets).map((s) => s.rows), [...e.props.entries()], [...e.cache.entries()], e.urls.length, e.calls.length]);

function fresh(opts) {
  const e = makeEnv(Object.assign({ pin: PIN, accessCode: CODE }, opts || {}));
  e.sheets['기본설정'].rows[1][1] = '1반, 2반, 3반'; e.sheets['기본설정'].rows[2][1] = 'A1모둠, A2모둠, B1모둠'; e.sheets['기본설정'].rows[3][1] = `${T1}, ${T2}, ${T3}`;
  e.ctx.ensureProfileTabs_();
  return e;
}
const overview = (e, extra) => e.ctx.routeAction('getChatOverview', Object.assign({ pin: PIN }, extra || {}));
const rec = (e, date, time, cls, grp, topic, persona, rubric) => e.sheets['채팅기록'].rows.push([date, time, cls, grp, topic, '학생 말', 'AI 말', persona, rubric]);
const find = (r, c, t, g) => (r.data.combos || []).find((x) => x.classValue === c && x.topicValue === t && x.groupValue === g);

// ───────── 1) 교사 전용 ─────────
{
  const e = fresh();
  ok('getChatOverview 는 교사 전용 목록에 있고 학생 입구 목록에는 없음', e.ctx.TEACHER_ACTIONS_.includes('getChatOverview') && !e.ctx.STUDENT_ACTIONS_.includes('getChatOverview'), '');
  const noPin = e.ctx.routeAction('getChatOverview', {}), wrongPin = e.ctx.routeAction('getChatOverview', { pin: 'wrong-pass-123' }), byCode = e.ctx.routeAction('getChatOverview', { accessCode: CODE });
  ok('비밀번호 없이·틀린 비밀번호·수업 입장 코드만으로는 열리지 않음(대화 기록 존재 여부도 새지 않음)', [noPin, wrongPin, byCode].every((r) => r.success === false && !r.data), [noPin, wrongPin, byCode]);
  const noSetup = makeEnv({}).ctx.routeAction('getChatOverview', {});
  ok('비밀번호를 아직 안 정한 시트도 열리지 않음(needSetup)', noSetup.success === false && noSetup.needSetup === true, noSetup);
  ok('맞는 비밀번호면 열림', overview(e).success === true && Array.isArray(overview(e).data.combos), overview(e));
  ok('API 버전이 올라가 있음(콘솔이 새 action 을 쓰므로 함께 올려야 함)', e.ctx.API_VERSION_ >= 3, e.ctx.API_VERSION_);
}

// ───────── 2) 세기 ─────────
{
  const e = fresh();
  rec(e, '2026-10-15', '10:00', '1반', 'A1모둠', T1, 'socratic', '기본');
  rec(e, '2026-10-15', '10:05', '1반', 'A1모둠', T1, 'socratic', '기본');
  rec(e, '2026-10-15', '10:20', '1반', 'A1모둠', T1, 'socratic', '');            // 루브릭 이름이 빈 옛 기록은 평가 대상
  rec(e, '2026-10-15', '09:00', '1반', 'A2모둠', T1, 'qna', '-');                // 탐구 도우미 대화(평가 제외)
  rec(e, '2026-10-15', '09:10', '1반', 'A2모둠', T1, '', '-');                    // 루브릭 '없음'으로 진행(평가 제외)
  rec(e, '2026-10-14', '15:00', '1반', 'B1모둠', T2, 'qna', '');                  // 옛 기록: H 열 qna 만 있어도 평가 제외
  rec(e, '2026-10-13', '11:00', '2반', 'A1모둠', T1, 'socratic', '기본');
  const r = overview(e), c = r.data.combos;
  ok('조합마다 한 줄로 묶이고 순서는 처음 나타난 순서', c.length === 4 && c.map((x) => x.groupValue).join() === 'A1모둠,A2모둠,B1모둠,A1모둠', c.map((x) => [x.classValue, x.groupValue]));
  const a1 = find(r, '1반', T1, 'A1모둠');
  ok('1반·T1·A1모둠: 기록 3건, 평가 대상 3건, 마지막 대화는 가장 아래 줄', a1.total === 3 && a1.analyzable === 3 && a1.last === '2026-10-15 10:20', a1);
  const a2 = find(r, '1반', T1, 'A2모둠');
  ok('평가 제외(qna·"-")만 있는 모둠은 기록 2건이지만 평가 대상 0건', a2.total === 2 && a2.analyzable === 0, a2);
  const b1 = find(r, '1반', T2, 'B1모둠');
  ok('옛 기록처럼 H 열만 qna 이고 I 열이 비어도 평가 제외로 셈(분석과 같은 기준)', b1.total === 1 && b1.analyzable === 0, b1);
  ok('같은 모둠 이름이라도 학급이 다르면 따로 셈', find(r, '2반', T1, 'A1모둠').total === 1 && find(r, '1반', T1, 'A1모둠').total === 3, c);
  ok('기록이 없는 조합은 아예 나오지 않음(화면이 없는 것을 "기록 없음"으로 봄)', !find(r, '3반', T1, 'A1모둠') && !find(r, '1반', T3, 'A1모둠'), c);
}

// ───────── 3) 이름 규칙: 앞뒤 공백만 무시한 정확 일치(분석과 같음) ─────────
{
  const e = fresh();
  rec(e, '2026-10-15', '10:00', ' 1반 ', 'A1모둠 ', ` ${T1}`, 'socratic', '기본');
  rec(e, '2026-10-15', '10:05', '1반', 'A1모둠', T1, 'socratic', '기본');
  rec(e, '2026-10-15', '10:06', '1반', 'a1모둠', T1, 'socratic', '기본');           // 대소문자가 다르면 다른 모둠
  rec(e, '2026-10-15', '10:07', '1반', 'A1모둠', '전류와  전압의 관계', 'socratic', '기본'); // 안쪽 공백이 다르면 다른 주제
  const r = overview(e), c = r.data.combos;
  ok('앞뒤 공백만 다른 이름은 한 조합으로 합쳐지고 이름은 공백이 정리된 채 나옴', find(r, '1반', T1, 'A1모둠') && find(r, '1반', T1, 'A1모둠').total === 2, c);
  ok('대소문자·안쪽 공백이 다른 이름은 별개 조합', c.length === 3 && !!find(r, '1반', T1, 'a1모둠') && !!find(r, '1반', '전류와  전압의 관계', 'A1모둠'), c);
}

// ───────── 4) 지저분한 시트 ─────────
{
  const e = fresh();
  rec(e, '2026-10-15', '10:00', '', 'A1모둠', T1, 'socratic', '기본');   // 학급 칸이 빈 줄
  rec(e, '2026-10-15', '10:00', '1반', '', T1, 'socratic', '기본');       // 모둠 칸이 빈 줄
  rec(e, '2026-10-15', '10:00', '1반', 'A1모둠', '', 'socratic', '기본'); // 주제 칸이 빈 줄
  e.sheets['채팅기록'].rows.push(['2026-10-15', '10:00', '2반', 'A1모둠', T1]);   // 뒤 칸이 짧은 줄
  e.sheets['채팅기록'].rows.push([]);                                            // 완전히 빈 줄
  e.sheets['채팅기록'].rows.push(['2026-10-15', '10:00', 7, 8, 9, 'x']);           // 숫자 칸(손으로 고친 값)
  const r = overview(e);
  ok('빈 칸·짧은 줄·빈 줄·숫자 칸이 섞여도 멈추지 않고 쓸 수 있는 줄만 셈', r.success === true && r.data.combos.length === 2 && !!find(r, '2반', T1, 'A1모둠') && !!find(r, '7', '9', '8'), r);
  ok('칸이 짧아 H·I 열이 없는 줄은 평가 대상으로 셈', find(r, '2반', T1, 'A1모둠').analyzable === 1, find(r, '2반', T1, 'A1모둠'));
  const header = makeEnv({ pin: PIN, accessCode: CODE });
  ok('머리글만 있는 빈 기록도 정상(조합 없음)', overview(header).success === true && overview(header).data.combos.length === 0, overview(header));
  const gone = fresh(); delete gone.sheets['채팅기록'];
  const g = overview(gone);
  ok("'채팅기록' 탭이 없으면 탭 이름이 든 안내로 실패함(내부 오류 문구 없음)", g.success === false && /'채팅기록' 탭/.test(g.error) && !RAW.test(g.error), g);
}

// ───────── 5) 실제 시트처럼 날짜·시간이 Date 로 읽히는 경우 ─────────
{
  const e = fresh();
  const D = vm.runInContext('Date', e.ctx); // 이 컨텍스트의 Date (밖에서 만든 Date 는 instanceof 가 맞지 않아 시험이 무의미해진다)
  e.sheets['채팅기록'].rows.push([new D(2026, 9, 15), new D(1899, 11, 30, 10, 20), '1반', 'A1모둠', T1, 'q', 'a', 'socratic', '기본']);
  e.sheets['채팅기록'].rows.push([new D(2026, 9, 16), new D(1899, 11, 30, 9, 5), '1반', 'A1모둠', T1, 'q', 'a', 'socratic', '기본']);
  const r = overview(e), a = find(r, '1반', T1, 'A1모둠');
  ok('날짜·시간 칸이 Date 여도 마지막 대화 시각이 "yyyy-MM-dd HH:mm" 글자로 나옴', a && a.total === 2 && a.last === '2026-10-16 09:05', a);
  ok('응답이 JSON 으로 그대로 직렬화됨(Date 객체가 섞여 있지 않음)', (() => { try { return JSON.parse(JSON.stringify(r)).data.combos[0].last === '2026-10-16 09:05'; } catch (err) { return false; } })(), '');
}

// ───────── 6) 읽기 전용·성능 ─────────
{
  const e = fresh();
  for (let i = 0; i < 6000; i++) rec(e, '2026-10-15', '10:00', ['1반', '2반', '3반'][i % 3], ['A1모둠', 'A2모둠', 'B1모둠'][i % 3], [T1, T2, T3][(i >> 2) % 3], 'socratic', '기본');
  let formats = 0; const orig = e.ctx.Utilities.formatDate; e.ctx.Utilities.formatDate = (...a) => { formats++; return orig(...a); };
  const before = snapshot(e), t0 = Date.now(), r = overview(e), ms = Date.now() - t0;
  ok('6000줄 기록도 한 번에 세고 시트·속성·캐시를 바꾸지 않으며 Gemini 도 부르지 않음', r.success && before === snapshot(e) && ms < 2000, [ms, r.success]);
  ok('시각 서식은 조합마다 한 번만 만듦(기록이 많아도 느려지지 않게)', formats <= r.data.combos.length * 2, [formats, r.data.combos.length]);
  ok('전체 기록 수와 조합별 합이 같음(빠뜨리거나 중복해서 세지 않음)', r.data.combos.reduce((n, x) => n + x.total, 0) === 6000, r.data.combos.reduce((n, x) => n + x.total, 0));
}

// ───────── 7) 실제 대화로 만든 기록 + 분석과의 일치 ─────────
{
  const e = fresh();
  const chat = (cls, grp, topic, q) => e.ctx.routeAction('processChatMessage', { accessCode: CODE, classValue: cls, groupValue: grp, topicValue: topic, userQuestion: q || '질문입니다', history: [] });
  const sent = [chat('1반', 'A1모둠', T1), chat('1반', 'A1모둠', T1, '두 번째 질문'), chat('2반', 'B1모둠', T2)];
  ok('(준비) 실제 대화 3건이 기록됨', sent.every((x) => x.success), sent.map((x) => x.error));
  const r = overview(e);
  ok('실제 대화로 쌓인 기록이 조합별로 셈: 1반·A1모둠·T1=2건, 2반·B1모둠·T2=1건', find(r, '1반', T1, 'A1모둠').total === 2 && find(r, '2반', T2, 'B1모둠').total === 1 && r.data.combos.length === 2, r.data.combos);

  // 분석과의 일치: 목록의 모든 (학급, 주제, 모둠) 조합에서 단추 상태와 분석 결과가 같아야 한다
  const win = {}; vm.createContext(win); win.window = win;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'pick-logic.js'), 'utf8'), win);
  // 평가 제외 대화·루브릭 이름이 빈 옛 기록·이름이 공백으로 어긋난 기록도 섞는다
  rec(e, '2026-10-12', '09:00', '3반', 'A2모둠', T3, 'qna', '-');
  rec(e, '2026-10-12', '09:05', ' 3반', 'A1모둠 ', T3, 'socratic', '');
  const ov = overview(e).data.combos;
  const idx = win.ArguPick.build({ classes: ['1반', '2반', '3반'], topics: [T1, T2, T3], groups: ['A1모둠', 'A2모둠', 'B1모둠'] }, ov);
  const mismatches = [], seen = { ok: 0, empty: 0, excluded: 0 };
  for (const cls of ['1반', '2반', '3반']) for (const topic of [T1, T2, T3]) {
    for (const g of win.ArguPick.groupOptions(idx, cls, topic)) {
      const an = e.ctx.routeAction('teacherAnalyze', { pin: PIN, classValue: cls, groupValue: g.value, topicValue: topic });
      const wantOk = g.state === 'ok';
      seen[g.state] = (seen[g.state] || 0) + 1;
      if (an.success !== wantOk) mismatches.push([cls, topic, g.value, g.state, an.success, an.error]);
      else if (wantOk && an.utterances.length !== g.analyzable) mismatches.push([cls, topic, g.value, '발언 수', an.utterances.length, g.analyzable]);
    }
  }
  ok('모든 조합에서 단추가 "ok"일 때만 분석이 성공하고, 분석된 발언 수 = 단추의 평가 대상 건수', mismatches.length === 0, mismatches);
  ok('(검증 범위) ok·empty·excluded 세 상태가 모두 실제로 시험됨', seen.ok >= 3 && seen.empty >= 20 && seen.excluded >= 1, seen);
  const t3 = win.ArguPick.topicOptions(idx, '3반').find((o) => o.value === T3);
  ok('3반의 T3 은 평가 가능한 기록(A1모둠)이 있어 주제 단추가 켜지고, 모둠 A2는 평가 제외로 막힘', t3.state === 'ok' && win.ArguPick.groupOptions(idx, '3반', T3).find((o) => o.value === 'A2모둠').state === 'excluded', JSON.parse(JSON.stringify(t3)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
