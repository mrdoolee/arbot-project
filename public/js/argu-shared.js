// 교사 콘솔과 학생 화면이 함께 쓰는 공통 데이터: 캐릭터 그림(표정 3장), 논증 단계, 판정 칩 규칙, 테마.
(function (global) {
  // ---------- 아이콘 폰트 로딩 감지 (로드 전에는 아이콘 이름 글자가 보이지 않게 숨김) ----------
  try {
    var showIcons = function () { document.documentElement.classList.add('icons-ready'); };
    document.fonts.load('24px "Material Symbols Outlined"').then(showIcons, showIcons);
    // 폰트가 차단되거나 오래 걸려도 버튼이 영영 보이지 않는 일이 없도록, 4초 뒤에는 보이게 한다
    setTimeout(showIcons, 4000);
  } catch (e) { document.documentElement.classList.add('icons-ready'); }

  // ---------- 캐릭터 그림 ----------
  // 캐릭터마다 표정 3장(질문하는 중·생각하는 중·칭찬하는 중)을 public/img/characters/<id>-<state>.png 로 둔다.
  // (tools/generate-characters.js 로 만든 카툰 그림을 320px 로 줄인 것. 화면 크기는 CSS 가 정한다)
  // 세 장을 겹쳐 두고 .avatar 의 data-state 로 하나만 보이게 해서, 상태가 바뀔 때 새로 불러오지 않고 바로 바뀐다.
  var AVATAR_STATES = ['asking', 'thinking', 'praising'];
  var AVATAR_DIR = 'img/characters/';
  function avatarSrc(id, state) { return AVATAR_DIR + id + '-' + state + '.png'; }

  // 대화 방식(템플릿)과 캐릭터는 1:1 짝이다: 템플릿마다 그 방식에 어울리는 캐릭터 한 명.
  // (학생 화면 첫 장에 '○○가 함께해요'로 나오는 캐릭터가 AI의 실제 역할과 어긋나지 않게 하려는 규칙)
  var CHARACTERS = [
    {
      id: 'socrates', name: '소크라테스 선생님', template: 'socratic',
      tagline: '온화한 미소와 월계관을 쓴 철학자. 정답을 주지 않고 따뜻한 질문으로 생각을 이끌어요.'
    },
    {
      id: 'labcoat', name: '실험 가운 과학 선생님', template: 'cer',
      tagline: '친근한 실험실 연구원 모습. 주장 → 증거 → 추론을 차근차근 채우도록 힌트를 줘요.'
    },
    {
      id: 'coach', name: '비판적 사고 코치', template: 'advanced',
      tagline: '칠판 앞에서 논리의 빈틈과 반례를 함께 찾아주는 코치예요.'
    },
    {
      id: 'debater', name: '토론 파트너', template: 'debate',
      tagline: '헤드셋을 쓴 토론 상대. 반대편에 서서 반론을 던지며 내 입장을 단단하게 만들어 줘요.'
    },
    {
      id: 'robot', name: '과학 조교 로봇', template: 'qna',
      tagline: '눈이 반짝이는 친근한 조교. 실험 중 궁금한 측정 방법·준비물·안전을 바로 알려 줘요.'
    }
  ];

  var TEMPLATE_NAMES = { socratic: '소크라테스 발문형', cer: 'CER 코치형', advanced: '고급 논쟁형', debate: '찬반 토론형', qna: '탐구 도우미' };

  var DEFAULT_GREETING = "반가워요! 오늘은 '{주제}'에 대해 함께 탐구해 볼 거예요. 어떤 가설(주장)을 세우셨나요? 관련된 근거와 함께 이야기해 봅시다.";

  // 대화 방식(템플릿)마다 다른 첫 인사말과 열린 탐구 질문의 기본값. {주제}는 학생이 고른 주제로 바뀐다.
  // 교사가 인사말을 비워 두거나 예전 기본 문구 그대로 두면 이 값이 쓰인다.
  var GREETINGS = {
    socratic: "반가워요! 오늘은 '{주제}'에 대해 함께 생각해 볼 거예요. 저는 답을 알려 주는 대신 질문을 던질게요. 먼저, 어떤 일이 일어날 것 같나요? 그렇게 예상하는 이유도 편하게 말해 주세요.",
    cer: "반가워요! 오늘은 '{주제}'에 대해 주장 → 증거 → 추론, 세 걸음으로 탐구해 볼 거예요. 먼저 내 주장부터 한 문장으로 말해 볼까요? 어떤 결과가 나올 것 같나요?",
    advanced: "반가워요! 오늘은 '{주제}'에 대해 한 걸음 더 깊이 논증해 볼 거예요. 먼저 내 주장과 근거를 말해 주세요. 그다음에는 그 주장이 통하지 않는 예외나 반례는 없는지, 어떤 조건에서만 맞는지도 함께 따져 봐요.",
    debate: "반가워요! 오늘은 '{주제}'를 두고 찬반 토론을 해 볼 거예요. 먼저 이 주제에 찬성인지 반대인지 내 입장을 정하고, 그 이유를 말해 주세요. 저는 반대편 입장에서 질문과 반론을 던지는 토론 상대가 되어 줄게요!",
    qna: "안녕! 나는 '{주제}' 탐구를 도와주는 도우미야. 실험하다가 측정 방법이나 준비물이 왜 필요한지, 조심할 점이 궁금하면 언제든지 물어봐!"
  };
  function greetingFor(templateKey) { return GREETINGS[templateKey] || DEFAULT_GREETING; }
  // 비어 있거나, 예전 기본 문구이거나, 어느 템플릿의 기본 인사말 그대로면 '직접 고치지 않은 인사말'이다
  function isDefaultGreeting(text) {
    var t = String(text || '').trim();
    if (!t || t === DEFAULT_GREETING) return true;
    for (var k in GREETINGS) if (GREETINGS[k] === t) return true;
    return false;
  }

  // 학생 화면의 "논증 가이드" 단계 (템플릿에 따라 단계 이름이 다르다)
  var STEPS = {
    socratic: [['주장', 'claim', '내 생각(가설)을 한 문장으로'], ['근거', 'evidence', '관찰한 사실, 뜻을 분명히 한 말'], ['정당화', 'warrant', '근거가 왜 주장을 뒷받침하는지'], ['반박', 'rebuttal', '다른 관점·예외를 생각해 보기']],
    cer: [['주장', 'claim', '내 생각(가설)을 한 문장으로'], ['증거', 'evidence', '관찰한 것, 측정한 값'], ['추론', 'warrant', '증거와 주장을 잇는 과학 원리']],
    debate: [['입장', 'claim', '찬성 또는 반대, 내 입장 정하기'], ['근거', 'evidence', '입장을 뒷받침하는 사실·관찰'], ['정당화', 'warrant', '그 근거가 입장을 지지하는 이유'], ['재반박', 'rebuttal', '상대의 반론에 근거로 맞서기'], ['결론', 'qualifier', '조건을 달아 입장 정리하기']],
    qna: [['측정 방법', 'claim', '무엇을 어떻게 재는지'], ['준비물·과정', 'evidence', '왜 필요한지, 다음은 무엇인지'], ['안전', 'warrant', '조심할 점은 무엇인지']],
    advanced: [['주장', 'claim', '내 생각(가설)'], ['근거', 'evidence', '관찰·자료'], ['정당화', 'warrant', '왜 뒷받침하는가'], ['반박', 'rebuttal', '예외나 반례'], ['한정어', 'qualifier', '성립하는 조건']]
  };

  function hasCharacter(id) {
    for (var i = 0; i < CHARACTERS.length; i++) if (CHARACTERS[i].id === id) return true;
    return false;
  }
  function getCharacter(id) {
    for (var i = 0; i < CHARACTERS.length; i++) if (CHARACTERS[i].id === id) return CHARACTERS[i];
    return CHARACTERS[0];
  }
  // 이 대화 방식(템플릿)의 짝 캐릭터. 모르는 템플릿이면 소크라테스 발문형의 짝.
  function characterFor(templateKey) {
    for (var i = 0; i < CHARACTERS.length; i++) if (CHARACTERS[i].template === templateKey) return CHARACTERS[i];
    return CHARACTERS[0];
  }
  // 예전 버전이 템플릿 줄에 미리 넣어 둔 캐릭터는 대화 방식과 맞지 않았다(찬반 토론형=비판적 사고 코치, 탐구 도우미=실험 가운 과학 선생님).
  // 시트에 그 값이 이름까지 그대로 남아 있으면 '고르지 않은 값'으로 보고 새 짝으로 바꿔 쓴다. 이름을 직접 바꾼 것은 그대로 둔다.
  var LEGACY_PAIRS = { debate: { id: 'coach', name: '비판적 사고 코치' }, qna: { id: 'labcoat', name: '실험 가운 과학 선생님' } };
  // 시트에 저장된 캐릭터 ID·이름을 실제로 쓸 값으로 정한다: 모르는 ID나 옛 기본 짝이면 템플릿의 짝, 이름이 비면 캐릭터의 기본 이름.
  // 이름이 '다른 캐릭터의 기본 이름'이면(예: 토론 파트너 그림에 '비판적 사고 코치') 남은 옛 값으로 보고 이 캐릭터의 기본 이름을 쓴다.
  function resolveCharacter(templateKey, id, name) {
    var nm = String(name == null ? '' : name).trim();
    var lg = LEGACY_PAIRS[templateKey];
    var legacy = !!lg && id === lg.id && (!nm || nm === lg.name);
    var ch = (legacy || !hasCharacter(id)) ? characterFor(templateKey) : getCharacter(id);
    var otherDefault = !!nm && CHARACTERS.some(function (c) { return c.id !== ch.id && c.name === nm; });
    return { id: ch.id, name: (legacy || otherDefault) ? ch.name : (nm || ch.name) };
  }
  // 시트의 페르소나 줄(row)과 '기본' 줄(base)로 실제로 보일 캐릭터를 정한다. 서버 resolveTopicConfig_ 와 같은 규칙이다.
  //  - 캐릭터 칸이 비었는데 '기본'과 다른 대화 방식이면, 기본의 캐릭터를 물려받지 않고 그 대화 방식의 짝을 쓴다
  //    (찬반 토론형 줄에 기본의 소크라테스가 붙지 않게). 기본과 같은 대화 방식이면 빈 칸은 기본을 따른다.
  //  - 캐릭터만 정하고 이름 칸을 비우면, 기본의 이름이 아니라 그 캐릭터의 이름을 쓴다.
  function personaCharacter(row, base) {
    row = row || {}; base = base || {};
    var baseTpl = base.templateKey || 'socratic', tpl = row.templateKey || baseTpl, id, name;
    if (row.characterId) { id = row.characterId; name = row.characterName || ''; }
    else if (tpl === baseTpl) { id = base.characterId || ''; name = row.characterName || base.characterName || ''; }
    else { id = ''; name = row.characterName || ''; }
    var r = resolveCharacter(tpl, id, name);
    return { id: r.id, name: r.name, templateKey: tpl };
  }

  function avatarHtml(id, state) {
    var ch = getCharacter(id);
    var st = AVATAR_STATES.indexOf(state) >= 0 ? state : 'asking';
    return '<div class="avatar" data-state="' + st + '" role="img" aria-label="' + ch.name + '">' +
      AVATAR_STATES.map(function (k) {
        return '<img class="av-' + k + '" src="' + avatarSrc(ch.id, k) + '" alt="" aria-hidden="true" decoding="async" draggable="false">';
      }).join('') + '</div>';
  }

  // "[주장]", "주장", "판단 유보" 등을 칩 색 클래스로 바꾼다
  function tagClass(label) {
    var t = String(label || '').replace(/[\[\]\s]/g, '');
    var map = {
      '주장': 'claim', '근거': 'evidence', '증거': 'evidence', '정당화': 'warrant', '추론': 'warrant',
      '반박': 'rebuttal', '한정어': 'qualifier', '회피': 'evade', '일탈': 'offtopic', '질문': 'question', '판단유보': 'hold'
    };
    return 'chip chip-' + (map[t] || 'hold');
  }
  function tagText(label) { return String(label || '').replace(/[\[\]]/g, '').trim(); }

  function applyGreeting(template, topic) {
    // 함수로 치환해야 주제 이름 속의 $&, $1 같은 글자가 특수 패턴으로 해석되지 않는다
    return String(template || DEFAULT_GREETING).replace(/\{주제\}/g, function () { return topic || '탐구 주제'; });
  }

  // 받침 유무에 따라 "이/가" 같은 조사를 고른다 (예: josa('소크라테스 선생님', '이', '가') → '이')
  function josa(word, withBatchim, withoutBatchim) {
    var s = String(word || '').trim();
    var code = s ? s.charCodeAt(s.length - 1) : 0;
    if (code >= 0xAC00 && code <= 0xD7A3) return (code - 0xAC00) % 28 !== 0 ? withBatchim : withoutBatchim;
    return withBatchim;
  }

  // 템플릿마다 학생 화면의 안내 문구가 다를 때(탐구 도우미 등)의 문구
  var MODE_TEXT = {
    qna: {
      guideTitle: '이런 걸 물어볼 수 있어요',
      placeholder: '궁금한 것을 물어보세요',
      topicHint: function (topic) { return "'" + topic + "' 실험을 하다가 측정 방법, 준비물이 왜 필요한지, 조심할 점이 궁금하면 편하게 물어보세요."; }
    }
  };

  // 학생 입장 화면·대화 화면의 안내 문구. AI가 실제로 하는 일은 대화 방식(템플릿)이 정하므로 문구도 캐릭터가 아니라 템플릿을 따른다.
  // hero: 맨 위 인사 카드의 한 줄, tutor: '○○가 함께해요' 아래 설명, states: 캐릭터 상태 글자(질문 대기 / 생각 중 / 칭찬 중),
  // wrapUp: 시간이 끝났을 때 '오늘의 탐구 요약' 카드의 마무리 안내 (찬반 토론에 '실험보고서'가 나오지 않게 방식마다 따로)
  var STUDENT_COPY = {
    socratic: {
      hero: '오늘의 탐구에서 나만의 가설을 세우고, 근거로 단단하게 만들어 볼까요?',
      tutor: '정답을 알려주는 대신, 질문으로 내 생각을 함께 키워 줘요.',
      states: { asking: '질문하는 중', thinking: '생각하는 중…', praising: '칭찬하는 중' },
      wrapUp: '오늘 세운 가설과 근거, 그렇게 생각한 이유를 정리해 탐구 보고서에 옮겨 보세요. 위로 스크롤하면 내 생각이 어떻게 자랐는지 다시 읽어 볼 수 있어요.'
    },
    cer: {
      hero: '오늘의 탐구에서 내 주장을 세우고, 증거와 과학 원리로 뒷받침해 볼까요?',
      tutor: '주장 → 증거 → 추론, 빠진 한 걸음을 힌트로 채워 줘요.',
      states: { asking: '다음 걸음을 묻는 중', thinking: '살펴보는 중…', praising: '칭찬하는 중' },
      wrapUp: '주장 → 증거 → 추론 순서로 오늘의 결론을 정리해 탐구 보고서에 써 보세요. 위로 스크롤하면 내가 찾은 증거를 다시 확인할 수 있어요.'
    },
    advanced: {
      hero: '오늘은 내 주장이 통하지 않는 예외와 반례까지 찾아, 한 걸음 더 깊이 논증해 볼까요?',
      tutor: '내 주장의 예외와 반례를 함께 찾고, 어떤 조건에서 맞는지 따져 줘요.',
      states: { asking: '반례를 찾는 중', thinking: '따져 보는 중…', praising: '칭찬하는 중' },
      wrapUp: '내 주장과 근거, 함께 찾은 반례와 주장이 맞는 조건까지 정리해 보고서에 써 보세요. 위로 스크롤하면 생각이 어떻게 깊어졌는지 다시 읽어 볼 수 있어요.'
    },
    debate: {
      hero: '오늘은 찬성과 반대 중 내 입장을 정하고, 근거로 반론에 맞서 볼까요?',
      tutor: '반대편에서 반론을 던져 줘요. 근거로 맞서며 내 입장을 단단하게 만들어 봐요.',
      states: { asking: '반론을 던지는 중', thinking: '반론을 고르는 중…', praising: '잘 맞섰다고 인정하는 중' },
      wrapUp: '내 입장과 근거, 반론에 어떻게 맞섰는지 정리해 나만의 결론을 써 보세요. 위로 스크롤하면 주고받은 반론과 재반박을 다시 읽어 볼 수 있어요.'
    },
    qna: {
      hero: '실험하다가 궁금한 점이 생기면 도우미에게 편하게 물어보세요.',
      tutor: '실험하다가 궁금한 건 편하게 물어보세요. 방법과 이유를 알려 줘요.',
      states: { asking: '궁금한 걸 기다리는 중', thinking: '찾아보는 중…', praising: '응원하는 중' },
      wrapUp: '도우미와 확인한 실험 방법과 주의할 점을 떠올리며 실험을 이어 가 보세요. 위로 스크롤하면 나눈 질문과 답을 다시 읽어 볼 수 있어요.'
    }
  };
  function studentCopy(templateKey) { return STUDENT_COPY[templateKey] || STUDENT_COPY.socratic; }

  // ---------- 테마 (학생 화면: 라이트 기본, 다크 전환) ----------
  var THEME_KEY = 'argu_student_theme';
  function getTheme() { try { return localStorage.getItem(THEME_KEY) || 'light'; } catch (e) { return 'light'; } }
  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* 저장 불가 환경은 무시 */ }
  }

  global.ArguShared = {
    CHARACTERS: CHARACTERS, TEMPLATE_NAMES: TEMPLATE_NAMES, DEFAULT_GREETING: DEFAULT_GREETING, GREETINGS: GREETINGS, greetingFor: greetingFor, isDefaultGreeting: isDefaultGreeting,
    STEPS: STEPS, MODE_TEXT: MODE_TEXT, STUDENT_COPY: STUDENT_COPY, studentCopy: studentCopy,
    getCharacter: getCharacter, hasCharacter: hasCharacter, characterFor: characterFor, resolveCharacter: resolveCharacter, personaCharacter: personaCharacter, avatarHtml: avatarHtml, avatarSrc: avatarSrc, AVATAR_STATES: AVATAR_STATES, tagClass: tagClass, tagText: tagText,
    applyGreeting: applyGreeting, josa: josa, getTheme: getTheme, setTheme: setTheme
  };
})(window);
