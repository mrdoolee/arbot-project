// 스프레드시트 메뉴 '📖 사용 가이드'(Guide.html): (1) 메뉴가 만들어지고 창이 뜨는지 (2) 순수 안내문이라 시트·설정·키를 건드리지 않는지
// (3) 웹으로 부를 수 없는지 (4) 안내문의 '시트 구조' 설명이 코드가 실제로 쓰는 탭 이름·머리글·칸 주소와 어긋나지 않는지.
//   node tests/gas_guide.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeEnv } = require('./gas_harness.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { (cond ? pass++ : fail++); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  → ' + JSON.stringify(extra))); };

const PIN = 'teacher-pass-1', CODE = 'K7M2QX';
const GUIDE = fs.readFileSync(path.join(__dirname, '..', 'gas-source', 'Guide.html'), 'utf8');
const text = GUIDE.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&'); // 사람이 읽는 글만
const snapshot = (e) => JSON.stringify([Object.keys(e.sheets), Object.values(e.sheets).map((s) => s.rows), [...e.props.entries()], [...e.cache.entries()], e.urls.length]);

// ───────── 1) 메뉴 ─────────
const env = makeEnv({ pin: PIN, accessCode: CODE });
env.ctx.onOpen();
const menu = env.ui.menus[0];
const items = menu ? menu.items.filter((i) => !i.separator) : [];
ok('열 때 메뉴가 하나 만들어지고 이름이 🗣️ 아르봇(ARBOT)', env.ui.menus.length === 1 && menu.name === '🗣️ 아르봇(ARBOT)', env.ui.menus.map((m) => m.name));
ok("메뉴에 '📖 사용 가이드' → showGuide_ 가 있음", items.some((i) => i.label === '📖 사용 가이드' && i.fn === 'showGuide_'), items);
ok('사용 가이드가 메뉴 맨 위(정보보다 앞)', items[0] && items[0].label === '📖 사용 가이드' && items[1] && items[1].label === 'ℹ️ 정보', items.slice(0, 2));
ok('메뉴가 부르는 함수는 모두 실제로 있음(오타 방지)', items.every((i) => typeof env.ctx[i.fn] === 'function'), items.filter((i) => typeof env.ctx[i.fn] !== 'function'));
ok('메뉴 이름이 겹치지 않음', new Set(items.map((i) => i.label)).size === items.length, items.map((i) => i.label));

// ───────── 2) 창 띄우기: 읽기 전용 ─────────
{
  const e = makeEnv({ pin: PIN, accessCode: CODE });
  e.ctx.ensureProfileTabs_();
  const before = snapshot(e);
  e.ctx.showGuide_();
  const after = snapshot(e);
  const d = e.ui.dialogs;
  ok('가이드 창이 하나 뜸(시트를 보며 읽도록 모달리스)', d.length === 1 && d[0].kind === 'modeless', d.map((x) => x.kind));
  ok('창 제목에 사용 가이드가 들어 있음', d[0] && /사용 가이드/.test(d[0].title), d[0] && d[0].title);
  ok('창 내용이 Guide.html 그대로이고 크기가 정해져 있음', d[0] && d[0].out.name === 'Guide' && d[0].out.content === GUIDE && d[0].out.width >= 600 && d[0].out.height >= 400, d[0] && [d[0].out.name, d[0].out.width, d[0].out.height]);
  ok('창을 띄워도 시트·스크립트 속성·캐시가 그대로이고 Gemini 도 부르지 않음', before === after, '');
  ok('확인창(alert)을 띄우지 않음(창 하나로 끝)', e.ui.alerts.length === 0, e.ui.alerts);
}
{
  const e = makeEnv({ pin: PIN, accessCode: CODE });
  e.ctx.SpreadsheetApp.getUi = () => ({ showModelessDialog() { throw new Error('UI 불가'); } });
  let msg = ''; try { e.ctx.showGuide_(); } catch (err) { msg = err.message; }
  ok('창을 못 띄우는 환경이면 예외가 그대로 알려짐(조용히 삼키지 않음)', msg === 'UI 불가', msg);
}

// ───────── 3) 웹에서는 부를 수 없음 ─────────
{
  const e = makeEnv({ pin: PIN, accessCode: CODE });
  const gone = ['showGuide_', 'showGuide'];
  ok('showGuide_ 는 교사 전용·학생 입구 목록에 없음(웹 API 가 아님)', gone.every((a) => !e.ctx.TEACHER_ACTIONS_.includes(a) && !e.ctx.STUDENT_ACTIONS_.includes(a)), '');
  const r1 = e.ctx.routeAction('showGuide_', {}), r2 = e.ctx.routeAction('showGuide_', { pin: PIN }), r3 = e.ctx.routeAction('showGuide_', { accessCode: CODE });
  ok('웹으로 showGuide_ 를 불러도 아무 창·실행 없이 실패함', !r1.success && !r2.success && !r3.success && e.ui.dialogs.length === 0, [r1, r2, r3]);
}

// ───────── 4) 안내문이 코드와 어긋나지 않음 ─────────
const c = env.ctx;
const tabs = ['환경설정', '기본설정', c.PERSONA_SHEET_, c.RUBRIC_SHEET_, c.TOPIC_CFG_SHEET_, c.MATERIAL_SHEET_NAME_, c.EXTRA_KEYS_SHEET_NAME_, '채팅기록'];
ok('시트 구조 표에 코드가 쓰는 탭 이름이 모두 있음', tabs.every((t) => t && text.includes(t)), tabs.filter((t) => !t || !text.includes(t)));
const row = (name) => (GUIDE.match(new RegExp('<tr><td>' + name + '</td>[\\s\\S]*?</tr>')) || [''])[0];
ok('표의 첫 칸(탭 이름)이 코드의 탭 이름과 같고 빠진 탭이 없음', tabs.every((t) => row(t) !== ''), tabs.filter((t) => row(t) === ''));
const join = (h) => h.join(' · ');
ok('페르소나 세부설정 머리글 순서가 안내문과 같음', text.includes(join(c.PERSONA_HEADERS_)), join(c.PERSONA_HEADERS_));
ok('루브릭 세부설정 머리글 순서가 안내문과 같음', text.includes(join(c.RUBRIC_HEADERS_)), join(c.RUBRIC_HEADERS_));
ok('주제 세부설정 머리글 순서가 안내문과 같음', text.includes(join(c.TOPIC_CFG_HEADERS_)), join(c.TOPIC_CFG_HEADERS_));
ok('안내문이 설명하는 고정 칸(B1·B3·B5·B10~B13)이 모두 적혀 있음', ['B1', 'B3', 'B5', 'B10', 'B11', 'B12', 'B13'].every((a) => new RegExp('<code>' + a + '</code>').test(GUIDE)), '');
{
  // 안내문이 말한 칸을 코드가 정말 그 용도로 읽는지: 칸마다 서로 다른 값을 넣고 getTeacherSettings 가 같은 이름으로 돌려주는지 본다
  const e = makeEnv({ pin: PIN, accessCode: CODE });
  const env5 = e.sheets['환경설정'].rows, cfg = e.sheets['기본설정'].rows;
  env5[0][1] = 'AIzaFAKEKEY1234567890'; env5[2][1] = 'BACKUP-ID-1'; env5[4][1] = 'gemini-model-x';
  cfg[9][1] = '금지어A'; cfg[10][1] = '학급A'; cfg[11][1] = '모둠A'; cfg[12][1] = '주제A';
  const s = e.ctx.getTeacherSettings();
  ok('안내한 칸이 실제 설정 읽기와 맞음 (B1 키 · B3 백업 ID · B5 모델 · B10 금지어 · B11 학급 · B12 모둠 · B13 주제)',
    s.geminiApiKeySet === true && s.backupSheetId === 'BACKUP-ID-1' && s.geminiModel === 'gemini-model-x' && s.bannedWords === '금지어A' && s.classList === '학급A' && s.groupList === '모둠A' && s.topicList === '주제A', s);
}
{
  const e = makeEnv({ pin: PIN, accessCode: CODE, noProfileTabs: true }); e.ctx.ensureProfileTabs_();
  const base = e.sheets[c.TOPIC_CFG_SHEET_].rows[1] || [];
  ok(`'(기본)' 줄의 기본값(${base[3]}분·${base[4]}쌍)이 안내문과 같음`, base[0] === c.TOPIC_DEFAULT_ && text.includes(base[3] + '분') && text.includes(base[4] + '쌍'), base);
  ok('안내문이 말하는 "기본" 줄 이름이 코드와 같음', text.includes(c.BASE_NAME_) && text.includes(c.TOPIC_DEFAULT_) && text.includes(c.TEMPLATE_KIND_), [c.BASE_NAME_, c.TOPIC_DEFAULT_, c.TEMPLATE_KIND_]);
}
ok('메뉴 설명에 메뉴 이름과 모든 메뉴 항목이 적혀 있음', text.includes(menu.name) && items.every((i) => text.includes(i.label)), items.filter((i) => !text.includes(i.label)).map((i) => i.label));
ok('캐시 시간 안내(5분)가 코드의 CORE_CACHE_SECONDS_ 와 같음', c.CORE_CACHE_SECONDS_ === 300 && /최대 5분/.test(text), c.CORE_CACHE_SECONDS_);
ok('초기화 설명이 실제 동작과 같음(환경설정·API키·비밀번호는 남음)', /환경설정\(키\)·API키·교사 비밀번호<\/b>는 그대로 남아요/.test(GUIDE), '');
{
  // 안내문이 거짓말이 되지 않게: 초기화를 돌려 보고 B1·API키 탭·교사 비밀번호는 남고 채팅기록은 지워지는지 본다
  const e = makeEnv({ pin: PIN, accessCode: CODE });
  e.ctx.ensureProfileTabs_();
  e.ctx.saveApiKeys({ keys: [{ label: '학교', key: 'AIzaSecondKey1234567890' }] });
  e.sheets['채팅기록'].rows.push(['2026-10-15', '10:00', '1반', '1모둠', '주제', '학생 말', 'AI 말', '기본', '기본']);
  const key = e.sheets['환경설정'].rows[0][1], extra = JSON.stringify(e.sheets['API키'].rows), hashBefore = e.props.get('TEACHER_PIN_HASH');
  e.ctx.resetSheetToDefaults_();
  ok('초기화 뒤에도 환경설정 B1·API키 탭·교사 비밀번호가 남음', e.sheets['환경설정'].rows[0][1] === key && JSON.stringify(e.sheets['API키'].rows) === extra && !!hashBefore && e.props.get('TEACHER_PIN_HASH') === hashBefore, [e.sheets['환경설정'].rows[0][1], !!e.sheets['API키']]);
  ok('초기화하면 채팅기록은 머리글만 남음(안내문이 "채팅기록 전체"를 지운다고 한 대로)', e.sheets['채팅기록'].rows.length === 1, e.sheets['채팅기록'].rows.length);
}

// ───────── 5) 창 안의 HTML ─────────
ok('Guide.html 은 외부 주소·스크립트 파일·서버 호출이 없음(완전히 내장)', !/<script[^>]+src=|https?:\/\/|google\.script\.run|<link[^>]+href=|@import/i.test(GUIDE), '');
{
  const ids = [...GUIDE.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  ok('중복 id 가 없음', new Set(ids).size === ids.length, ids);
  const controls = [...GUIDE.matchAll(/aria-controls="([^"]+)"/g)].map((m) => m[1]);
  ok('탭마다 짝이 되는 패널이 있고 패널은 role=tabpanel', controls.length === 4 && controls.every((id) => ids.includes(id) && new RegExp('id="' + id + '" role="tabpanel"').test(GUIDE)), controls);
  ok('처음에 보이는 탭은 하나뿐(나머지 패널은 hidden)', (GUIDE.match(/class="panel on"/g) || []).length === 1 && (GUIDE.match(/role="tabpanel"[^>]*\bhidden\b/g) || []).length === 3, '');
}
{
  const src = (GUIDE.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
  let err = null; try { new vm.Script(src); } catch (e) { err = e.message; }
  ok('창 안의 스크립트 문법이 정상', !!src && err === null, err);
}
ok('창 안에 제작자 크레딧이 있음', /Designed &amp; Developed by 두리쌤/.test(GUIDE), '');
ok('API 키처럼 보이는 값이 안내문에 없음', !/AIza[0-9A-Za-z_-]{10,}/.test(GUIDE), '');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
