/* 결과 분석(메뉴 5)의 학급 → 탐구 주제 → 모둠 → 날짜 단추 선택 규칙.
 *
 * 화면(DOM)과 분리한 순수 함수라서 Node 에서 그대로 시험한다(tests/pick_logic.test.js). 화면은 여기서 받은 값을 그리기만 한다.
 * 입력: 교사가 정한 목록(lists)과 서버(getChatOverview)가 세어 준 기록 조합(combos).
 *   combos = [{ classValue, topicValue, groupValue, total(모든 기록), analyzable(평가 대상), last,
 *              dates: [{ date, total, analyzable }] }] 또는 null(알 수 없음: 옛 GAS·오류). dates 가 없으면(API v3 GAS) 날짜는 '모든 날짜' 하나뿐.
 * 날짜 단계: 같은 주제를 여러 날 했으면 날짜마다 단추가 생기고, 두 날 이상이면 '모든 날짜 함께'(ALL_DATES)도 생긴다.
 *   고를 수 있는 날짜 단추가 하나뿐이면 저절로 골라진다(대부분의 모둠은 하루만 하므로 단계가 늘어도 누를 일은 그대로).
 * 이름은 서버의 분석과 같은 규칙(앞뒤 공백만 뺀 정확 일치)으로 맞춘다 → 여기서 '기록 없음'이면 분석도 비어 있다.
 *
 * 단추 상태(state):
 *   ok       기록이 있고 평가할 수 있음 — 누를 수 있음
 *   empty    기록 없음 — 누를 수 없음
 *   excluded 기록은 있지만 모두 평가 제외(탐구 도우미 등) — 누를 수 없음
 *   unknown  기록 유무를 모름(combos 가 null) — 누를 수 있음
 */
(function (global) {
  'use strict';

  const norm = (s) => String(s == null ? '' : s).trim();
  const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };

  function uniq(list) {
    const seen = new Set(), out = [];
    (Array.isArray(list) ? list : []).forEach((v) => { const k = norm(v); if (k && !seen.has(k)) { seen.add(k); out.push(k); } });
    return out;
  }

  // lists = { classes, topics, groups }, combos = 배열 또는 null
  function build(lists, combos) {
    const known = Array.isArray(combos);
    const rows = known ? combos.map((c) => ({
      cls: norm(c && c.classValue), topic: norm(c && c.topicValue), group: norm(c && c.groupValue),
      total: num(c && c.total), analyzable: num(c && c.analyzable), last: String((c && c.last) || ''),
      dates: Array.isArray(c && c.dates)
        ? c.dates.map((d) => ({ date: norm(d && d.date), total: num(d && d.total), analyzable: num(d && d.analyzable) })).filter((d) => d.date && d.total > 0)
        : null
    })).filter((r) => r.cls && r.topic && r.group && r.total > 0) : [];
    const l = lists || {};
    return { known, lists: { classes: uniq(l.classes), topics: uniq(l.topics), groups: uniq(l.groups) }, rows };
  }

  // 목록에 있는 이름을 목록 순서대로 먼저, 그 뒤에 '목록에는 없지만 기록은 있는' 이름을 나타난 순서대로
  function names(listed, found) {
    const out = listed.map((value) => ({ value, offList: false }));
    const have = new Set(listed);
    found.forEach((v) => { if (!have.has(v)) { have.add(v); out.push({ value: v, offList: true }); } });
    return out;
  }

  function stateOf(idx, total, analyzable) {
    if (!idx.known) return 'unknown';
    if (total === 0) return 'empty';
    if (analyzable === 0) return 'excluded';
    return 'ok';
  }

  const rowsOf = (idx, f) => idx.rows.filter(f);

  function summarize(idx, rows) {
    let total = 0, analyzable = 0, last = '';
    const groups = new Set();
    rows.forEach((r) => {
      total += r.total; analyzable += r.analyzable;
      if (r.analyzable > 0) groups.add(r.group);
      if (r.last && r.last > last) last = r.last; // 'yyyy-MM-dd HH:mm' 은 글자 순서가 곧 시간 순서다
    });
    return { total, analyzable, groups: groups.size, last, state: stateOf(idx, total, analyzable) };
  }

  function option(idx, value, offList, rows) { return Object.assign({ value, offList }, summarize(idx, rows)); }

  const selectable = (o) => !!o && (o.state === 'ok' || o.state === 'unknown');

  function classOptions(idx) {
    const found = idx.rows.map((r) => r.cls);
    return names(idx.lists.classes, found).map((n) => option(idx, n.value, n.offList, rowsOf(idx, (r) => r.cls === n.value)));
  }
  function topicOptions(idx, cls) {
    const c = norm(cls);
    if (!c) return [];
    const found = rowsOf(idx, (r) => r.cls === c).map((r) => r.topic);
    return names(idx.lists.topics, found).map((n) => option(idx, n.value, n.offList, rowsOf(idx, (r) => r.cls === c && r.topic === n.value)));
  }
  function groupOptions(idx, cls, topic) {
    const c = norm(cls), t = norm(topic);
    if (!c || !t) return [];
    const found = rowsOf(idx, (r) => r.cls === c && r.topic === t).map((r) => r.group);
    return names(idx.lists.groups, found).map((n) => option(idx, n.value, n.offList, rowsOf(idx, (r) => r.cls === c && r.topic === t && r.group === n.value)));
  }

  // 날짜 단추: value 는 'yyyy-MM-dd', '모든 날짜 함께'는 ALL_DATES. 날짜를 모르면(옛 GAS·기록 유무 모름) ALL_DATES 하나뿐.
  const ALL_DATES = '*';
  function dateOptions(idx, cls, topic, group) {
    const c = norm(cls), t = norm(topic), g = norm(group);
    if (!c || !t || !g) return [];
    const all = (rows, st) => Object.assign({ value: ALL_DATES, all: true, offList: false }, summarize(idx, rows), st ? { state: st } : {});
    if (!idx.known) return [all([], 'unknown')];
    const rows = rowsOf(idx, (r) => r.cls === c && r.topic === t && r.group === g);
    if (!rows.length) return [];
    if (rows.some((r) => !r.dates)) return [all(rows)];
    const byDate = new Map();
    rows.forEach((r) => r.dates.forEach((d) => {
      const e = byDate.get(d.date) || { total: 0, analyzable: 0 };
      e.total += d.total; e.analyzable += d.analyzable; byDate.set(d.date, e);
    }));
    const out = [...byDate.keys()].sort().map((d) => {
      const e = byDate.get(d);
      return { value: d, all: false, offList: false, total: e.total, analyzable: e.analyzable, groups: 0, last: '', state: stateOf(idx, e.total, e.analyzable) };
    });
    if (out.length >= 2) out.push(all(rows));
    return out;
  }

  // 선택이 지금 데이터에서도 유효한지 앞에서부터 확인하고, 처음 어긋난 단계부터 뒤를 비운다.
  // 날짜는 고른 것이 없거나 사라졌을 때, 고를 수 있는 단추가 하나뿐이면 그것으로 채운다.
  function reconcile(idx, sel) {
    const s = { cls: norm(sel && sel.cls), topic: norm(sel && sel.topic), group: norm(sel && sel.group), date: norm(sel && sel.date) };
    const pick = (opts, v) => opts.find((o) => o.value === v);
    if (!selectable(pick(classOptions(idx), s.cls))) return { cls: '', topic: '', group: '', date: '' };
    if (!selectable(pick(topicOptions(idx, s.cls), s.topic))) return { cls: s.cls, topic: '', group: '', date: '' };
    if (!selectable(pick(groupOptions(idx, s.cls, s.topic), s.group))) return { cls: s.cls, topic: s.topic, group: '', date: '' };
    const dOpts = dateOptions(idx, s.cls, s.topic, s.group);
    if (!selectable(pick(dOpts, s.date))) {
      const can = dOpts.filter(selectable);
      s.date = can.length === 1 ? can[0].value : '';
    }
    return s;
  }

  // 분석 버튼은 네 단계(학급·주제·모둠·날짜)를 모두 고르고, 그 선택이 지금도 유효할 때만 켠다
  function canAnalyze(idx, sel) {
    const r = reconcile(idx, sel);
    return !!(r.cls && r.topic && r.group && r.date);
  }
  // 서버(teacherAnalyze)에 보낼 날짜: 모든 날짜면 빈 문자열
  const dateParam = (sel) => { const d = norm(sel && sel.date); return d === ALL_DATES ? '' : d; };

  global.ArguPick = { build, classOptions, topicOptions, groupOptions, dateOptions, reconcile, canAnalyze, selectable, dateParam, ALL_DATES };
})(typeof window !== 'undefined' ? window : globalThis);
