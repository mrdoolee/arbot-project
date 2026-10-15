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
env.sheets['기본설정'].rows[12][1] = '전류와 전압의 관계, 온도와 반응 속도, 원자력 발전은 앞으로 늘려야 한다';
env.sheets['기본설정'].rows[10][1] = '1반, 2반';
env.sheets['기본설정'].rows[11][1] = '1모둠, 2모둠';
env.sheets['환경설정'].rows[0][1] = 'AIzaFakeKeyForLocalTestingOnly0000';

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
