// 결과 분석(메뉴 5)의 학급 → 주제 → 모둠 단추 선택 규칙(public/js/pick-logic.js)을 DOM 없이 시험한다.
//   node tests/pick_logic.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { (cond ? pass++ : fail++); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  → ' + JSON.stringify(extra))); };

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'pick-logic.js'), 'utf8');
const win = {}; vm.createContext(win); win.window = win; vm.runInContext(src, win);
const P = win.ArguPick;
const plainAll = (v) => JSON.parse(JSON.stringify(v)); // vm 컨텍스트의 객체를 이쪽 객체로 바꿔 deepEqual 비교를 쉽게
const plain = (v) => { const o = plainAll(v); return o && typeof o === 'object' && 'date' in o && 'cls' in o ? { cls: o.cls, topic: o.topic, group: o.group } : o; }; // 학급·주제·모둠 세 단계만 (날짜는 아래 7) 에서 따로 시험)

const lists = { classes: ['1반', '2반', '3반'], topics: ['전류와 전압', '온도와 반응 속도', '원자력 발전'], groups: ['A1모둠', 'A2모둠', 'B1모둠'] };
const combos = [
  { classValue: '1반', topicValue: '전류와 전압', groupValue: 'A1모둠', total: 5, analyzable: 5, last: '2026-10-15 10:20' },
  { classValue: '1반', topicValue: '전류와 전압', groupValue: 'A2모둠', total: 2, analyzable: 0, last: '2026-10-15 09:00' }, // 탐구 도우미 대화뿐
  { classValue: '1반', topicValue: '온도와 반응 속도', groupValue: 'B1모둠', total: 3, analyzable: 3, last: '2026-10-14 15:00' },
  { classValue: '2반', topicValue: '전류와 전압', groupValue: 'A1모둠', total: 1, analyzable: 1, last: '2026-10-13 11:00' },
];
const idx = P.build(lists, combos);
const st = (opts) => Object.fromEntries(opts.map((o) => [o.value, o.state]));

// ───────── 1) 처음 상태: 학급만 보이고 뒤 단계는 아직 비어 있음 ─────────
ok('학급 단추는 교사가 정한 학급 목록 순서대로 만들어짐', P.classOptions(idx).map((o) => o.value).join() === '1반,2반,3반', P.classOptions(idx).map((o) => o.value));
ok('학급을 고르기 전에는 주제 단추가 없음(활성화될 대상이 없음)', P.topicOptions(idx, '').length === 0 && P.topicOptions(idx, '  ').length === 0, '');
ok('주제를 고르기 전에는 모둠 단추가 없음', P.groupOptions(idx, '1반', '').length === 0 && P.groupOptions(idx, '', '전류와 전압').length === 0, '');
ok('아무것도 안 고르면 분석 버튼은 꺼짐', P.canAnalyze(idx, {}) === false && P.canAnalyze(idx, null) === false && P.canAnalyze(idx, undefined) === false, '');

// ───────── 2) 학급 단추: 기록이 있는 학급만 누를 수 있음 ─────────
{
  const s = st(P.classOptions(idx));
  ok('기록이 있는 학급은 ok, 기록이 전혀 없는 학급은 empty(기록 없음)', s['1반'] === 'ok' && s['2반'] === 'ok' && s['3반'] === 'empty', s);
  const c1 = P.classOptions(idx)[0];
  ok('학급 단추가 기록 있는 모둠 수·건수·마지막 시각을 알려 줌(1반: 2모둠·평가 대상 8건·10-15 10:20)', c1.groups === 2 && c1.analyzable === 8 && c1.total === 10 && c1.last === '2026-10-15 10:20', plain(c1));
  ok('기록 없는 학급은 누를 수 없고 기록 있는 학급은 누를 수 있음', P.selectable(P.classOptions(idx)[2]) === false && P.selectable(c1) === true, '');
}

// ───────── 3) 학급을 고르면 주제 단추가 켜짐 ─────────
{
  const s1 = st(P.topicOptions(idx, '1반')), s2 = st(P.topicOptions(idx, '2반')), s3 = st(P.topicOptions(idx, '3반'));
  ok('1반: 기록 있는 주제 둘은 ok, 기록 없는 주제는 empty', s1['전류와 전압'] === 'ok' && s1['온도와 반응 속도'] === 'ok' && s1['원자력 발전'] === 'empty', s1);
  ok('2반: 전류와 전압만 ok (학급마다 따로 판단)', s2['전류와 전압'] === 'ok' && s2['온도와 반응 속도'] === 'empty' && s2['원자력 발전'] === 'empty', s2);
  ok('기록이 없는 학급은 주제가 모두 empty', Object.values(s3).every((v) => v === 'empty') && Object.keys(s3).length === 3, s3);
  ok('주제 단추는 주제 목록 순서대로', P.topicOptions(idx, '1반').map((o) => o.value).join() === lists.topics.join(), '');
}

// ───────── 4) 주제를 고르면 모둠 단추가 켜지고, 기록 없는 모둠은 "기록 없음" ─────────
{
  const g = P.groupOptions(idx, '1반', '전류와 전압'), s = st(g), by = Object.fromEntries(g.map((o) => [o.value, o]));
  ok('A1모둠은 ok(5건), A2모둠은 평가 제외, B1모둠은 기록 없음', s['A1모둠'] === 'ok' && s['A2모둠'] === 'excluded' && s['B1모둠'] === 'empty', s);
  ok('ok 모둠은 평가 대상 건수와 마지막 대화 시각을 가짐', by['A1모둠'].analyzable === 5 && by['A1모둠'].last === '2026-10-15 10:20', plain(by['A1모둠']));
  ok('평가 제외 모둠은 기록 건수(2)를 알려 주고, 누를 수는 있지만(기록 보기) 분석 대상은 아님', by['A2모둠'].total === 2 && by['A2모둠'].analyzable === 0 && P.selectable(by['A2모둠']) === true && P.analyzable(by['A2모둠']) === false, plain(by['A2모둠']));
  ok('기록 없는 모둠은 누를 수도 분석할 수도 없음', P.selectable(by['B1모둠']) === false && P.analyzable(by['B1모둠']) === false, plain(by['B1모둠']));
  ok('기록 없음 모둠은 누를 수 없음', P.selectable(by['B1모둠']) === false && by['B1모둠'].total === 0, plain(by['B1모둠']));
  const other = st(P.groupOptions(idx, '1반', '온도와 반응 속도'));
  ok('같은 학급이라도 주제가 다르면 모둠 상태가 따로임(온도 주제는 B1모둠만 ok)', other['B1모둠'] === 'ok' && other['A1모둠'] === 'empty' && other['A2모둠'] === 'empty', other);
  const noData = st(P.groupOptions(idx, '2반', '온도와 반응 속도'));
  ok('기록이 없는 학급·주제 조합은 모둠이 모두 기록 없음', Object.values(noData).every((v) => v === 'empty'), noData);
}

// ───────── 5) 순서대로 눌러 가는 흐름과 분석 버튼 ─────────
{
  let sel = { cls: '', topic: '', group: '' };
  ok('① 처음: 분석 버튼 꺼짐', !P.canAnalyze(idx, sel), '');
  sel = { cls: '1반', topic: '', group: '' };
  ok('② 학급만 고르면 분석 버튼은 아직 꺼져 있고 주제 단추가 켜짐', !P.canAnalyze(idx, sel) && P.topicOptions(idx, sel.cls).some(P.selectable), '');
  sel = { cls: '1반', topic: '전류와 전압', group: '' };
  ok('③ 주제까지 고르면 분석 버튼은 아직 꺼져 있고 모둠 단추가 켜짐', !P.canAnalyze(idx, sel) && P.groupOptions(idx, sel.cls, sel.topic).some(P.selectable), '');
  sel = { cls: '1반', topic: '전류와 전압', group: 'A1모둠' };
  ok('④ 기록 있는 모둠까지 고르면 분석 버튼이 켜짐', P.canAnalyze(idx, sel), '');
  ok('기록 없는 모둠(B1모둠)을 골랐다고 해도 분석 버튼은 켜지지 않음', !P.canAnalyze(idx, { cls: '1반', topic: '전류와 전압', group: 'B1모둠' }), '');
  ok('평가 제외 모둠(A2모둠)도 분석 버튼이 켜지지 않음', !P.canAnalyze(idx, { cls: '1반', topic: '전류와 전압', group: 'A2모둠' }), '');
  ok('기록 없는 학급·주제를 억지로 넣어도 분석 버튼은 꺼짐', !P.canAnalyze(idx, { cls: '3반', topic: '전류와 전압', group: 'A1모둠' }) && !P.canAnalyze(idx, { cls: '1반', topic: '원자력 발전', group: 'A1모둠' }), '');
  ok('목록·기록에 없는 이름은 분석 버튼이 켜지지 않음', !P.canAnalyze(idx, { cls: '9반', topic: '전류와 전압', group: 'A1모둠' }), '');
}

// ───────── 6) 기록이 바뀐 뒤(새로고침) 고른 값이 어긋나면 그 단계부터 비움 ─────────
{
  const sel = { cls: '1반', topic: '전류와 전압', group: 'A1모둠' };
  ok('그대로면 선택이 유지됨', JSON.stringify(plain(P.reconcile(idx, sel))) === JSON.stringify(sel), plain(P.reconcile(idx, sel)));
  // 1반의 A1모둠 기록만 사라지고, 같은 주제에 다른 모둠(B1모둠)의 기록이 남아 있는 경우
  const noGroup = P.build(lists, combos.filter((c) => c.groupValue !== 'A1모둠' || c.classValue !== '1반').concat([{ classValue: '1반', topicValue: '전류와 전압', groupValue: 'B1모둠', total: 1, analyzable: 1, last: '' }]));
  ok('고른 모둠의 기록이 사라지면 모둠만 비워지고 학급·주제는 유지', JSON.stringify(plain(P.reconcile(noGroup, sel))) === JSON.stringify({ cls: '1반', topic: '전류와 전압', group: '' }), plain(P.reconcile(noGroup, sel)));
  const onlyExcluded = P.build(lists, combos.filter((c) => !(c.classValue === '1반' && c.topicValue === '전류와 전압' && c.groupValue === 'A1모둠')));
  ok('고른 모둠의 기록이 평가 제외만 남으면, 선택은 기록 보기용으로 남되(주제 단추는 평가 제외 표시) 분석 버튼은 꺼짐', JSON.stringify(plain(P.reconcile(onlyExcluded, sel))) === JSON.stringify({ cls: '1반', topic: '전류와 전압', group: '' }) && P.topicOptions(onlyExcluded, '1반').find((o) => o.value === '전류와 전압').state === 'excluded' && !P.canAnalyze(onlyExcluded, { cls: '1반', topic: '전류와 전압', group: 'A2모둠' }) && P.canView(onlyExcluded, { cls: '1반', topic: '전류와 전압', group: 'A2모둠' }), plain(P.reconcile(onlyExcluded, sel)));
  const noTopic = P.build(lists, combos.filter((c) => !(c.classValue === '1반' && c.topicValue === '전류와 전압')));
  ok('고른 주제의 기록이 사라지면 주제·모둠이 비워지고 학급은 유지', JSON.stringify(plain(P.reconcile(noTopic, sel))) === JSON.stringify({ cls: '1반', topic: '', group: '' }), plain(P.reconcile(noTopic, sel)));
  const noClass = P.build(lists, combos.filter((c) => c.classValue !== '1반'));
  ok('고른 학급의 기록이 사라지면 전부 비워짐', JSON.stringify(plain(P.reconcile(noClass, sel))) === JSON.stringify({ cls: '', topic: '', group: '' }), plain(P.reconcile(noClass, sel)));
}

// ───────── 7) 목록에는 없지만 기록은 있는 이름도 누를 수 있음(옛 목록·이름 변경) ─────────
{
  const extra = combos.concat([
    { classValue: '4반', topicValue: '옛 주제', groupValue: '옛모둠', total: 2, analyzable: 2, last: '2026-09-01 10:00' },
    { classValue: '1반', topicValue: '전류와 전압', groupValue: '새모둠', total: 1, analyzable: 1, last: '2026-10-15 11:00' },
  ]);
  const i2 = P.build(lists, extra);
  const cl = P.classOptions(i2), gr = P.groupOptions(i2, '1반', '전류와 전압');
  ok('목록에 없는 학급 기록도 학급 단추로 뒤에 붙음(offList)', cl.map((o) => o.value).join() === '1반,2반,3반,4반' && cl[3].offList === true && cl[3].state === 'ok' && cl[0].offList === false, plain(cl));
  ok('목록에 없는 모둠 기록도 모둠 단추로 뒤에 붙음', gr.map((o) => o.value).join() === 'A1모둠,A2모둠,B1모둠,새모둠' && gr[3].offList === true && gr[3].state === 'ok', plain(gr));
  ok('그 단추로도 분석 버튼을 켤 수 있음', P.canAnalyze(i2, { cls: '4반', topic: '옛 주제', group: '옛모둠' }), '');
}

// ───────── 8) 이름 비교는 분석과 같은 규칙: 앞뒤 공백만 무시한 정확 일치 ─────────
{
  const i3 = P.build({ classes: [' 1반 ', '1반'], topics: ['전류와 전압'], groups: ['A1모둠'] }, [{ classValue: ' 1반', topicValue: '전류와 전압 ', groupValue: ' A1모둠 ', total: 1, analyzable: 1, last: '' }]);
  ok('앞뒤 공백은 무시하고 목록의 중복은 합쳐짐', P.classOptions(i3).length === 1 && P.classOptions(i3)[0].state === 'ok' && P.groupOptions(i3, '1반', '전류와 전압')[0].state === 'ok', plain(P.classOptions(i3)));
  const i4 = P.build({ classes: ['1반'], topics: ['전류와 전압'], groups: ['A1모둠'] }, [{ classValue: '1반', topicValue: '전류와  전압', groupValue: 'A1모둠', total: 1, analyzable: 1, last: '' }]);
  const t4 = P.topicOptions(i4, '1반');
  ok('안쪽 공백이 다른 이름은 다른 주제(분석도 정확 일치라 서로 다른 기록)', t4.length === 2 && t4[0].state === 'empty' && t4[1].state === 'ok' && t4[1].offList === true, plain(t4));
  const i5 = P.build({ classes: ['1반'], topics: ['Topic'], groups: ['A'] }, [{ classValue: '1반', topicValue: 'topic', groupValue: 'A', total: 1, analyzable: 1, last: '' }]);
  ok('영문 대소문자도 정확 일치(분석과 같음)', P.topicOptions(i5, '1반').find((o) => o.value === 'Topic').state === 'empty', plain(P.topicOptions(i5, '1반')));
}

// ───────── 9) 기록 유무를 모를 때(옛 GAS·오류): 막지 않고 목록만 보여 줌 ─────────
{
  const u = P.build(lists, null);
  ok('combos 가 null 이면 모든 단추가 unknown(누를 수 있음)', P.classOptions(u).every((o) => o.state === 'unknown' && P.selectable(o)) && P.topicOptions(u, '1반').every((o) => o.state === 'unknown') && P.groupOptions(u, '1반', '전류와 전압').every((o) => o.state === 'unknown'), '');
  ok('기록 유무를 모를 때도 세 단계를 고르면 분석 버튼이 켜짐(예전처럼 서버가 판단)', P.canAnalyze(u, { cls: '2반', topic: '원자력 발전', group: 'B1모둠' }), '');
  ok('모를 때도 단계 순서는 지킴(학급 없이는 주제 단추 없음)', P.topicOptions(u, '').length === 0 && !P.canAnalyze(u, { cls: '', topic: '원자력 발전', group: 'B1모둠' }), '');
  ok('빈 배열은 "기록이 하나도 없음"(모름과 다름): 모두 empty', P.classOptions(P.build(lists, [])).every((o) => o.state === 'empty'), '');
}

// ───────── 10) 엉터리 입력에도 멈추지 않음 ─────────
{
  let err = null, res;
  try {
    const bad = P.build({ classes: null, topics: 'x', groups: [null, undefined, '', 3] }, [null, undefined, {}, { classValue: '1반' }, { classValue: '1반', topicValue: 't', groupValue: 'g', total: -4, analyzable: 'abc' }, { classValue: '1반', topicValue: 't', groupValue: 'g', total: '3', analyzable: '2.9', last: 7 }]);
    res = { c: plain(P.classOptions(bad)), g: plain(P.groupOptions(bad, '1반', 't')) };
  } catch (e) { err = e.message; }
  ok('null·빈 객체·음수·문자열 숫자가 섞여도 예외 없이 처리됨', err === null && res.c.length === 1 && res.g.length === 2, [err, res]);
  ok('문자열 숫자는 정수로 읽고(3건·평가 2건) 음수·잘못된 값은 0 으로 봄', res && res.g.find((o) => o.value === 'g').total === 3 && res.g.find((o) => o.value === 'g').analyzable === 2, res && res.g);
  ok('lists 가 없어도 기록만으로 단추가 만들어짐', P.classOptions(P.build(undefined, combos)).map((o) => o.value).join() === '1반,2반', '');
  ok('build 가 입력 배열을 바꾸지 않음', (() => { const c = JSON.stringify(combos), l = JSON.stringify(lists); P.build(lists, combos); return c === JSON.stringify(combos) && l === JSON.stringify(lists); })(), '');
}

// ───────── 7) 날짜 단계: 같은 주제를 여러 날 했을 때 날짜마다 따로 분석 ─────────
{
  const D = [
    { classValue: '1반', topicValue: '원자력 발전', groupValue: 'A1모둠', total: 14, analyzable: 13, last: '2026-10-22 11:15',
      dates: [{ date: '2026-10-15', total: 11, analyzable: 11 }, { date: '2026-10-22', total: 3, analyzable: 2 }] },
    { classValue: '1반', topicValue: '원자력 발전', groupValue: 'A2모둠', total: 4, analyzable: 4, last: '2026-10-15 10:00', dates: [{ date: '2026-10-15', total: 4, analyzable: 4 }] },
    { classValue: '1반', topicValue: '원자력 발전', groupValue: 'B1모둠', total: 3, analyzable: 2, last: '2026-10-16 10:00',
      dates: [{ date: '2026-10-15', total: 1, analyzable: 0 }, { date: '2026-10-16', total: 2, analyzable: 2 }] },
  ];
  const di = P.build(lists, D);
  const opts = P.dateOptions(di, '1반', '원자력 발전', 'A1모둠');
  ok('날짜가 둘이면 날짜 단추 두 개(날짜순) + 모든 날짜 함께', opts.map((o) => o.value).join() === '2026-10-15,2026-10-22,' + P.ALL_DATES && opts[2].all === true, plainAll(opts));
  ok('날짜 단추는 그날의 평가 대상 건수를 가짐', opts[0].analyzable === 11 && opts[1].analyzable === 2 && opts[2].analyzable === 13, opts.map((o) => o.analyzable));
  ok('모둠까지만 고르면(날짜가 둘) 분석 버튼은 아직 꺼짐', !P.canAnalyze(di, { cls: '1반', topic: '원자력 발전', group: 'A1모둠' }) && plainAll(P.reconcile(di, { cls: '1반', topic: '원자력 발전', group: 'A1모둠' })).date === '', '');
  ok('날짜를 고르면 분석 버튼이 켜지고 그 날짜가 서버로 감', P.canAnalyze(di, { cls: '1반', topic: '원자력 발전', group: 'A1모둠', date: '2026-10-22' }) && P.dateParam({ date: '2026-10-22' }) === '2026-10-22', '');
  ok('모든 날짜 함께를 고르면 서버에는 빈 날짜(전체)가 감', P.canAnalyze(di, { cls: '1반', topic: '원자력 발전', group: 'A1모둠', date: P.ALL_DATES }) && P.dateParam({ date: P.ALL_DATES }) === '' && P.dateParam({}) === '', '');
  ok('하루만 한 모둠은 날짜가 저절로 골라져 세 단계만으로 분석 버튼이 켜짐', P.canAnalyze(di, { cls: '1반', topic: '원자력 발전', group: 'A2모둠' }) && plainAll(P.reconcile(di, { cls: '1반', topic: '원자력 발전', group: 'A2모둠' })).date === '2026-10-15' && P.dateOptions(di, '1반', '원자력 발전', 'A2모둠').length === 1, P.dateOptions(di, '1반', '원자력 발전', 'A2모둠').map((o) => o.value));
  const b1 = P.dateOptions(di, '1반', '원자력 발전', 'B1모둠');
  ok('평가 제외 대화뿐인 날짜도 누를 수 있지만(기록 보기) 분석 대상은 아님, 나머지 하루와 모든 날짜 함께는 분석 가능', b1.find((o) => o.value === '2026-10-15').state === 'excluded' && P.selectable(b1[0]) && !P.analyzable(b1[0]) && P.analyzable(b1[1]) && P.analyzable(b1[2]), plainAll(b1).map((o) => [o.value, o.state]));
  ok('고를 수 있는 단추가 둘이면(하루 + 전체) 저절로 고르지 않음', plainAll(P.reconcile(di, { cls: '1반', topic: '원자력 발전', group: 'B1모둠' })).date === '', '');
  ok('평가 제외 날짜를 억지로 넣어도 분석 버튼은 꺼짐', !P.canAnalyze(di, { cls: '1반', topic: '원자력 발전', group: 'B1모둠', date: '2026-10-15' }), '');
  ok('없는 날짜는 비워지고 학급·주제·모둠은 유지', JSON.stringify(plainAll(P.reconcile(di, { cls: '1반', topic: '원자력 발전', group: 'A1모둠', date: '2026-01-01' }))) === JSON.stringify({ cls: '1반', topic: '원자력 발전', group: 'A1모둠', date: '' }), '');
  ok('모둠을 바꾸면 날짜도 새 모둠 기준으로 다시 정해짐', plainAll(P.reconcile(di, { cls: '1반', topic: '원자력 발전', group: 'A2모둠', date: '2026-10-22' })).date === '2026-10-15', '');
  ok('모둠을 고르기 전에는 날짜 단추가 없음', P.dateOptions(di, '1반', '원자력 발전', '').length === 0, '');
  // 옛 GAS(API v3: dates 없음)와 기록 유무를 모를 때: 날짜 단계는 '모든 날짜' 하나로 저절로 골라져 예전처럼 분석할 수 있다
  const old = P.build(lists, combos);
  ok('dates 를 주지 않는 옛 GAS 는 모든 날짜 하나뿐이고 저절로 골라짐', P.dateOptions(old, '1반', '전류와 전압', 'A1모둠').map((o) => o.value).join() === P.ALL_DATES && plainAll(P.reconcile(old, { cls: '1반', topic: '전류와 전압', group: 'A1모둠' })).date === P.ALL_DATES, '');
  const unk = P.build(lists, null);
  ok('기록 유무를 모를 때도 모든 날짜 하나로 분석 가능', P.dateOptions(unk, '2반', '원자력 발전', 'B1모둠')[0].state === 'unknown' && P.canAnalyze(unk, { cls: '2반', topic: '원자력 발전', group: 'B1모둠' }), '');
  ok('날짜 칸이 이상한 값이면 건너뜀(깨지지 않음)', P.dateOptions(P.build(lists, [{ classValue: '1반', topicValue: 't', groupValue: 'g', total: 1, analyzable: 1, dates: [null, { date: '', total: 1 }, { date: '2026-10-15', total: 1, analyzable: 1 }] }]), '1반', 't', 'g').map((o) => o.value).join() === '2026-10-15', '');
}

// ───────── 8) 대화 기록 보기: 평가 제외 대화도 볼 수 있고, 분석은 평가할 대화가 있을 때만 ─────────
{
  const sel = { cls: '1반', topic: '전류와 전압', group: 'A2모둠' }; // 탐구 도우미 대화뿐(평가 제외 2건)
  ok('평가 제외 모둠을 고르면 기록 보기는 켜지고 분석은 꺼짐', P.canView(idx, sel) && !P.canAnalyze(idx, sel), plainAll(P.reconcile(idx, sel)));
  ok('평가 대상 모둠은 기록 보기와 분석 모두 켜짐', P.canView(idx, { cls: '1반', topic: '전류와 전압', group: 'A1모둠' }) && P.canAnalyze(idx, { cls: '1반', topic: '전류와 전압', group: 'A1모둠' }), '');
  ok('기록 없는 모둠은 기록 보기도 꺼짐', !P.canView(idx, { cls: '1반', topic: '전류와 전압', group: 'B1모둠' }), '');
  const only = P.build(lists, [{ classValue: '3반', topicValue: '원자력 발전', groupValue: 'B1모둠', total: 7, analyzable: 0, last: '', dates: [{ date: '2026-10-20', total: 7, analyzable: 0 }] }]);
  ok('평가 제외 대화뿐인 학급·주제도 단추로 끝까지 고를 수 있음(스크린샷의 "평가 제외 7건")', P.selectable(P.classOptions(only).find((o) => o.value === '3반')) && P.selectable(P.topicOptions(only, '3반').find((o) => o.value === '원자력 발전')) && P.canView(only, { cls: '3반', topic: '원자력 발전', group: 'B1모둠' }) && !P.canAnalyze(only, { cls: '3반', topic: '원자력 발전', group: 'B1모둠' }), P.topicOptions(only, '3반').map((o) => [o.value, o.state]));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
