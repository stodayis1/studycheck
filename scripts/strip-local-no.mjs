/**
 * 이미 올라간 문항 이미지에서 **교재 원본 문항 번호**를 지운다 (수학의지혜)
 *
 * 왜 하나
 *   학습지는 1, 2, 3… 으로 번호를 다시 매겨 인쇄한다. 그런데 잘라 둔 그림 왼쪽 위에
 *   교재의 원래 번호(0946 같은 것)가 같이 들어가 있어서 학생이 헷갈린다.
 *
 * 하는 일
 *   1) problems 테이블에서 대상 문항을 읽고
 *   2) 저장소에서 문항 그림을 내려받아
 *   3) 왼쪽 위의 번호 덩어리를 찾아 흰색으로 덮고
 *   4) 원본을 백업 폴더에 남긴 뒤 같은 경로에 다시 올린다
 *
 * 쓰는 법 (PowerShell)
 *   node scripts\strip-local-no.mjs --check                 # 무엇을 고칠지만 세어 본다
 *   node scripts\strip-local-no.mjs --book 라이트쎈 --dry    # 표본 20장을 파일로 뽑아 눈으로 확인
 *   node scripts\strip-local-no.mjs --book 라이트쎈          # 실제로 고쳐 올린다
 *
 *   --book <교재명>   그 교재만 (없으면 전체)
 *   --grade <중2>     학년 한정, --sem <1|2> 학기 한정
 *   --limit <n>       n개만
 *   --dry             올리지 않고 scripts/_strip_preview/ 에 before/after 를 저장
 *
 * 되돌리기
 *   원본은 <백업폴더>/<저장소경로> 그대로 남는다. 되돌릴 때는 그 폴더를 다시 올리면 된다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUCKET = 'problem-images';
const BACKUP = path.join(HERE, '_strip_backup');
const PREVIEW = path.join(HERE, '_strip_preview');

function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    const p = path.join(HERE, '..', f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
}
loadEnv();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('✗ .env.local 에 NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.'); process.exit(1); }
const db = createClient(URL, KEY, { auth: { persistSession: false } });

const arg = (name, def = null) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? (process.argv[i + 1] ?? true) : def;
};
const DRY = process.argv.includes('--dry');
const CHECK = process.argv.includes('--check');

// ── 번호 덩어리 찾기 ────────────────────────────────────────────
// 번호는 늘 그림 **왼쪽 위**에 있고, 굵은 4자리다. 색이 있는 교재도 있고 검은 교재도 있다.
// 위쪽 띠에서 왼쪽부터 이어지는 진한 덩어리를 찾아, 그 폭이 번호답게 나오면 덮는다.
async function findNumberBox(buf) {
  const img = sharp(buf);
  const meta = await img.metadata();
  const W = meta.width, H = meta.height;
  if (!W || !H) return null;
  // 왼쪽 위 구역만 본다 (번호는 이 안에 있다)
  const bw = Math.min(W, 260), bh = Math.min(H, 90);
  const { data } = await sharp(buf).extract({ left: 0, top: 0, width: bw, height: bh })
    .greyscale().raw().toBuffer({ resolveWithObject: true });
  const dark = (x, y) => data[y * bw + x] < 165;

  // 열별 잉크량
  const col = new Array(bw).fill(0);
  const rowOf = new Array(bw).fill(-1);
  for (let x = 0; x < bw; x++) for (let y = 0; y < bh; y++) if (dark(x, y)) { col[x]++; if (rowOf[x] < 0) rowOf[x] = y; }

  // 왼쪽 여백을 건너뛰고 첫 덩어리의 시작
  let x0 = 0;
  while (x0 < bw && col[x0] === 0) x0++;
  if (x0 >= bw - 10) return null;
  if (x0 > 60) return null;                       // 번호는 맨 왼쪽에 붙어 있다

  // 덩어리 끝: 가로로 12픽셀 넘게 비면 끊긴 것으로 본다
  let x1 = x0, gap = 0;
  for (let x = x0; x < bw; x++) {
    if (col[x] === 0) { gap++; if (gap > 12) break; }
    else { gap = 0; x1 = x; }
  }
  const w = x1 - x0 + 1;
  if (w < 34 || w > 130) return null;             // 4자리 번호 폭이 아니다

  // 세로 범위
  let y0 = bh, y1 = 0;
  for (let x = x0; x <= x1; x++) for (let y = 0; y < bh; y++) if (dark(x, y)) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const h = y1 - y0 + 1;
  if (h < 14 || h > 46) return null;
  if (y0 > 34) return null;                       // 맨 위에 있어야 한다

  return { left: Math.max(0, x0 - 4), top: Math.max(0, y0 - 4), width: Math.min(W, w + 10), height: Math.min(H, h + 8) };
}

async function whiteOut(buf, box) {
  const white = await sharp({ create: { width: box.width, height: box.height, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer();
  return sharp(buf).composite([{ input: white, left: box.left, top: box.top }]).png().toBuffer();
}

// ── 대상 읽기 ───────────────────────────────────────────────────
async function fetchRows() {
  let out = [], from = 0;
  for (;;) {
    let q = db.from('problems').select('id,book,grade,semester,local_no,image_path').order('id').range(from, from + 999);
    if (arg('book')) q = q.eq('book', arg('book'));
    if (arg('grade')) q = q.eq('grade', arg('grade'));
    if (arg('sem')) q = q.eq('semester', Number(arg('sem')));
    const { data, error } = await q;
    if (error) throw error;
    out = out.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  const lim = arg('limit');
  return lim ? out.slice(0, Number(lim)) : out;
}

const rows = (await fetchRows()).filter(r => r.image_path);
console.log(`대상 ${rows.length}문항` + (arg('book') ? ` (교재: ${arg('book')})` : ''));
if (CHECK) {
  const byBook = new Map();
  for (const r of rows) byBook.set(r.book, (byBook.get(r.book) || 0) + 1);
  for (const [b, n] of [...byBook].sort((a, c) => c[1] - a[1])) console.log(`  ${b}\t${n}`);
  process.exit(0);
}

if (DRY) fs.mkdirSync(PREVIEW, { recursive: true });

let done = 0, changed = 0, notfound = 0, failed = 0;
const CONC = 8;
let cursor = 0;

async function worker() {
  for (;;) {
    const i = cursor++;
    if (i >= rows.length) return;
    const r = rows[i];
    try {
      const { data, error } = await db.storage.from(BUCKET).download(r.image_path);
      if (error) throw error;
      const buf = Buffer.from(await data.arrayBuffer());
      const box = await findNumberBox(buf);
      if (!box) { notfound++; done++; continue; }
      const out = await whiteOut(buf, box);
      if (DRY) {
        const tag = `${r.book}_${r.grade}-${r.semester}_${r.local_no}`.replace(/[\\/:*?"<>|]/g, '_');
        fs.writeFileSync(path.join(PREVIEW, tag + '_before.png'), buf);
        fs.writeFileSync(path.join(PREVIEW, tag + '_after.png'), out);
      } else {
        const bp = path.join(BACKUP, r.image_path);
        fs.mkdirSync(path.dirname(bp), { recursive: true });
        if (!fs.existsSync(bp)) fs.writeFileSync(bp, buf);
        const { error: upErr } = await db.storage.from(BUCKET).upload(r.image_path, out, { contentType: 'image/png', upsert: true });
        if (upErr) throw upErr;
      }
      changed++;
    } catch (e) {
      failed++;
      if (failed < 6) console.error('\n  ✗', r.image_path, e.message);
    }
    done++;
    if (done % 50 === 0) process.stdout.write(`\r  ${done}/${rows.length} (고침 ${changed} · 번호 못 찾음 ${notfound} · 실패 ${failed})`);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
console.log(`\n끝났습니다 — 고침 ${changed} · 번호 못 찾음 ${notfound} · 실패 ${failed}`);
if (DRY) console.log(`미리보기: ${PREVIEW}`);
else console.log(`원본 백업: ${BACKUP}`);
