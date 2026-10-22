// 개발용 가짜 GAS 서버: 실제 gas-source/Code.js 를 메모리 가짜 시트(시험 하네스)로 실행하고 GAS 웹 앱처럼 JSON 으로 답한다.
// 라이브 시트·Gemini 를 건드리지 않고 교사 콘솔·학생 화면을 브라우저에서 끝까지 눌러 볼 때 쓴다.
//   node tests/fake_gas_server.js [포트=3101]
//
// 같은 포트에서 public/ 화면도 함께 서빙한다 → 브라우저에서 http://localhost:3101/ (교사 콘솔), /student.html (학생) 을 열면 된다.
// 화면의 연결 제한(CSP)이 같은 출처(self)만 허용하므로, 화면과 가짜 GAS 를 한 주소로 맞춰 둔 것이다.
// 화면의 fetch 만 가짜 GAS 로 돌리면 된다 (GAS 주소 형식 검사 때문에 저장되는 주소는 script.google.com 형태를 쓴다):
//   const of = window.fetch.bind(window); window.fetch = (u, o) => of(String(u).replace(/^https:\/\/script\.google\.com\/[^?]*\/exec/, '/exec'), o);
//
// 시험용 값 (실서비스와 무관한 가짜): 교사 비밀번호와 수업 입장 코드는 아래 상수. 교사 콘솔 입력창과 학생 코드 입력창에 넣으면 된다.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { makeEnv } = require('./gas_harness.js');
const port = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a))) || 3101;
const TEST_PIN = 'fake-teacher-pass-1';
const TEST_ACCESS_CODE = 'FAKE42';
// --no-pin: 비밀번호·코드가 아직 없는 새 시트처럼 시작한다 (콘솔의 "먼저 비밀번호를 정해 주세요" 안내를 볼 때)
const NO_PIN = process.argv.includes('--no-pin');
const env = makeEnv(NO_PIN ? { templateKey: 'socratic' } : { templateKey: 'socratic', pin: TEST_PIN, accessCode: TEST_ACCESS_CODE });
env.sheets['기본설정'].rows[3][1] = '전류와 전압의 관계, 온도와 반응 속도, 원자력 발전은 앞으로 늘려야 한다';
env.sheets['기본설정'].rows[1][1] = '1반, 2반';
env.sheets['기본설정'].rows[2][1] = '1모둠, 2모둠';
env.sheets['환경설정'].rows[0][1] = 'AIzaFakeKeyForLocalTestingOnly0000';
// --sample-chats: 같은 주제를 두 날에 나눠 한 1반 1모둠의 대화를 미리 넣는다 (결과 분석의 '날짜' 단추와 튜터 질문 → 학생 답 표를 볼 때)
if (process.argv.includes('--sample-chats')) {
  const T = '원자력 발전은 앞으로 늘려야 한다';
  [['2026-10-15', '23:17', '찬성해요.', '왜 그렇게 생각해? 어떤 사실이 네 생각을 뒷받침하니?'],
   ['2026-10-15', '23:17', '전기가 부족하니까 원자력 발전이 필요해요', '전기가 부족하다는 사실이 왜 원자력을 늘려야 한다는 입장을 뒷받침할까?'],
   ['2026-10-15', '23:18', '더 싸고 좋다고 했어요', '싸다는 근거는 어디서 봤니? 다른 발전과 비교해 볼 수 있을까?'],
   ['2026-10-22', '11:14', '저는 찬성이에요. 이산화탄소를 거의 내보내지 않기 때문이에요.', '좋은 근거네! 그 장점이 왜 원자력을 늘려야 한다는 주장을 뒷받침할까?'],
   ['2026-10-22', '11:14', '이산화탄소가 온난화의 원인이니까 원자력을 늘리면 온난화를 줄일 수 있어요.', '그런데 방사성 폐기물은 어떻게 보관해야 할까?']]
    .forEach(([d, t, q, a]) => env.sheets['채팅기록'].rows.push([d, t, '1반', '1모둠', T, q, a, '기본', '기본']));
  // 평가 제외 대화(탐구 도우미): 결과 분석에서 '대화 기록 보기'로만 볼 수 있다
  [['2026-10-20', '10:00', '전압계는 어디에 연결해요?', '전압계는 측정할 부분과 병렬로 연결해요. 왜 병렬일지 생각해 볼까요?'],
   ['2026-10-20', '10:02', '저항이 뜨거워져요', '전원을 끄고 잠깐 식힌 뒤 다시 측정해요. 전류가 너무 크지 않은지도 확인해요.']]
    .forEach(([d, t, q, a]) => env.sheets['채팅기록'].rows.push([d, t, '2반', '2모둠', '온도와 반응 속도', q, a, '탐구 도우미', '-']));
}

const PUBLIC = path.join(__dirname, '..', 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function reply(res, obj) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}
function serveStatic(url, res) {
  let rel = decodeURIComponent(url.pathname); if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
}
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }); return res.end(); }
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/__state') { // 시트 내용을 그대로 보여 주는 점검용 주소
    const out = {}; Object.keys(env.sheets).forEach((k) => { out[k] = env.sheets[k].rows; });
    return reply(res, out);
  }
  if (url.pathname === '/__menu_set_pin') { // 시트 메뉴 '🔐 교사 비밀번호 설정' 을 흉내 낸다 (--no-pin 으로 띄웠을 때 시험용)
    const r = env.ctx.setTeacherPin_({ newPin: url.searchParams.get('pin') || '' });
    if (r.success) env.ctx.ensureAccessCode_();
    return reply(res, r);
  }
  if (url.pathname !== '/exec') return serveStatic(url, res);
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    try {
      // 실제 GAS 와 같다: POST 만 기능을 실행하고, GET 은 상태 한 줄만 돌려준다
      if (req.method === 'POST') {
        const b = JSON.parse(body || '{}');
        return reply(res, env.ctx.routeAction(b._action, b));
      }
      return reply(res, JSON.parse(env.ctx.doGet({ parameter: {} }).content));
    } catch (e) { reply(res, { success: false, error: String(e.message || e) }); }
  });
}).listen(port, () => console.log('fake GAS + 화면: http://localhost:' + port + '  (교사 /, 학생 /student.html)'));
