// 실제 gas-source/Code.js 를 그대로 실행하는 메모리 하네스: 시트/캐시/락/Gemini 를 가짜로 대체한다 (라이브 시트와 Gemini 를 건드리지 않는다).
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const path = require('path');
// Apps Script 는 gas-source 의 .js 파일을 한 전역 범위로 합쳐 실행한다 (Code.js + Templates.js)
const CODE = fs.readdirSync(path.join(__dirname, '..', 'gas-source')).filter((f) => f.endsWith('.js')).sort().map((f) => fs.readFileSync(path.join(__dirname, '..', 'gas-source', f), 'utf8')).join('\n');

function makeSheet(name, rows) {
  const sh = { name, rows: rows.map((r) => r.slice()) };
  const colNum = (s) => s.split('').reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  const parse = (a1) => {
    const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(a1);
    if (!m) throw new Error('bad A1 ' + a1);
    return { r1: +m[2], c1: colNum(m[1]), r2: m[4] ? +m[4] : +m[2], c2: m[3] ? colNum(m[3]) : colNum(m[1]) };
  };
  const clean = (v) => (typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v); // 시트의 앞 ' 는 값에 남지 않는다
  const get = (r, c) => { const row = sh.rows[r - 1]; const v = row ? row[c - 1] : undefined; return v === undefined ? '' : v; };
  const set = (r, c, v) => { while (sh.rows.length < r) sh.rows.push([]); const row = sh.rows[r - 1]; while (row.length < c) row.push(''); row[c - 1] = clean(v); };
  const range = (r1, c1, r2, c2) => ({
    getValue: () => get(r1, c1),
    getValues: () => { const out = []; for (let r = r1; r <= r2; r++) { const row = []; for (let c = c1; c <= c2; c++) row.push(get(r, c)); out.push(row); } return out; },
    setValue: (v) => { set(r1, c1, v); },
    clearContent: () => { for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (sh.rows[r - 1] && c - 1 < sh.rows[r - 1].length) sh.rows[r - 1][c - 1] = ''; },
    setValues: (vals) => { vals.forEach((row, i) => row.forEach((v, j) => set(r1 + i, c1 + j, v))); },
  });
  sh.getRange = (a, b, c, d) => {
    if (typeof a === 'string') { const p = parse(a); return range(p.r1, p.c1, p.r2, p.c2); }
    return range(a, b, a + (c || 1) - 1, b + (d || 1) - 1);
  };
  sh.getDataRange = () => { const w = Math.max(1, ...sh.rows.map((r) => r.length)); return range(1, 1, Math.max(1, sh.rows.length), w); };
  sh.getLastRow = () => sh.rows.length;
  sh.appendRow = (arr) => { sh.rows.push(arr.map(clean)); };
  sh.deleteRow = (n) => { sh.rows.splice(n - 1, 1); };
  sh.deleteRows = (n, count) => { sh.rows.splice(n - 1, count); };
  sh.clear = () => { sh.rows.length = 0; };
  sh.setFrozenRows = () => {};
  return sh;
}

function makeEnv(opts) {
  const sheets = {
    '환경설정': makeSheet('환경설정', [['Gemini key', 'AIzaFAKEKEY1234567890'], ['PDF', ''], ['backup', ''], ['report', 'FOLDER-ID-DO-NOT-TOUCH'], ['model', '']]),
    '기본설정': makeSheet('기본설정', [['역할', 'role-text'], ['행동', 'action-text'], ['제한', 'restrict-text'], ['예외', 'exception-text'], ['추가', 'extra-text'], ['시간', 20], ['FileAPI', 'OFF'], ['uris', ''], ['pairs', 3], ['금지어', '바보, 멍청이'], ['학급', '1반'], ['모둠', '1모둠'], ['주제', '전류와 전압의 관계, 온도와 반응 속도'], ['캐릭터', 'labcoat'], ['이름', '도우미'], ['인사말', '안녕'], ['템플릿', opts.templateKey || 'socratic']]),
    '논증평가설정': makeSheet('논증평가설정', [['r', 'rubric role'], ['c', 'criteria'], ['l', 'Level 1: a\nLevel 4: b'], ['g', 'guideline']]),
    '채팅기록': makeSheet('채팅기록', [['날짜', '시간', '학급', '모둠', '주제', '학생', 'AI']]),
  };
  // 세부설정 탭은 이미 만들어져 있는 시트가 기본이다 (실서비스 시트와 같은 상태: '구분' 열·템플릿 줄은 첫 요청 때 채워진다).
  // opts.noProfileTabs 를 주면 세부설정 탭이 아직 없는 새 시트(처음 만들어지는 경우)를 시험할 수 있다.
  // 기본설정 탭의 1~9행·14~17행은 지금은 쓰이지 않는 옛 칸이다 (초기화가 비우는지 시험하려고 남겨 둔다).
  if (!opts.noProfileTabs) {
    const tpl = opts.templateKey || 'socratic';
    sheets['페르소나 세부설정'] = makeSheet('페르소나 세부설정', [['이름', '템플릿', '역할', '행동 지침', '절대 제한', '예외 대처', '추가 참고', '캐릭터 ID', '캐릭터 이름', '첫 인사말'],
      ['기본', tpl, 'role-text', 'action-text', 'restrict-text', 'exception-text', 'extra-text', 'labcoat', '도우미', '안녕']]);
    sheets['루브릭 세부설정'] = makeSheet('루브릭 세부설정', [['이름', '(미사용)', '평가자 역할', '요소별 판정 기준', '종합 평가 루브릭', '피드백 작성 지침'],
      ['기본', tpl, 'rubric role', 'criteria', 'Level 1: a\nLevel 4: b', 'guideline']]);
    sheets['주제 세부설정'] = makeSheet('주제 세부설정', [['주제', '페르소나', '루브릭', '제한 시간(분)', '기억할 대화 쌍'], ['(기본)', '기본', '기본', 20, 3]]);
  }
  const calls = []; // Gemini 로 나간 요청
  const keysUsed = []; // 각 요청에 쓰인 API 키(순서대로, 헤더 x-goog-api-key 에서 읽음)
  const urls = []; // Gemini 로 나간 요청 주소 (키가 주소에 섞이지 않는지 검사용)
  const sleeps = []; // Utilities.sleep 호출 (틀린 비밀번호·코드를 느리게 만드는지 검사용)
  const modelsUsed = []; // 각 요청에 쓰인 모델(순서대로)
  const cache = new Map(); const props = new Map();
  const ss = {
    getSheetByName: (n) => sheets[n] || null,
    getName: () => '테스트 시트', getUrl: () => 'https://docs.google.com/spreadsheets/d/FAKE/edit',
    deleteSheet: (sh) => { delete sheets[sh.name]; },
    insertSheet: (n) => { if (opts.insertSheetFails) throw new Error('시트 보호로 탭을 만들 수 없음'); sheets[n] = makeSheet(n, []); return sheets[n]; },
  };
  // 시트 메뉴·안내창: 만들어진 메뉴와 띄운 대화상자를 기록한다 (시험이 env.ui 에서 읽는다. 확인창·입력창이 필요한 시험은 getUi 를 직접 덮어쓴다)
  const ui = { menus: [], dialogs: [], alerts: [] };
  const uiApi = {
    createMenu: (name) => {
      const menu = { name, items: [] }; ui.menus.push(menu);
      const b = { addItem: (label, fn) => { menu.items.push({ label, fn }); return b; }, addSeparator: () => { menu.items.push({ separator: true }); return b; }, addToUi: () => b };
      return b;
    },
    showModelessDialog: (out, title) => { ui.dialogs.push({ kind: 'modeless', title, out }); },
    showModalDialog: (out, title) => { ui.dialogs.push({ kind: 'modal', title, out }); },
    alert: (...a) => { ui.alerts.push(a); },
  };
  // HtmlService: gas-source/<이름>.html 을 그대로 읽어 돌려준다 (없으면 실제처럼 예외)
  const HtmlService = {
    createHtmlOutputFromFile: (name) => {
      const file = path.join(__dirname, '..', 'gas-source', name + '.html');
      if (!fs.existsSync(file)) throw new Error('No HTML file named ' + name + ' was found.');
      return { name, content: fs.readFileSync(file, 'utf8'), width: null, height: null, setWidth(w) { this.width = w; return this; }, setHeight(h) { this.height = h; return this; }, getContent() { return this.content; } };
    },
  };
  const ctx = {
    console, Logger: { log: () => {} }, HtmlService,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss, getUi: () => uiApi },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: (k) => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, v), remove: (k) => cache.delete(k) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => { props.set(k, v); }, setProperties: (o) => Object.entries(o).forEach(([k, v]) => props.set(k, v)), deleteProperty: (k) => props.delete(k) }) },
    Utilities: {
      formatDate: (d, tz, fmt) => { const p = (n) => String(n).padStart(2, '0'); return fmt === 'yyyy-MM-dd' ? `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` : `${p(d.getHours())}:${p(d.getMinutes())}`; },
      computeDigest: (alg, str) => Array.from(crypto.createHash(alg === 'MD5' ? 'md5' : 'sha256').update(str, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
      DigestAlgorithm: { MD5: 'MD5', SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' }, getUuid: () => crypto.randomUUID(), sleep: (ms) => { sleeps.push(ms); },
    },
    UrlFetchApp: {
      fetch: (url, o) => {
        urls.push(url);
        if (/\/models\?/.test(url)) return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ models: (opts.models || ['gemini-flash-latest']).map((n) => ({ name: 'models/' + n, supportedGenerationMethods: ['generateContent'] })) }) };
        const body = JSON.parse(o.payload); calls.push(body);
        const usedKey = (o.headers && o.headers['x-goog-api-key']) || (/key=([^&]+)/.exec(url) || [])[1]; keysUsed.push(usedKey);
        modelsUsed.push((/models\/([^:]+):generateContent/.exec(url) || [])[1]);
        // 키별로 다른 응답(한도 소진 등)을 흉내 내고 싶을 때: opts.keyHandler(key, body) → { code, body }
        if (opts.keyHandler) {
          const h = opts.keyHandler(usedKey, body);
          if (h) return { getResponseCode: () => h.code, getContentText: () => JSON.stringify(h.body) };
        }
        let reply = opts.geminiReply ? opts.geminiReply(body) : '응답이에요.';
        // 분석 요청이면(맥락 분석 지침이 들어 있음) 발화 수만큼의 올바른 JSON 으로 답한다
        if (!opts.geminiReply && body.systemInstruction && body.systemInstruction.parts[0].text.includes('[맥락 분석 지침]')) {
          const n = (body.contents[0].parts[0].text.match(/\[발화 \d+/g) || []).length;
          reply = '앞 설명문이 붙어도 읽혀야 해요.\n```json\n' + JSON.stringify({
            utterances: Array.from({ length: n }, (_, i) => ({ no: i + 1, judgment: '[주장]', elements: ['[주장]', '[근거]'], evaluation: 'ok' })),
            contexts: [{ utterances: Array.from({ length: n }, (_, i) => i + 1), title: '가설', linkage: '상', evaluation: 'e' }],
            contextSummary: 's', overallLevel: 'Level 2 → 3', overallFeedback: 'f' }) + '\n```';
        }
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ candidates: [{ content: { parts: [{ text: reply }] } }] }) };
      },
    },
    // doGet/doPost 가 돌려주는 응답을 읽을 수 있게 (content = JSON 문자열)
    ContentService: { MimeType: { JSON: 'JSON' }, createTextOutput: (s) => ({ content: s, setMimeType() { return this; } }) },
  };
  vm.createContext(ctx);
  vm.runInContext(CODE, ctx);
  // 시험용 사전 설정: opts.pin → 교사 비밀번호, opts.accessCode → 수업 입장 코드 (실서비스는 시트 메뉴에서 정한다)
  if (opts.pin) ctx.setTeacherPin_({ newPin: opts.pin });
  if (opts.accessCode) props.set('STUDENT_ACCESS_CODE', opts.accessCode);
  return { ctx, ss, sheets, calls, keysUsed, modelsUsed, urls, sleeps, props, cache, ui };
}
module.exports = { makeEnv };
