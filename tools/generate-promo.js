// 홍보용 16:9 배너 만들기 (OpenAI 이미지 API, 개발용 도구).
//   node tools/generate-promo.js            → 글자 넣은 판(text)과 글자 자리만 비운 판(clean)을 함께
//   node tools/generate-promo.js text       → 하나만
//   node tools/generate-promo.js entry      → 학생 입장 화면 배너(글자 없음)
//   node tools/generate-promo.js entry-title → 위 배너(가장 최근 entry-*.png)에 제목 두 줄을 얹은 판
// 참고 그림: 카툰 캐릭터 5명의 가장 최근 기준 그림 (화풍도 이 그림들이 잡는다. 공룡 옷 마스코트는 넣지 않는다)
// 결과: assets/promo/<종류>-<시각>.png (assets/ 는 .gitignore). 키는 화면에 찍지 않아요.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const env = {};
if (fs.existsSync(path.join(ROOT, '.env'))) {
  fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).forEach((line) => {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
}
const KEY = env.OPENAI_API_KEY || '';
const MODEL = env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst';
const CHAR_DIR = path.join(ROOT, env.IMAGE_OUTPUT_DIR || 'assets/characters', 'cartoon');
const STYLE_REF = path.join(ROOT, env.IMAGE_OUTPUT_DIR || 'assets/characters', 'reference', 'style-reference.webp');
const OUT = path.join(ROOT, 'assets', 'promo');
const mask = (s) => String(s || '').replace(/sk-[A-Za-z0-9_\-]{6,}/g, 'sk-***');
const IDS = ['socrates', 'labcoat', 'coach', 'debater', 'robot'];
const latest = (id) => { const f = fs.readdirSync(CHAR_DIR).filter((x) => x.startsWith(id + '-') && x.endsWith('.png')).sort(); return f.length ? path.join(CHAR_DIR, f[f.length - 1]) : null; };

const SCENE = [
  'Create a wide 16:9 promotional banner for a presentation slide, for "ARBOT", a web app where Korean middle and high school students practice scientific argumentation (claim, evidence, reasoning) by chatting with friendly AI tutor characters, from an argument-practice chatbot to a science-inquiry helper.',
  'The five attached images are the cast and the art style: the five AI tutor characters (Socrates teacher with laurel wreath, female lab-coat science teacher with ponytail, critical-thinking coach with round glasses and navy cardigan, buzz-cut debate partner with headset and blue/red jacket, cute white-and-teal robot with a test tube). Draw all five exactly as they look (same faces, hair, clothes, colors).',
  'Art style: the same cute Korean emoticon / sticker cartoon style as the references — clean bold dark outlines, flat colors with minimal soft shading, chibi proportions, warm muted pastel palette.',
  'Layout: one clear focal point, easy to grasp at a glance, lots of breathing room, not busy. Only these five characters (no other people, no mascot, no dinosaur or costume). Group them together on the RIGHT 55% of the image as a friendly team: Socrates slightly behind in the middle, the lab-coat teacher and the coach on either side, the debate partner and the cute robot in front, all smiling at the viewer, a few of them with small chat speech bubbles that contain only simple icons (a lightbulb, a magnifying glass, a check mark) and NO writing.',
  'Background: pure clean WHITE (#FFFFFF) across the whole image, with only a few very faint, sparse light-teal science doodles (atom, beaker, flask, molecule, small stars) and at most one very soft pale teal accent shape behind the group; keep the LEFT 45% white, calm and mostly empty for the title area.'
].join(' ');
// 학생 입장 화면(수업 입장 코드 위)에 붙일 2:1 배너. 글자 없이, 캐릭터들이 반갑게 맞이하는 장면.
const ENTRY = [
  'Create a wide welcome banner image for the entrance screen of a Korean middle/high school science learning app (shown above the "enter class code" box on a phone).',
  'The five attached images are the cast and the art style: Socrates teacher with laurel wreath, female lab-coat science teacher with ponytail, critical-thinking coach with round glasses and navy cardigan, buzz-cut debate partner with headset and blue/red jacket, cute white-and-teal robot with a test tube. Draw all five exactly as they look (same faces, hair, clothes, colors) in the same cute sticker cartoon style with clean bold outlines and flat colors.',
  'Scene: the five characters side by side in one friendly row, shown from the waist up, all smiling and waving hello toward the viewer as if welcoming a student into class; a couple of tiny speech bubbles with only a waving-hand or a sparkle icon (no writing).',
  'Background: soft, light sky-blue to mint gradient (#E6F1FD to #DDF6EF) with a few faint white science doodles (atom, beaker, stars), gentle and uncluttered.',
  'Composition: very wide horizontal banner; keep ALL characters, heads and hands fully inside the central horizontal band between 22% and 78% of the image height, with background only above and below that band, and some margin on the left and right.',
  'Absolutely no text, no letters, no numbers, no logos, no watermark.'
].join(' ');

// 학생 입장 배너에 제목을 넣은 판: 가장 최근 entry-*.png 를 바탕으로 같은 장면을 유지한 채 위쪽에 제목 두 줄을 얹는다
const ENTRY_TITLE = [
  'Redraw the attached banner image keeping it the same: the same five characters (same faces, hair, clothes, colors, waving poses, order), the same cute bold-outline cartoon style, the same light sky-blue to mint gradient background and faint white science doodles.',
  'Change only the layout: make the row of characters slightly smaller and move it lower so the characters sit between 42% and 92% of the image height,',
  'and add a centered title in the top area between 10% and 36% of the image height (nothing in the top 8%):',
  'line 1, large, bold, rounded, very legible, deep navy (#12304F): "ARBOT 아르봇";',
  'line 2 just below, medium size, bold, teal (#0E8C76): "과학적 논증 웹앱".',
  'Spell the text exactly as given, no other text, no letters elsewhere, no speech-bubble text, no logos, no watermark. Keep the title clear of characters and doodles.'
].join(' ');
const latestEntry = () => { const f = fs.readdirSync(OUT).filter((x) => /^entry-\d/.test(x) && x.endsWith('.png')).sort(); return f.length ? path.join(OUT, f[f.length - 1]) : null; };
const VARIANT_FILES = { 'entry-title': () => [latestEntry()] }; // 기본은 캐릭터 5명 그림

const VARIANTS = {
  entry: ENTRY,
  'entry-title': ENTRY_TITLE,
  text: SCENE + ' Typography on the LEFT side, large, bold, rounded and very legible, exactly these Korean/English texts and nothing else, spelled exactly:' +
    ' line 1 (largest, deep navy #12304F): "ARBOT 아르봇"; line 2 (medium, teal #0E8C76): "과학적 논증 웹앱"; line 3 (smaller, dark gray): "논증 연습부터 탐구 도우미까지".' +
    ' No other text, no watermark, no logos.',
  clean: SCENE + ' Leave the LEFT 45% as a clean, calm empty area for a title that will be added later. Absolutely no text, no letters, no numbers, no watermark, no logos anywhere.'
};

async function edit(prompt, files, size) {
  const fd = new FormData();
  Object.entries({ model: MODEL, prompt, size, quality: 'high', n: 1 }).forEach(([k, v]) => fd.append(k, String(v)));
  files.forEach((f) => fd.append('image[]', new Blob([fs.readFileSync(f)], { type: f.endsWith('.webp') ? 'image/webp' : 'image/png' }), path.basename(f)));
  const res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: 'Bearer ' + KEY }, body: fd });
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => ({})) };
}

async function make(name, files) {
  // 16:9 를 바로 받을 수 있으면 그대로, 아니면 3:2 로 받아 나중에 16:9 로 자른다
  let used = null, r = null;
  for (const size of ['1920x1080', '1792x1024', '1536x1024']) {
    r = await edit(VARIANTS[name], files, size);
    if (r.ok) { used = size; break; }
    if (!(r.status === 400 && /size/i.test(JSON.stringify(r.json)))) break;
  }
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status} ${mask((r.json.error && r.json.error.message) || JSON.stringify(r.json)).slice(0, 300)}`);
  const item = r.json.data && r.json.data[0];
  if (!item || !item.b64_json) throw new Error(`${name}: 이미지 데이터가 없어요`);
  fs.mkdirSync(OUT, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
  const file = path.join(OUT, `${name}-${stamp}.png`);
  fs.writeFileSync(file, Buffer.from(item.b64_json, 'base64'));
  return `${name} → ${path.relative(ROOT, file)} (${used}, ${Math.round(fs.statSync(file).size / 1024)} KB, tokens in ${r.json.usage && r.json.usage.input_tokens} / out ${r.json.usage && r.json.usage.output_tokens})`;
}

(async () => {
  if (!/^sk-/.test(KEY)) { console.error('.env 의 OPENAI_API_KEY 가 비어 있어요.'); process.exit(1); }
  const files = IDS.map(latest);
  if (files.some((f) => !f || !fs.existsSync(f))) { console.error('참고 그림이 빠져 있어요.'); process.exit(1); }
  const want = process.argv.slice(2).filter((a) => VARIANTS[a]);
  const names = want.length ? want : ['text', 'clean']; // entry(학생 입장 배너)는 이름을 적을 때만
  console.log('참고 그림: ' + files.map((f) => path.basename(f)).join(', '));
  const rs = await Promise.allSettled(names.map((n) => make(n, VARIANT_FILES[n] ? VARIANT_FILES[n]() : files)));
  let failed = 0;
  rs.forEach((r) => { if (r.status === 'fulfilled') console.log('✓ ' + r.value); else { failed++; console.log('✗ ' + mask(r.reason && r.reason.message)); } });
  process.exit(failed ? 1 : 0);
})();
