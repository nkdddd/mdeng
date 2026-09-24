#!/usr/bin/env node
/* 또박또박 받아쓰기 — 자연스러운 목소리 녹음 파일 만들기
 *
 *   npm install
 *   npm run audio                       # 무료: Edge 소리 내어 읽기(신경망 음성)
 *   npm run audio -- --voice ko-KR-InJoonNeural
 *   AZURE_SPEECH_KEY=... AZURE_SPEECH_REGION=koreacentral npm run audio   # 공식 Azure Speech
 *
 * 옵션
 *   --voice <이름>  ko-KR-SunHiNeural(기본, 여자) · ko-KR-InJoonNeural(남자) · ko-KR-HyunsuMultilingualNeural 등
 *   --rate <값>     말 빠르기. 기본 -8% (아이용으로 조금 천천히)
 *   --force         이미 있는 파일도 다시 만들기
 *   --dry           파일을 만들지 않고 말 목록만 보여 주기
 *
 * 결과: audio/<이름표>.mp3 파일들과 js/clips.js(파일 목록)
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes('--' + name);
const voice = opt('voice', 'ko-KR-SunHiNeural');
const rate = opt('rate', '-8%');

/* 앱과 똑같은 데이터·이름표 규칙을 불러와요 */
const ctx = vm.createContext({});
for (const f of ['js/data.js', 'js/voice.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
const VOICE = vm.runInContext('VOICE', ctx);
const phrases = VOICE.allPhrases();
const outDir = path.join(root, 'audio');
fs.mkdirSync(outDir, { recursive: true });

if (flag('dry')) {
  phrases.forEach((p) => console.log(VOICE.key(p), p));
  console.log(`\n말 ${phrases.length}개, 글자 ${phrases.reduce((a, p) => a + p.length, 0)}자`);
  process.exit(0);
}

const xml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 방법 1: 공식 Azure Speech (키가 있을 때) */
async function makeAzure() {
  const key = process.env.AZURE_SPEECH_KEY, region = process.env.AZURE_SPEECH_REGION || 'koreacentral';
  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  return async (text) => {
    const ssml = `<speak version="1.0" xml:lang="ko-KR"><voice name="${voice}"><prosody rate="${rate}">${xml(text)}</prosody></voice></speak>`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'ttobak-dictation',
      },
      body: ssml,
    });
    if (!res.ok) throw new Error(`Azure ${res.status} ${await res.text()}`);
    return Buffer.from(await res.arrayBuffer());
  };
}

/* 방법 2: Edge 소리 내어 읽기 (키 없이) */
async function makeEdge() {
  let mod;
  try { mod = await import('msedge-tts'); } catch {
    console.error('msedge-tts가 없어요. 먼저 `npm install`을 실행하세요.');
    process.exit(1);
  }
  const { MsEdgeTTS, OUTPUT_FORMAT } = mod;
  let tts = null;
  const connect = async () => {
    tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  };
  return async (text) => {
    if (!tts) await connect();
    try {
      const { audioStream } = tts.toStream(xml(text), { rate });
      const chunks = [];
      await new Promise((resolve, reject) => {
        audioStream.on('data', (c) => chunks.push(c));
        audioStream.on('close', resolve);
        audioStream.on('error', reject);
      });
      if (!chunks.length) throw new Error('빈 소리');
      return Buffer.concat(chunks);
    } catch (e) { tts = null; throw e; }
  };
}

const useAzure = !!process.env.AZURE_SPEECH_KEY;
const synth = useAzure ? await makeAzure() : await makeEdge();
console.log(`${useAzure ? 'Azure Speech' : 'Edge 소리 내어 읽기'} · ${voice} · 빠르기 ${rate} · 말 ${phrases.length}개\n`);

/* 목소리를 바꾸면 모두 새로 만들어요 */
const stampFile = path.join(outDir, '.voice');
const oldVoice = fs.existsSync(stampFile) ? fs.readFileSync(stampFile, 'utf8').trim() : '';
const force = flag('force') || (oldVoice && oldVoice !== `${voice} ${rate}`);

let made = 0, skipped = 0;
const failed = [];
for (const [n, p] of phrases.entries()) {
  const file = path.join(outDir, VOICE.key(p) + '.mp3');
  if (!force && fs.existsSync(file) && fs.statSync(file).size > 0) { skipped++; continue; }
  let ok = false;
  for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
    try { fs.writeFileSync(file, await synth(p)); ok = true; } catch (e) {
      if (attempt === 3) { failed.push(p); console.error(`  ✗ ${p} — ${e.message}`); } else await sleep(1000 * attempt);
    }
  }
  if (ok) { made++; process.stdout.write(`\r  ${n + 1}/${phrases.length} ${p.slice(0, 30).padEnd(30, ' ')}`); }
}
fs.writeFileSync(stampFile, `${voice} ${rate}\n`);

/* 실제로 있는 파일만 목록에 넣어요 (없는 말은 기기 목소리로) */
const keys = phrases.map(VOICE.key).filter((k) => fs.existsSync(path.join(outDir, k + '.mp3')));
fs.writeFileSync(path.join(root, 'js/clips.js'),
  `/* 녹음 음성 목록. \`npm run audio\`가 새로 만들어요. 비어 있으면 기기 목소리를 써요. */\n` +
  `window.AUDIO_CLIPS = ${JSON.stringify({ voice, rate, keys })};\n`);

console.log(`\n\n새로 만듦 ${made} · 그대로 ${skipped} · 실패 ${failed.length}`);
console.log(`js/clips.js에 ${keys.length}개를 적었어요. 브라우저를 새로고침하면 새 목소리로 들려요.`);
if (failed.length) process.exitCode = 1;
