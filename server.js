// 이 서버는 정적 프론트엔드만 서빙한다. 학생 데이터/AI 호출은 전부
// 각 교사가 배포한 구글 Apps Script(GAS) 웹 앱이 처리한다 (public/js/gasClient.js 참고).
const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
app.disable('x-powered-by');

// 보안 헤더 (정적 호스팅에 올릴 때도 같은 헤더를 걸어 주면 좋다)
//  - frame-ancestors / X-Frame-Options: 다른 사이트가 이 화면을 iframe 으로 덮어 씌우는 것(클릭재킹) 차단
//  - nosniff: 파일 형식을 브라우저가 멋대로 추측하지 못하게
//  - Referrer-Policy: 학생 링크의 ?gas= 주소가 다른 곳으로 새는 것을 막기
// 페이지 안쪽의 연결 제한(CSP)은 각 HTML 의 <meta> 에 들어 있다.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// 메인 도메인(/)은 교사 콘솔이고, 학생은 별도 주소(/student.html)로만 들어온다.
// 예전 북마크(/teacher.html)는 메인으로 보낸다.
app.get('/teacher.html', (req, res) => res.redirect(301, '/'));

app.use(express.static(path.join(__dirname, 'public')));

app.listen(port, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${port}`);
});
