// 공개 저장소 비밀 정보 차단(tools/secret-guard.js, .gitignore, .githooks)을 시험한다.
//   node tests/repo_secrets.test.js
// 가짜 키는 실행 중에 조립한다. 이 파일 자체가 키 모양 문자열을 담지 않게 하려는 것이다.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const G = require('../tools/secret-guard.js');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { (cond ? pass++ : fail++); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  → ' + JSON.stringify(extra))); };
const ROOT = path.join(__dirname, '..');
const rep = (c, n) => c.repeat(n);
const hits = (text) => G.checkContent('x.txt', Buffer.from(text, 'utf8')).map((f) => f.why);

// 1) 키 모양 찾기
ok('Gemini(Google) API 키를 찾음', hits('KEY=' + 'AI' + 'za' + rep('A', 35)).length === 1, hits('AI' + 'za' + rep('A', 35)));
ok('OpenAI 키(sk-proj-)를 찾음', hits('OPENAI_API_KEY=' + 's' + 'k-proj-' + rep('a', 40)).length === 1, '');
ok('Anthropic 키(sk-ant-)를 찾음', hits('s' + 'k-ant-' + rep('b', 40)).length === 1, '');
ok('GitHub 토큰을 찾음', hits('g' + 'ho_' + rep('c', 36)).length === 1, '');
ok('Google OAuth 리프레시 토큰(.clasprc.json 안의 값)을 찾음', hits('"refresh_token": "1/' + '/0' + rep('d', 40) + '"').length === 1, '');
ok('개인 키 머리말을 찾음', hits('-----BEGIN ' + 'PRIVATE KEY-----').length === 1, '');
ok('평범한 코드·문장은 키로 보지 않음', hits('const task-runner = "desk-lamp"; // sk-short apiKey: getRange("B1")').length === 0, hits('desk-' + rep('a', 30)));
ok('단어 중간의 sk- 는 키로 보지 않음', hits('desk-' + rep('a', 30)).length === 0, '');
ok('이진 파일(그림)은 건너뜀', G.checkContent('a.png', Buffer.from([0, 1, 2, ...Buffer.from('AI' + 'za' + rep('A', 35))])).length === 0, '');
ok('찾은 결과에 값 자체는 들어 있지 않음(파일·줄·종류만)', JSON.stringify(G.checkContent('x', Buffer.from('AI' + 'za' + rep('Q', 35)))).indexOf(rep('Q', 35)) === -1, '');

// 2) 금지 파일 이름
for (const f of ['.env', '.env.local', 'tools/.env.production', 'gas-source/.clasprc.json', 'service-account.json', 'client_secret_123.json', 'credentials.json', 'id.pem', 'cert.p12', 'server.key']) {
  ok(`금지 파일 이름: ${f}`, G.checkName(f).length === 1, '');
}
for (const f of ['gas-source/.clasp.json', 'public/js/gasClient.js', 'package.json', 'tests/fake_gas_server.js', 'README.md']) {
  ok(`허용 파일 이름: ${f}`, G.checkName(f).length === 0, G.checkName(f));
}

// 3) .gitignore 가 비밀 파일을 실제로 무시하는지 (git check-ignore)
const ignored = (p) => { try { execFileSync('git', ['check-ignore', '-q', '--no-index', p], { cwd: ROOT, stdio: 'ignore' }); return true; } catch (e) { return false; } };
for (const p of ['.env', '.env.local', '.clasprc.json', 'gas-source/.clasprc.json', '.vercel/project.json', 'service-account.json', 'client_secret_x.json', 'credentials.json', 'my.pem', 'my.key']) {
  ok(`.gitignore 가 무시함: ${p}`, ignored(p), '');
}
ok('.gitignore 가 gas-source/.clasp.json(스크립트 ID, 비밀 아님)은 무시하지 않음', !ignored('gas-source/.clasp.json'), '');

// 4) 저장소에 지금 비밀 정보가 없음
const tracked = G.scanTracked();
ok('추적 중인 파일에 비밀 정보·금지 파일 없음', tracked.length === 0, tracked);

// 5) git 훅이 있고 차단기를 부름
for (const [hook, mode] of [['pre-commit', '--staged'], ['pre-push', '--pre-push']]) {
  const p = path.join(ROOT, '.githooks', hook);
  ok(`.githooks/${hook} 가 secret-guard ${mode} 를 실행`, fs.existsSync(p) && /node tools\/secret-guard\.js --?[a-z-]*/.test(fs.readFileSync(p, 'utf8')) && fs.readFileSync(p, 'utf8').includes(mode), '');
}
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
ok('npm test 에 비밀 정보 시험이 들어 있음', /repo_secrets\.test\.js/.test(pkg.scripts.test), pkg.scripts.test);
ok('npm run hooks 로 훅을 켤 수 있음', /core\.hooksPath \.githooks/.test(pkg.scripts.hooks || ''), pkg.scripts.hooks);
let hooksPath = '';
try { hooksPath = execFileSync('git', ['config', 'core.hooksPath'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch (e) { /* 설정 안 됨 */ }
if (hooksPath !== '.githooks') console.log('NOTE 이 클론에서 git 훅이 꺼져 있습니다. `npm run hooks` 로 켜세요.');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
