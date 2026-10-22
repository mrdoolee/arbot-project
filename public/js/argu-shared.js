// 교사 콘솔과 학생 화면이 함께 쓰는 공통 데이터: 캐릭터 일러스트, 논증 단계, 판정 칩 규칙, 테마.
(function (global) {
  // ---------- 아이콘 폰트 로딩 감지 (로드 전에는 아이콘 이름 글자가 보이지 않게 숨김) ----------
  try {
    var showIcons = function () { document.documentElement.classList.add('icons-ready'); };
    document.fonts.load('24px "Material Symbols Outlined"').then(showIcons, showIcons);
    // 폰트가 차단되거나 오래 걸려도 버튼이 영영 보이지 않는 일이 없도록, 4초 뒤에는 보이게 한다
    setTimeout(showIcons, 4000);
  } catch (e) { document.documentElement.classList.add('icons-ready'); }

  // ---------- 캐릭터 일러스트 ----------
  function mouths(cx, cy, c) {
    return (
      '<g class="m-ask"><ellipse cx="' + cx + '" cy="' + cy + '" rx="5" ry="3.6" fill="' + c + '"/></g>' +
      '<g class="m-think"><path d="M' + (cx - 6) + ' ' + cy + ' L' + (cx + 6) + ' ' + cy + '" stroke="' + c + '" stroke-width="3" stroke-linecap="round" fill="none"/></g>' +
      '<g class="m-happy"><path d="M' + (cx - 9) + ' ' + (cy - 3) + ' Q' + cx + ' ' + (cy + 9) + ' ' + (cx + 9) + ' ' + (cy - 3) + '" stroke="' + c + '" stroke-width="3" stroke-linecap="round" fill="none"/></g>'
    );
  }

  function laurel() {
    var out = '';
    for (var i = 0; i < 9; i++) {
      var deg = -165 + i * (150 / 8);
      var rad = deg * Math.PI / 180;
      var x = (100 + 41 * Math.cos(rad)).toFixed(1);
      var y = (96 + 43 * Math.sin(rad)).toFixed(1);
      out += '<ellipse cx="' + x + '" cy="' + y + '" rx="9" ry="4" transform="rotate(' + (deg + 90) + ' ' + x + ' ' + y + ')" fill="' + (i % 2 ? '#4f9a4a' : '#6bbf5e') + '"/>';
    }
    return out;
  }

  var SVG = {
    socrates:
      '<path d="M18 200 C18 166 54 150 100 150 C146 150 182 166 182 200 Z" fill="#f5f0e6"/>' +
      '<path d="M100 150 L138 200 L116 200 L88 156 Z" fill="#e4dac4"/>' +
      '<rect x="88" y="126" width="24" height="30" rx="8" fill="#ebbe92"/>' +
      '<ellipse cx="64" cy="98" rx="7" ry="9" fill="#ebbe92"/><ellipse cx="136" cy="98" rx="7" ry="9" fill="#ebbe92"/>' +
      '<ellipse cx="62" cy="88" rx="8" ry="17" fill="#d9d9e0"/><ellipse cx="138" cy="88" rx="8" ry="17" fill="#d9d9e0"/>' +
      '<ellipse cx="100" cy="98" rx="36" ry="40" fill="#f1c9a0"/>' +
      '<path d="M65 106 C65 142 86 152 100 152 C114 152 135 142 135 106 C129 124 116 128 100 128 C84 128 71 124 65 106 Z" fill="#ececf1"/>' +
      '<path d="M82 112 C90 105 96 107 100 112 C104 107 110 105 118 112 C110 119 104 117 100 114 C96 117 90 119 82 112 Z" fill="#ececf1"/>' +
      laurel() +
      '<path d="M78 84 Q86 79 94 84" stroke="#a8a8b4" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<path d="M106 84 Q114 79 122 84" stroke="#a8a8b4" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<circle cx="86" cy="97" r="3.2" fill="#2b2b3a"/><circle cx="114" cy="97" r="3.2" fill="#2b2b3a"/>' +
      '<ellipse cx="78" cy="108" rx="6" ry="3.5" fill="#f4a8a0" opacity=".45"/><ellipse cx="122" cy="108" rx="6" ry="3.5" fill="#f4a8a0" opacity=".45"/>' +
      mouths(100, 121, '#9a4a4a'),

    labcoat:
      '<ellipse cx="100" cy="94" rx="45" ry="48" fill="#4a3426"/>' +
      '<path d="M18 200 C18 166 54 150 100 150 C146 150 182 166 182 200 Z" fill="#ffffff" stroke="#d7e0ec" stroke-width="2"/>' +
      '<path d="M86 152 L100 180 L114 152 Z" fill="#22c1a3"/>' +
      '<path d="M86 152 L72 176 M114 152 L128 176" stroke="#d7e0ec" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<rect x="89" y="126" width="22" height="28" rx="8" fill="#f2c7a5"/>' +
      '<ellipse cx="100" cy="98" rx="35" ry="39" fill="#f6d2b4"/>' +
      '<path d="M64 88 C68 62 132 62 136 88 C124 76 112 73 100 73 C88 73 76 76 64 88 Z" fill="#4a3426"/>' +
      '<path d="M66 70 Q100 56 134 70" stroke="#22c1a3" stroke-width="5" fill="none" stroke-linecap="round"/>' +
      '<circle cx="84" cy="66" r="10" fill="rgba(255,255,255,.45)" stroke="#22c1a3" stroke-width="4"/>' +
      '<circle cx="116" cy="66" r="10" fill="rgba(255,255,255,.45)" stroke="#22c1a3" stroke-width="4"/>' +
      '<path d="M94 66 L106 66" stroke="#22c1a3" stroke-width="4"/>' +
      '<path d="M76 90 Q84 85 92 90" stroke="#4a3426" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<path d="M108 90 Q116 85 124 90" stroke="#4a3426" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<circle cx="86" cy="100" r="3.2" fill="#2b2b3a"/><circle cx="114" cy="100" r="3.2" fill="#2b2b3a"/>' +
      '<ellipse cx="76" cy="111" rx="6" ry="3.5" fill="#f4a8a0" opacity=".55"/><ellipse cx="124" cy="111" rx="6" ry="3.5" fill="#f4a8a0" opacity=".55"/>' +
      mouths(100, 119, '#b05a5a'),

    coach:
      '<rect x="10" y="22" width="64" height="46" rx="6" fill="#1f4a3f" stroke="#8a6b3f" stroke-width="4"/>' +
      '<text x="24" y="56" font-size="30" fill="#e8f3ef" font-family="Noto Sans KR, sans-serif" font-weight="700">?</text>' +
      '<path d="M44 34 L66 34 M44 44 L60 44 M48 54 L66 54" stroke="#e8f3ef" stroke-width="2.5" stroke-linecap="round" opacity=".8"/>' +
      '<path d="M18 200 C18 166 54 150 100 150 C146 150 182 166 182 200 Z" fill="#12304f"/>' +
      '<path d="M86 152 L100 182 L114 152 Z" fill="#ffffff"/>' +
      '<path d="M100 164 L95 174 L100 190 L105 174 Z" fill="#3b7dd8"/>' +
      '<rect x="89" y="126" width="22" height="28" rx="8" fill="#e9b88c"/>' +
      '<ellipse cx="100" cy="98" rx="35" ry="39" fill="#f0c49c"/>' +
      '<path d="M61 96 C54 36 146 36 139 96 C134 78 120 66 100 66 C80 66 66 78 61 96 Z" fill="#23232d"/>' +
      '<circle cx="85" cy="99" r="12" fill="rgba(255,255,255,.35)" stroke="#12304f" stroke-width="3.5"/>' +
      '<circle cx="115" cy="99" r="12" fill="rgba(255,255,255,.35)" stroke="#12304f" stroke-width="3.5"/>' +
      '<path d="M97 99 L103 99" stroke="#12304f" stroke-width="3.5"/>' +
      '<path d="M74 86 Q84 80 94 85" stroke="#23232d" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
      '<path d="M106 85 Q116 80 126 86" stroke="#23232d" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
      '<circle cx="85" cy="99" r="3.2" fill="#2b2b3a"/><circle cx="115" cy="99" r="3.2" fill="#2b2b3a"/>' +
      mouths(100, 122, '#9a4a4a'),

    robot:
      '<rect x="58" y="142" width="84" height="64" rx="20" fill="#4f8ef7"/>' +
      '<circle cx="100" cy="168" r="9" fill="#6ef9d9"/>' +
      '<rect x="90" y="126" width="20" height="18" rx="4" fill="#bbd4f7"/>' +
      '<rect x="46" y="84" width="9" height="22" rx="4" fill="#22c1a3"/><rect x="145" y="84" width="9" height="22" rx="4" fill="#22c1a3"/>' +
      '<line x1="100" y1="54" x2="100" y2="36" stroke="#22c1a3" stroke-width="4" stroke-linecap="round"/>' +
      '<circle cx="100" cy="31" r="7" fill="#4f8ef7"/>' +
      '<rect x="55" y="54" width="90" height="78" rx="24" fill="#e8f6f3" stroke="#22c1a3" stroke-width="4"/>' +
      '<rect x="67" y="68" width="66" height="50" rx="15" fill="#0f2a3d"/>' +
      '<circle cx="86" cy="86" r="7" fill="#6ef9d9"/><circle cx="114" cy="86" r="7" fill="#6ef9d9"/>' +
      '<circle cx="88" cy="84" r="2" fill="#ffffff"/><circle cx="116" cy="84" r="2" fill="#ffffff"/>' +
      mouths(100, 106, '#6ef9d9'),

    debater:
      // 양쪽 입장을 뜻하는 찬(파랑) · 반(빨강) 말풍선
      '<rect x="24" y="36" width="42" height="32" rx="10" fill="#3b7dd8"/><path d="M50 66 L60 80 L38 67 Z" fill="#3b7dd8"/>' +
      '<text x="45" y="59" font-size="19" font-weight="800" fill="#ffffff" text-anchor="middle" font-family="Noto Sans KR, sans-serif">찬</text>' +
      '<rect x="134" y="36" width="42" height="32" rx="10" fill="#e5484d"/><path d="M150 66 L140 80 L162 67 Z" fill="#e5484d"/>' +
      '<text x="155" y="59" font-size="19" font-weight="800" fill="#ffffff" text-anchor="middle" font-family="Noto Sans KR, sans-serif">반</text>' +
      '<path d="M18 200 C18 166 54 150 100 150 C146 150 182 166 182 200 Z" fill="#2f3550"/>' +
      '<path d="M86 152 L100 182 L114 152 Z" fill="#ffffff"/>' +
      '<path d="M86 152 L74 178 M114 152 L126 178" stroke="#1f2338" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<path d="M100 164 L95 174 L100 192 Z" fill="#3b7dd8"/><path d="M100 164 L105 174 L100 192 Z" fill="#e5484d"/>' +
      '<rect x="89" y="126" width="22" height="28" rx="8" fill="#e9b88c"/>' +
      '<ellipse cx="65" cy="100" rx="6" ry="8" fill="#e5ad80"/><ellipse cx="135" cy="100" rx="6" ry="8" fill="#e5ad80"/>' +
      '<ellipse cx="100" cy="98" rx="35" ry="39" fill="#f1c7a0"/>' +
      '<path d="M62 94 C54 40 146 40 138 94 C134 76 124 66 106 63 C92 70 76 72 62 94 Z" fill="#5a3a2a"/>' +
      '<path d="M84 62 C90 48 112 46 122 60 C110 56 98 58 84 62 Z" fill="#5a3a2a"/>' +
      // 토론용 헤드셋과 마이크
      '<path d="M63 96 C58 42 142 42 137 96" stroke="#3b7dd8" stroke-width="5" fill="none" stroke-linecap="round"/>' +
      '<rect x="56" y="90" width="12" height="24" rx="6" fill="#2f68b3"/><rect x="132" y="90" width="12" height="24" rx="6" fill="#2f68b3"/>' +
      '<path d="M60 112 C60 128 72 134 82 128" stroke="#2f68b3" stroke-width="3.5" fill="none" stroke-linecap="round"/><circle cx="84" cy="127" r="4.5" fill="#1f4a8a"/>' +
      '<path d="M75 88 Q85 82 95 86" stroke="#3a2a22" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
      '<path d="M105 86 Q115 82 125 88" stroke="#3a2a22" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
      '<circle cx="86" cy="99" r="3.2" fill="#2b2b3a"/><circle cx="114" cy="99" r="3.2" fill="#2b2b3a"/>' +
      '<ellipse cx="124" cy="110" rx="6" ry="3.5" fill="#f4a8a0" opacity=".5"/>' +
      mouths(100, 122, '#9a4a4a')
  };

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
    return '<div class="avatar" data-state="' + (state || 'asking') + '" role="img" aria-label="' + ch.name + '">' +
      '<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + SVG[ch.id] + '</svg></div>';
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
  // hero: 맨 위 인사 카드의 한 줄, tutor: '○○가 함께해요' 아래 설명, states: 캐릭터 상태 글자(질문 대기 / 생각 중 / 칭찬 중)
  var STUDENT_COPY = {
    socratic: {
      hero: '오늘의 탐구에서 나만의 가설을 세우고, 근거로 단단하게 만들어 볼까요?',
      tutor: '정답을 알려주는 대신, 질문으로 내 생각을 함께 키워 줘요.',
      states: { asking: '질문하는 중', thinking: '생각하는 중…', praising: '칭찬하는 중' }
    },
    cer: {
      hero: '오늘의 탐구에서 내 주장을 세우고, 증거와 과학 원리로 뒷받침해 볼까요?',
      tutor: '주장 → 증거 → 추론, 빠진 한 걸음을 힌트로 채워 줘요.',
      states: { asking: '다음 걸음을 묻는 중', thinking: '살펴보는 중…', praising: '칭찬하는 중' }
    },
    advanced: {
      hero: '오늘은 내 주장이 통하지 않는 예외와 반례까지 찾아, 한 걸음 더 깊이 논증해 볼까요?',
      tutor: '내 주장의 예외와 반례를 함께 찾고, 어떤 조건에서 맞는지 따져 줘요.',
      states: { asking: '반례를 찾는 중', thinking: '따져 보는 중…', praising: '칭찬하는 중' }
    },
    debate: {
      hero: '오늘은 찬성과 반대 중 내 입장을 정하고, 근거로 반론에 맞서 볼까요?',
      tutor: '반대편에서 반론을 던져 줘요. 근거로 맞서며 내 입장을 단단하게 만들어 봐요.',
      states: { asking: '반론을 던지는 중', thinking: '반론을 고르는 중…', praising: '잘 맞섰다고 인정하는 중' }
    },
    qna: {
      hero: '실험하다가 궁금한 점이 생기면 도우미에게 편하게 물어보세요.',
      tutor: '실험하다가 궁금한 건 편하게 물어보세요. 방법과 이유를 알려 줘요.',
      states: { asking: '궁금한 걸 기다리는 중', thinking: '찾아보는 중…', praising: '응원하는 중' }
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
    getCharacter: getCharacter, hasCharacter: hasCharacter, characterFor: characterFor, resolveCharacter: resolveCharacter, personaCharacter: personaCharacter, avatarHtml: avatarHtml, tagClass: tagClass, tagText: tagText,
    applyGreeting: applyGreeting, josa: josa, getTheme: getTheme, setTheme: setTheme
  };
})(window);
