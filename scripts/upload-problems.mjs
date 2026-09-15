/**
 * 문제은행 업로드 스크립트 (수학의지혜)
 *
 * 하는 일
 *   1) problems_data.json 에 들어 있는 문항 정보(10,507개)를 Supabase `problems` 테이블에 넣고
 *   2) 문제 이미지와 정답 이미지를 `problem-images` 저장소에 올린다
 *
 * 쓰는 법 (PowerShell)
 *   node scripts\upload-problems.mjs "C:\Users\USER\Desktop\문제은행"
 *
 *   마지막 인자 = 중1-1, 중1-2 … 폴더들이 들어 있는 상위 폴더
 *
 * 필요한 것
 *   .env.local 에 아래 두 줄
 *     NEXT_PUBLIC_SUPABASE_URL=https://cggskjxsyrvuhsldgkoj.supabase.co
 *     SUPABASE_SERVICE_ROLE_KEY=...   (Supabase 대시보드 → Project Settings → API → service_role)
 *
 * 중간에 멈춰도 다시 실행하면 이어서 올라간다 (이미 올라간 것은 건너뜀)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ── .env.local 읽기 ─────────────────────────────────────────────
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
if (!ROOT || !fs.existsSync(ROOT)) { console.error('✗ 폴더 경로를 인자로 주세요.  예: node scripts\\upload-problems.mjs "C:\\Users\\USER\\Desktop\\문제은행"'); process.exit(1); }

const db = createClient(URL, KEY, { auth: { persistSession: false } });
const DATA_FILE = path.join(HERE, 'problems_data.json');
if (!fs.existsSync(DATA_FILE)) { console.error(`✗ ${DATA_FILE} 이 없습니다. 스크립트와 같은 폴더에 problems_data.json 을 두세요.`); process.exit(1); }
const DATA = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

const key = (r, kind) => `${r.g}-${r.s}/${r.b}/${String(r.n).padStart(2, '0')}/${r.l}${kind === 'a' ? '_a' : ''}.${r.x}`;
const srcPath = (r, kind) => path.join(ROOT, r.dir, `${r.l}${kind === 'a' ? ')' : ''}.${r.x}`);

// ── 1단계: 메타데이터 ────────────────────────────────────────────
async function insertMeta() {
  const CH = 500;
  let done = 0;
  for (let i = 0; i < DATA.length; i += CH) {
    const batch = DATA.slice(i, i + CH).map(r => ({
      book: r.b, grade: r.g, semester: r.s,
      sub_chapter_no: r.n, sub_chapter_title: r.t, local_no: r.l,
      type_code: r.c, difficulty: r.d, step: r.p,
      is_essay: !!r.e, is_creative: !!r.v, is_important: !!r.i,
      image_path: key(r, 'q'), answer_image_path: key(r, 'a'),
    }));
    const { error } = await db.from('problems')
      .upsert(batch, { onConflict: 'book,grade,semester,sub_chapter_no,local_no' });
    if (error) { console.error('✗ 메타데이터 오류:', error.message); process.exit(1); }
    done += batch.length;
    process.stdout.write(`\r  문항 정보 ${done}/${DATA.length}`);
  }
  console.log('\n  ✓ 문항 정보 완료');
}

// ── 2단계: 이미지 ────────────────────────────────────────────────
async function uploadImages() {
  let ok = 0, skip = 0, fail = 0, i = 0;
  const jobs = [];
  for (const r of DATA) for (const kind of ['q', 'a']) jobs.push([r, kind]);

  const CONC = 8;
  async function worker() {
    while (i < jobs.length) {
      const [r, kind] = jobs[i++];
      const src = srcPath(r, kind);
      if (!fs.existsSync(src)) { fail++; continue; }
      const body = fs.readFileSync(src);
      const { error } = await db.storage.from(BUCKET).upload(key(r, kind), body, {
        contentType: r.x === 'jpg' ? 'image/jpeg' : 'image/png', upsert: false,
      });
      if (error) {
        if (/exists/i.test(error.message)) skip++;
        else { fail++; if (fail < 5) console.error('\n  ✗', key(r, kind), error.message); }
      } else ok++;
      if ((ok + skip + fail) % 100 === 0) process.stdout.write(`\r  이미지 ${ok + skip + fail}/${jobs.length}  (올림 ${ok} · 있음 ${skip} · 실패 ${fail})`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  console.log(`\n  ✓ 이미지 완료 — 올림 ${ok} · 이미 있음 ${skip} · 실패 ${fail}`);
}

console.log(`문제은행 업로드 시작 — ${DATA.length}문항, 이미지 ${DATA.length * 2}장`);
console.log(`원본 폴더: ${ROOT}\n`);
await insertMeta();
await uploadImages();
console.log('\n끝났습니다.');
