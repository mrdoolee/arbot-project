// 공개 저장소 비밀 정보 차단기.
// 이 저장소는 공개이고 main 에 푸시하면 바로 프로덕션(arbot-trdoolee.vercel.app)에 배포된다.
// 그래서 API 키·.env·.clasprc.json 같은 비밀 정보가 커밋·푸시되지 않게 막는다.
//
//   node tools/secret-guard.js            추적 중인 모든 파일 검사 (npm test 에서 실행)
//   node tools/secret-guard.js --staged   커밋하려는(스테이지된) 파일 검사 (.githooks/pre-commit)
//   node tools/secret-guard.js --pre-push 푸시하려는 커밋 전체 검사 (.githooks/pre-push, 표준입력으로 ref 목록)
//
// 찾은 값은 절대 출력하지 않는다. 파일 이름·줄 번호·종류만 알려 준다.
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// 커밋하면 안 되는 파일 이름 (경로의 마지막 이름 기준)
const FORBIDDEN_NAMES = [
  { re: /^\.env$/i, why: '.env (API 키 파일)' },
  { re: /^\.env\..+$/i, why: '.env.* (API 키 파일)' },
  { re: /^\.clasprc\.json$/i, why: '.clasprc.json (clasp 로그인 토큰)' },
  { re: /^service-account.*\.json$/i, why: '서비스 계정 키' },
  { re: /^client_secret.*\.json$/i, why: 'OAuth 클라이언트 비밀' },
  { re: /^credentials.*\.json$/i, why: '인증 정보 파일' },
  { re: /\.(pem|p12|pfx|key)$/i, why: '개인 키 파일' },
];

// 파일 안에 들어 있으면 안 되는 값의 모양
const SECRET_PATTERNS = [
  { re: /AIza[0-9A-Za-z_-]{35}/, why: 'Google(Gemini) API 키' },
  { re: /(?<![A-Za-z0-9])sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}/, why: 'OpenAI/Anthropic API 키' },
  { re: /gh[pousr]_[A-Za-z0-9]{36,}/, why: 'GitHub 토큰' },
  { re: /github_pat_[A-Za-z0-9_]{30,}/, why: 'GitHub 토큰' },
  { re: /ya29\.[0-9A-Za-z_-]{20,}/, why: 'Google OAuth 액세스 토큰' },
  { re: /(?<![A-Za-z0-9])1\/\/0[0-9A-Za-z_-]{30,}/, why: 'Google OAuth 리프레시 토큰' },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, why: '개인 키' },
];

function git(args, opts) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, ...opts });
}
const lines = (buf) => buf.toString('utf8').split('\n').map((s) => s.trim()).filter(Boolean);

function checkName(file) {
  const base = file.split('/').pop();
  const hit = FORBIDDEN_NAMES.find((f) => f.re.test(base));
  return hit ? [{ file, why: hit.why }] : [];
}

// buf: 파일 내용(Buffer). 그림 같은 이진 파일은 건너뛴다.
function checkContent(file, buf) {
  if (buf.includes(0)) return [];
  const found = [];
  buf.toString('utf8').split('\n').forEach((line, i) => {
    for (const p of SECRET_PATTERNS) if (p.re.test(line)) found.push({ file, line: i + 1, why: p.why });
  });
  return found;
}

function scanTracked() {
  const files = lines(git(['ls-files', '-z']).toString('utf8').replace(/\0/g, '\n'));
  const fs = require('fs');
  const found = [];
  for (const f of files) {
    found.push(...checkName(f));
    const abs = path.join(ROOT, f);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) found.push(...checkContent(f, fs.readFileSync(abs)));
  }
  return found;
}

function scanStaged() {
  const files = lines(git(['diff', '--cached', '--name-only', '--diff-filter=ACMR']));
  const found = [];
  for (const f of files) {
    found.push(...checkName(f));
    found.push(...checkContent(f, git(['show', ':' + f])));
  }
  return found;
}

const ZERO = /^0+$/;
function scanPrePush(stdin) {
  const found = [];
  for (const line of stdin.split('\n').map((s) => s.trim()).filter(Boolean)) {
    const [, localSha, , remoteSha] = line.split(/\s+/);
    if (!localSha || ZERO.test(localSha)) continue; // 브랜치 삭제
    const range = remoteSha && !ZERO.test(remoteSha) ? [`${remoteSha}..${localSha}`] : [localSha, '--not', '--remotes'];
    for (const c of lines(git(['rev-list', ...range]))) {
      const files = lines(git(['diff-tree', '-r', '--root', '--no-commit-id', '--name-only', '--diff-filter=ACMR', c]));
      for (const f of files) {
        const where = `${c.slice(0, 7)}:${f}`;
        found.push(...checkName(f).map((x) => ({ ...x, file: where })));
        found.push(...checkContent(where, git(['show', `${c}:${f}`])));
      }
    }
  }
  return found;
}

function report(found, label) {
  if (!found.length) return 0;
  console.error(`\n[secret-guard] ${label}: 비밀 정보로 보이는 것을 찾아 막았습니다 (값은 표시하지 않음).`);
  for (const f of found) console.error(`  - ${f.file}${f.line ? ':' + f.line : ''}  ${f.why}`);
  console.error('\n이 저장소는 공개이고 main 푸시는 곧바로 프로덕션 배포입니다.');
  console.error('키는 .env(git 제외)나 각 교사 시트(환경설정 B1)에 두고, 파일을 스테이지에서 빼세요: git rm --cached <파일>');
  console.error('이미 커밋했다면 그 키는 노출된 것으로 보고 새로 발급하세요.\n');
  return 1;
}

if (require.main === module) {
  const mode = process.argv[2] || '--tracked';
  let code;
  if (mode === '--staged') code = report(scanStaged(), '커밋 차단');
  else if (mode === '--pre-push') code = report(scanPrePush(require('fs').readFileSync(0, 'utf8')), '푸시 차단');
  else {
    code = report(scanTracked(), '추적 파일 검사');
    if (!code) console.log('secret-guard: 추적 중인 파일에 비밀 정보 없음');
  }
  process.exit(code);
}

module.exports = { FORBIDDEN_NAMES, SECRET_PATTERNS, checkName, checkContent, scanTracked };
