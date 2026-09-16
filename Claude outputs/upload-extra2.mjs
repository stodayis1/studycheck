/**
 * 베이직쎈 누락분 이미지 업로드 (898문항 · 이미지 1,796장)
 *
 * 쓰는 법 (PowerShell) — 지난번과 똑같습니다
 *   node scripts\upload-extra2.mjs "C:\Users\USER\문제은행"
 *
 * 같은 폴더에 problems_extra2.json 이 있어야 합니다.
 * 문항 정보는 이미 DB에 들어가 있어서, 이 스크립트는 이미지만 올립니다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}
loadEnv();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ROOT = process.argv[2];
const BUCKET = 'problem-images';

if (!URL || !KEY) { console.error('✗ .env.local 에 NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.'); process.exit(1); }
if (!ROOT || !fs.existsSync(ROOT)) { console.error('✗ 폴더 경로를 인자로 주세요.  예: node scripts\\upload-extra2.mjs "C:\\Users\\USER\\문제은행"'); process.exit(1); }

const db = createClient(URL, KEY, { auth: { persistSession: false } });
const DATA_FILE = path.join(HERE, 'problems_extra2.json');
if (!fs.existsSync(DATA_FILE)) { console.error(`✗ ${DATA_FILE} 이 없습니다. 스크립트와 같은 폴더에 problems_extra2.json 을 두세요.`); process.exit(1); }
const DATA = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

const GRADE_CODE = { '중1': 'm1', '중2': 'm2', '중3': 'm3' };
const key = (r, kind) =>
  &;

const INDEX = new Map();
const IMG = /^[bd]\d+\)?\.(png|jpg)$/i;

function scan(dir, depth = 0) {
  if (depth > 6) return;
  let items;
  try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const it of items) {
    const full = path.join(dir, it.name);
    if (it.isDirectory()) scan(full, depth + 1);
    else if (IMG.test(it.name)) {
      const parts = full.split(path.sep);
      for (const n of [4, 3]) {
        if (parts.length >= n) {
          const k = parts.slice(-n).join('/');
          if (!INDEX.has(k)) INDEX.set(k, full);
        }
      }
    }
  }
}

function srcPath(r, kind) {
  const file = `${r.l}${kind === 'a' ? ')' : ''}.${r.x}`;
  const dirs = r.dir.split('/');
  return INDEX.get(`${dirs.join('/')}/${file}`)
      || INDEX.get(`${dirs.slice(1).join('/')}/${file}`)
      || null;
}

async function uploadImages() {
  let ok = 0, skip = 0, fail = 0, i = 0;
  const jobs = [];
  for (const r of DATA) for (const kind of ['q', 'a']) jobs.push([r, kind]);

  const CONC = 8;
  async function worker() {
    while (i < jobs.length) {
      const [r, kind] = jobs[i++];
      const src = srcPath(r, kind);
      if (!src) { fail++; if (fail <= 3) console.error(`\n  ✗ 파일 못 찾음: ${r.dir}/${r.l}${kind === 'a' ? ')' : ''}.${r.x}`); continue; }
      const body = fs.readFileSync(src);
      const { error } = await db.storage.from(BUCKET).upload(key(r, kind), body, {
        contentType: r.x === 'jpg' ? 'image/jpeg' : 'image/png', upsert: false,
      });
      if (error) {
        if (/exists/i.test(error.message)) skip++;
        else { fail++; if (fail < 5) console.error('\n  ✗', key(r, kind), error.message); }
      } else ok++;
      if ((ok + skip + fail) % 50 === 0) process.stdout.write(`\r  이미지 ${ok + skip + fail}/${jobs.length}  (올림 ${ok} · 있음 ${skip} · 실패 ${fail})`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  console.log(`\n  ✓ 이미지 완료 — 올림 ${ok} · 이미 있음 ${skip} · 실패 ${fail}`);
}

console.log(`누락분 업로드 시작 — ${DATA.length}문항, 이미지 ${DATA.length * 2}장`);
process.stdout.write('  이미지 파일 찾는 중...');
scan(ROOT);
console.log(` ${INDEX.size / 2 | 0}장 발견\n`);
if (INDEX.size === 0) { console.error('✗ 폴더 안에서 이미지를 하나도 못 찾았습니다. 경로가 맞는지 확인해 주세요.'); process.exit(1); }
await uploadImages();
console.log('\n끝났습니다.');
