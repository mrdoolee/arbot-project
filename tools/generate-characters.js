// 캐릭터 그림 시안 만들기 (OpenAI 이미지 API). 사이트와는 상관없는 개발용 도구예요.
//   node tools/generate-characters.js                       → 3D 세트, 5명 모두
//   node tools/generate-characters.js --set cartoon         → 카툰 세트(참고 그림의 화풍), 5명 모두
//   node tools/generate-characters.js --set cartoon robot   → 고른 캐릭터만
// .env 의 OPENAI_API_KEY / OPENAI_IMAGE_MODEL / IMAGE_OUTPUT_DIR 를 읽어요.
// 3D 세트는 IMAGE_OUTPUT_DIR 에, 카툰 세트는 IMAGE_OUTPUT_DIR/cartoon 에 <id>-<시각>.png 로 저장해요(이전 시안은 지우지 않아요).
// 키는 화면에 찍지 않고, 오류 문구에 섞여 나와도 가려서 보여 줘요.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
function readEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line) => {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
  return out;
}
const env = Object.assign(readEnv(path.join(ROOT, '.env')), process.env.OPENAI_API_KEY ? { OPENAI_API_KEY: process.env.OPENAI_API_KEY } : {});
const KEY = env.OPENAI_API_KEY || '';
const MODEL = env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst';
const BASE_OUT = path.join(ROOT, env.IMAGE_OUTPUT_DIR || 'assets/characters');
const mask = (s) => String(s || '').replace(/sk-[A-Za-z0-9_\-]{6,}/g, 'sk-***');

// 화풍 세트. 다섯 캐릭터가 한 세트로 보이도록 같은 화풍 문장을 붙인다. 글자는 넣지 않는다(그림 속 한글이 깨지기 쉬움).
const SETS = {
  '3d': {
    out: BASE_OUT,
    style: [
      'Character portrait for a Korean middle/high school science learning app, used as a round chat avatar.',
      'Style: warm, polished 3D-rendered character in the look of a modern animated film, soft studio lighting, gentle rim light,',
      'subtle skin and fabric texture, rounded friendly proportions, expressive kind eyes, natural colors (not flat vector, not clip-art).',
      'Framing: head and upper body, centered, facing the viewer with a slight three-quarter turn, friendly closed-mouth smile,',
      'fully inside the frame with some margin so it fits a circle crop. Plain transparent background, no scenery, no props cut off.',
      'No text, no letters, no logos, no watermark. Same art style, lighting and level of detail as the other characters in the set.'
    ].join(' ')
  },
  // 사용자가 준 참고 그림(assets/characters/reference/style-reference.webp)의 화풍만 따라 그린다
  cartoon: {
    out: path.join(BASE_OUT, 'cartoon'),
    reference: path.join(BASE_OUT, 'reference', 'style-reference.webp'),
    style: [
      'The attached image is a STYLE REFERENCE ONLY. Copy its art style exactly, but draw a completely different character described below:',
      'do NOT draw the person in the reference, do NOT add a dinosaur costume, hood, spikes or tail, and do not copy its pose.',
      'Art style to match: cute Korean emoticon / sticker style cartoon, clean bold dark outlines of even weight, flat colors with',
      'only very soft minimal shading, simple round dot eyes with a tiny highlight, small simple smile, soft rosy cheeks,',
      'chibi proportions with a big round head and a small body, warm muted pastel palette, friendly and playful.',
      'Purpose: round chat avatar in a Korean middle/high school science learning app.',
      'Framing: head and upper body (waist up), centered, facing the viewer, the whole character inside the frame with margin so it fits a circle crop.',
      'Plain transparent background, no scenery. No text, no letters, no logos, no watermark.',
      'Same style, outline weight and level of detail for every character in the set.'
    ].join(' ')
  }
};

const CHARACTERS = {
  socrates: 'Character: "Socrates teacher" — a gentle elderly Greek philosopher with a neat white beard and kind smile, a green laurel wreath on his head, wearing a soft cream toga with a blue sash. Warm, wise, encouraging; he asks questions instead of giving answers.',
  labcoat: 'Character: "lab-coat science teacher" — a friendly young East Asian WOMAN science teacher with long dark hair tied in a low ponytail with a few loose strands, wearing a clean white lab coat over a light blue shirt, clear safety goggles pushed up on her head, holding a small clipboard. Curious, approachable, careful about evidence. (She must look clearly different from the other characters: female, ponytail, no glasses.)',
  coach: 'Character: "critical thinking coach" — an energetic East Asian teacher in his thirties with round glasses and a navy cardigan over a white shirt, holding a chalk marker, one hand raised as if pointing out an interesting counter-example. Sharp but kind.',
  debater: 'Character: "debate partner" — a cheerful East Asian high-school BOY with a very short sporty buzz cut (short spiky hair, clearly different from the fluffy hair of the other characters), a slim headset microphone, a jacket that is blue on one side and red on the other (the two sides of a debate), small blue and red speech-bubble pins on the collar with no writing, a confident grin. Confident, playful, respectful. (No glasses.)',
  robot: 'Character: "science assistant robot" — a cute, rounded, friendly robot with a glossy white and teal body, a dark visor face with two glowing cyan eyes, small antenna, holding a test tube with a teal liquid. Helpful and cheerful, toy-like but well crafted.'
};

// 표정 3가지 (학생 화면의 캐릭터 상태: 질문하는 중 / 생각하는 중 / 칭찬하는 중)
const EXPRESSIONS = {
  asking: 'Expression "asking a question": curious friendly look, eyebrows slightly raised, head tilted a little, small open smile as if asking "what do you think?", one hand open toward the viewer inviting an answer.',
  thinking: 'Expression "thinking": eyes looking up to one side, mouth small and slightly pursed, one hand touching the chin, a calm pondering look; you may add two or three tiny sparkle marks near the head (no text, no symbols with letters, no question marks).',
  praising: 'Expression "praising": very happy, big open smile, eyes closed into happy upward crescents, giving a thumbs up or clapping, a few small yellow sparkle marks around; warm and encouraging.'
};
const ROBOT_FACE = ' This character is a robot: show the expression with the glowing eyes and mouth on its dark visor screen (e.g. curved happy eyes, eyes glancing up), keep the visor and body unchanged.';

// 캐릭터의 기준 그림: cartoon 폴더에서 <id>-*.png 중 가장 최근 것
function latestBase(dir, id) {
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(id + '-') && f.endsWith('.png')).sort();
  return files.length ? path.join(dir, files[files.length - 1]) : null;
}

// 기준 그림 한 장으로 같은 인물의 표정만 바꾼 그림을 만든다 (images/edits)
async function generateExpression(set, id, state, baseFile) {
  const prompt = [
    'Redraw EXACTLY the same character as in the attached image: same face shape, hair, clothes, colors, accessories, proportions,',
    'same bold outline style and flat coloring, same size and position in the frame (head and upper body, centered).',
    'Change ONLY the facial expression and the hand gesture as described. Plain transparent background. No text, no letters.',
    EXPRESSIONS[state] + (id === 'robot' ? ROBOT_FACE : '')
  ].join(' ');
  const opts = { model: MODEL, prompt, size: '1024x1024', quality: 'high', background: 'transparent', output_format: 'png', n: 1 };
  let r = await postEdit(opts, baseFile, 'image[]');
  if (!r.ok && r.status === 400 && /image/i.test(JSON.stringify(r.json))) r = await postEdit(opts, baseFile, 'image');
  if (!r.ok) throw new Error(`${id}/${state}: HTTP ${r.status} ${mask((r.json.error && r.json.error.message) || JSON.stringify(r.json)).slice(0, 300)}`);
  const item = r.json.data && r.json.data[0];
  if (!item || !item.b64_json) throw new Error(`${id}/${state}: 이미지 데이터가 없어요`);
  const out = path.join(set.out, 'expressions');
  fs.mkdirSync(out, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
  const file = path.join(out, `${id}-${state}-${stamp}.png`);
  fs.writeFileSync(file, Buffer.from(item.b64_json, 'base64'));
  return { id: id + '/' + state, file: path.relative(ROOT, file), kb: Math.round(fs.statSync(file).size / 1024), usage: r.json.usage || null };
}

async function postJson(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY }, body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => ({})) };
}
// 참고 그림을 붙이는 요청(images/edits, multipart). 필드 이름은 image[] (여러 장을 받는 모델) → 안 되면 image 로 한 번 더.
async function postEdit(fields, refFile, fieldName) {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => fd.append(k, String(v)));
  const type = refFile.endsWith('.webp') ? 'image/webp' : refFile.endsWith('.jpg') || refFile.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
  fd.append(fieldName, new Blob([fs.readFileSync(refFile)], { type }), path.basename(refFile));
  const res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: 'Bearer ' + KEY }, body: fd });
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => ({})) };
}

async function generate(set, id) {
  const prompt = set.style + ' ' + CHARACTERS[id];
  const opts = { model: MODEL, prompt, size: '1024x1024', quality: 'high', background: 'transparent', output_format: 'png', n: 1 };
  const plain = (o) => { const { background, output_format, ...rest } = o; return rest; };
  const optionError = (r) => !r.ok && r.status === 400 && /background|output_format|transparent/i.test(JSON.stringify(r.json));
  let r;
  if (set.reference) {
    r = await postEdit(opts, set.reference, 'image[]');
    if (!r.ok && r.status === 400 && /image/i.test(JSON.stringify(r.json)) && !optionError(r)) r = await postEdit(opts, set.reference, 'image');
    if (optionError(r)) r = await postEdit(plain(opts), set.reference, 'image[]');
  } else {
    r = await postJson('https://api.openai.com/v1/images/generations', opts);
    if (optionError(r)) r = await postJson('https://api.openai.com/v1/images/generations', plain(opts));
  }
  if (!r.ok) throw new Error(`${id}: HTTP ${r.status} ${mask((r.json.error && r.json.error.message) || JSON.stringify(r.json)).slice(0, 300)}`);
  const item = r.json.data && r.json.data[0];
  if (!item || !item.b64_json) throw new Error(`${id}: 이미지 데이터가 없어요 (${mask(JSON.stringify(r.json)).slice(0, 200)})`);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
  const file = path.join(set.out, `${id}-${stamp}.png`);
  fs.writeFileSync(file, Buffer.from(item.b64_json, 'base64'));
  return { id, file: path.relative(ROOT, file), kb: Math.round(fs.statSync(file).size / 1024), usage: r.json.usage || null };
}

(async () => {
  if (!/^sk-/.test(KEY)) { console.error('.env 의 OPENAI_API_KEY 가 비어 있거나 sk- 로 시작하지 않아요.'); process.exit(1); }
  const args = process.argv.slice(2);
  const si = args.indexOf('--set');
  const setName = si >= 0 ? args[si + 1] : '3d';
  const set = SETS[setName];
  if (!set) { console.error('알 수 없는 세트: ' + setName + ' (쓸 수 있는 것: ' + Object.keys(SETS).join(', ') + ')'); process.exit(1); }
  if (set.reference && !fs.existsSync(set.reference)) { console.error('참고 그림이 없어요: ' + path.relative(ROOT, set.reference)); process.exit(1); }
  const want = args.filter((a) => CHARACTERS[a]);
  const ids = want.length ? want : Object.keys(CHARACTERS);
  fs.mkdirSync(set.out, { recursive: true });
  // --expressions: 각 캐릭터의 가장 최근 기준 그림으로 표정 3장(asking·thinking·praising)을 만든다
  const expr = args.includes('--expressions');
  let jobs;
  if (expr) {
    const states = args.filter((a) => EXPRESSIONS[a]);
    const useStates = states.length ? states : Object.keys(EXPRESSIONS);
    jobs = [];
    for (const id of ids) {
      const base = latestBase(set.out, id);
      if (!base) { console.error(`${id}: 기준 그림이 없어요 (${path.relative(ROOT, set.out)})`); process.exit(1); }
      console.log(`${id} 기준 그림: ${path.relative(ROOT, base)}`);
      useStates.forEach((st) => jobs.push(() => generateExpression(set, id, st, base)));
    }
  } else {
    jobs = ids.map((id) => () => generate(set, id));
  }
  console.log(`세트 ${setName} · 모델 ${MODEL} · ${expr ? '표정 ' : ''}${jobs.length}장 · 저장 폴더 ${path.relative(ROOT, set.out)}`);
  // 한꺼번에 너무 많이 보내지 않게 5장씩 나눠 보낸다
  const results = [];
  for (let i = 0; i < jobs.length; i += 5) results.push(...await Promise.allSettled(jobs.slice(i, i + 5).map((j) => j())));
  let failed = 0;
  results.forEach((r) => {
    if (r.status === 'fulfilled') console.log(`✓ ${r.value.id} → ${r.value.file} (${r.value.kb} KB)` + (r.value.usage ? ` · tokens in ${r.value.usage.input_tokens} / out ${r.value.usage.output_tokens}` : ''));
    else { failed++; console.log('✗ ' + mask(r.reason && r.reason.message)); }
  });
  process.exit(failed ? 1 : 0);
})();
