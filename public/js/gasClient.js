// 이 정적 웹앱은 자체 백엔드가 없다. 대신 각 교사가 자신의 구글 스프레드시트에서
// 배포한 Apps Script(GAS) 웹 앱 URL을 "백엔드"로 사용한다.
// - GAS URL은 이 브라우저의 localStorage에 저장된다 (교사마다, 기기마다 따로 저장됨).
// - 학생에게 배부하는 링크는 ?gas=<인코딩된 GAS URL> 형태로 URL 자체에 연결 정보를 담아,
//   학생이 링크/QR을 열기만 하면 별도 설정 없이 자동으로 연결되게 한다. 이 링크의 주소는 **학생 화면에서만**
//   받아들인다(adoptGasUrlFromQuery). 교사 콘솔은 링크로 들어온 주소를 무시한다: 조작된 링크 하나로 콘솔의 저장 주소가
//   바뀌고, 교사가 입력한 키·비밀번호가 엉뚱한 서버로 가는 일을 막기 위해서다.
// - 교사 비밀번호(PIN)는 이 탭의 sessionStorage에만 두고(탭을 닫으면 사라짐), 교사 전용 요청에만 실어 보낸다.
(function (global) {
  const STORAGE_KEY = 'sih_argu_gas_url';
  const PIN_KEY = 'argu_teacher_pin';
  const TIMEOUT_MS = 90000;

  // 교사 콘솔만 쓰는 요청. 서버가 비밀번호를 확인하고, 주소창에 비밀번호가 남지 않도록 POST로 보낸다.
  const TEACHER_ACTIONS = ['testConnection', 'teacherAnalyze', 'getChatOverview', 'getChatLog', 'listGeminiModels', 'testGeminiModel', 'getTeacherSettings',
    'getTopicMaterials', 'saveTopicMaterial', 'saveTeacherSettings', 'setTeacherPin', 'getApiKeys', 'saveApiKeys', 'resetApiKeyStatus',
    'getProfiles', 'saveProfile', 'deleteProfile', 'saveTopicSetting', 'getAccessCode', 'setAccessCode'];

  // 조작된 링크로 학생·교사의 요청이 엉뚱한 서버로 가지 않도록, 구글 Apps Script 웹 앱 주소(.../exec)만 받아들인다
  function isValidGasUrl(url) {
    try {
      const u = new URL(String(url || '').trim());
      return u.protocol === 'https:' && u.hostname === 'script.google.com' && /\/exec$/.test(u.pathname);
    } catch (e) {
      return false;
    }
  }

  // 이 탭이 쓰는 GAS 주소. 저장소(localStorage)를 쓸 수 없는 환경(프라이빗 모드 등)을 위해 메모리에도 둔다.
  let memoryUrl = '';

  function getGasUrl() {
    if (memoryUrl) return memoryUrl;
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  // 구글 Apps Script 주소(.../exec)만 저장한다. 빈 문자열은 저장된 주소를 지우는 뜻이다. 저장했으면 true.
  function setGasUrl(url) {
    const v = String(url || '').trim();
    if (v && !isValidGasUrl(v)) return false;
    memoryUrl = v;
    try {
      localStorage.setItem(STORAGE_KEY, v);
    } catch (e) {
      // localStorage 사용 불가(프라이빗 모드 등) 시 메모리에만 둔다
    }
    return true;
  }

  // 학생 화면 전용: 접속 링크의 ?gas= 주소를 받아들여 저장한다. 형식이 맞지 않으면 무시한다.
  // (구글 Apps Script 주소 형식만 확인할 수 있다 — 누구나 script.google.com 에 자기 스크립트를 올릴 수 있으므로,
  //  링크는 믿을 수 있는 경로(교사가 직접 전한 링크·QR)로만 배부해야 한다)
  function adoptGasUrlFromQuery() {
    try {
      const fromQuery = new URLSearchParams(window.location.search).get('gas');
      if (fromQuery && setGasUrl(decodeURIComponent(fromQuery))) return true;
    } catch (e) {
      // 주소 해석에 실패하면 저장된 값으로 계속한다
    }
    return false;
  }

  function getPin() {
    try { return sessionStorage.getItem(PIN_KEY) || ''; } catch (e) { return ''; }
  }
  function setPin(pin) {
    try { if (pin) sessionStorage.setItem(PIN_KEY, pin); else sessionStorage.removeItem(PIN_KEY); } catch (e) { /* 저장 불가 환경은 무시 */ }
  }

  function buildStudentLink(gasUrl) {
    // 교사 콘솔(index.html)과 같은 폴더의 student.html 이 학생 전용 입구다
    const base = window.location.origin + window.location.pathname.replace(/[^/]*$/, '') + 'student.html';
    return base + '?gas=' + encodeURIComponent(gasUrl);
  }

  // 참고: 라우팅 키 이름을 "_action" 으로 쓰는 이유 — 교사 설정의 "행동 지침" 필드도
  // 이름이 "action" 이라서, 일반 "action" 키를 쓰면 saveTeacherSettings 호출 시
  // 라우팅 값과 설정 필드 값이 서로 덮어써지는 충돌이 생긴다. 그래서 절대 겹치지 않는
  // 이름을 별도로 쓴다.

  async function request(url, init) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      return await parseGasResponse(res);
    } catch (err) {
      if (err && err.name === 'AbortError') throw new Error('응답이 너무 오래 걸려요. 잠시 뒤 다시 시도해 주세요.');
      if (err instanceof TypeError) throw new Error('서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // GET 요청: 쿼리스트링만 사용 (프리플라이트 없는 simple request). 교사 전용 요청은 POST로 보낸다.
  async function callGet(action, params) {
    if (TEACHER_ACTIONS.indexOf(action) !== -1) return callPost(action, params || {});
    const gasUrl = getGasUrl();
    if (!gasUrl) throw new Error('GAS 웹 앱 URL이 설정되지 않았습니다. 관리 콘솔에서 먼저 연동하세요.');

    const url = new URL(gasUrl);
    Object.keys(params || {}).forEach((k) => {
      if (params[k] !== undefined && params[k] !== null) url.searchParams.set(k, params[k]);
    });
    url.searchParams.set('_action', action);
    return request(url.toString(), { method: 'GET' });
  }

  // POST 요청: Content-Type을 text/plain으로 보내 CORS 프리플라이트를 회피한다.
  // (GAS 웹 앱은 doPost에서 e.postData.contents를 원문 그대로 읽으므로 문제 없음)
  async function callPost(action, payload) {
    const gasUrl = getGasUrl();
    if (!gasUrl) throw new Error('GAS 웹 앱 URL이 설정되지 않았습니다. 관리 콘솔에서 먼저 연동하세요.');

    const body = { ...payload, _action: action };
    if (TEACHER_ACTIONS.indexOf(action) !== -1 && body.pin === undefined) {
      const pin = getPin();
      if (pin) body.pin = pin;
    }
    return request(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
    });
  }

  async function parseGasResponse(res) {
    let data;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error('GAS 응답을 해석할 수 없습니다. 웹 앱이 "모든 사용자" 접근 권한으로 배포되었는지 확인하세요.');
    }
    if (data && data.success === false) {
      // 이 콘솔은 모두가 공유하지만 GAS 는 시트마다 따로 배포되므로, 콘솔이 쓰는 새 action 을 모르는 옛 GAS 가 있을 수 있다
      const oldBackend = /^알 수 없는 action/.test(String(data.error || ''));
      const err = new Error(oldBackend ? '이 시트의 GAS(Apps Script)가 옛 버전이라 이 기능을 아직 쓸 수 없어요. 최신 코드를 배포한 뒤 다시 시도해 주세요.' : (data.error || '요청 처리 중 오류가 발생했습니다.'));
      if (oldBackend) err.oldBackend = true;
      if (data.needPin) err.needPin = true; // 교사 비밀번호가 필요하거나 틀림
      if (data.needSetup) err.needSetup = true; // 교사 비밀번호가 아직 정해지지 않음(초기 비밀번호로 콘솔에서, 또는 시트 메뉴에서 정함)
      if (data.needCode) err.needCode = true; // 수업 입장 코드가 없거나 틀림(학생 입구)
      err.data = data; // 오류 응답에 실린 추가 정보(예: 다른 루브릭으로 진행된 대화 목록)를 화면이 쓸 수 있게
      throw err;
    }
    return data;
  }

  global.GasClient = { getGasUrl, setGasUrl, adoptGasUrlFromQuery, isValidGasUrl, getPin, setPin, buildStudentLink, callGet, callPost };
})(window);
