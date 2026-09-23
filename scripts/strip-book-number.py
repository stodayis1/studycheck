"""이미 올라간 문항 그림에서 **교재 원본 번호**를 지운다 (수학의지혜 문제은행).

왜 하나
  학습지는 1, 2, 3… 으로 번호를 다시 매겨 인쇄한다. 그런데 그림 왼쪽 위에 교재의 원래 번호가
  같이 들어가 있어 학생이 헷갈린다. 대신 「교재 · 쪽 · 번호」는 앱의 출처 표시로 본다.

어느 교재가 대상인가 (표본을 눈으로 확인한 결과)
  · 쎈            : 맨 윗줄에 주황 4자리 번호가 혼자 있다      → 그 줄을 통째로 잘라낸다
  · 쎈B           : 맨 윗줄에 번호 + 대표문제 배지 + '쎈 1227' → 그 줄을 통째로 잘라낸다
  · 베이직쎈       : 번호가 발문과 같은 줄에 있다               → 번호만 흰색으로 덮는다
  · 교과서-NE능률  : '53.' 이 발문과 같은 줄에 있다             → 번호만 흰색으로 덮는다
  나머지 교재(RPM·유형만렙·풍산자·개념+유형·라이트쎈)는 이미 번호가 안 들어가 있다.

쓰는 법 (PowerShell)
  python scripts/strip-book-number.py --check                  # 대상 개수만 센다
  python scripts/strip-book-number.py --book 베이직쎈 --dry     # 20장만 골라 before/after 를 파일로
  python scripts/strip-book-number.py --book 베이직쎈           # 실제로 고쳐 올린다

  --book <교재명>  한 교재만 (없으면 위 네 교재 전부)
  --grade/--sem    학년·학기 한정
  --limit <n>      n개만
  --dry            올리지 않고 scripts/_strip_preview 에 저장
"""
import argparse
import io
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
BUCKET = 'problem-images'
PREVIEW = os.path.join(HERE, '_strip_preview')

# 맨 윗줄을 통째로 잘라내는 교재 / 번호만 덮는 교재
CUT_BOOKS = {'쎈', '쎈B'}
MASK_BOOKS = {'베이직쎈', '교과서-NE능률'}


def load_env():
    for f in ('.env.local', '.env'):
        p = os.path.join(ROOT, f)
        if not os.path.exists(p): continue
        for line in io.open(p, encoding='utf8'):
            if '=' in line and not line.startswith('#'):
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip())


load_env()
URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
if not URL or not KEY:
    sys.exit('✗ .env.local 에 NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')
H = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY}


def api(path, params=None, method='GET', data=None, headers=None, raw=False):
    url = URL + path + ('?' + urllib.parse.urlencode(params) if params else '')
    req = urllib.request.Request(url, data=data, method=method)
    for k, v in {**H, **(headers or {})}.items(): req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=120) as r:
        b = r.read()
    return b if raw else json.loads(b or b'null')


def rows_for(book=None, grade=None, sem=None, limit=None):
    out = []; off = 0
    while True:
        p = {'select': 'id,book,grade,semester,local_no,image_path', 'order': 'id',
             'limit': 1000, 'offset': off}
        if book: p['book'] = 'eq.' + book
        if grade: p['grade'] = 'eq.' + grade
        if sem: p['semester'] = 'eq.' + str(sem)
        d = api('/rest/v1/problems', p)
        out += d
        if len(d) < 1000: break
        off += 1000
        if limit and len(out) >= limit: break
    out = [r for r in out if r.get('image_path')]
    return out[:limit] if limit else out


# ── 번호 찾기 ───────────────────────────────────────────────────
def leading_token(m, y0, y1, gap_in=12):
    """행 구간 [y0,y1) 에서 맨 왼쪽 글자 덩어리의 (x0, x1) 과 뒤쪽 빈칸 크기를 돌려준다.
    번호 안의 글자 사이 틈(gap_in)보다 뒤쪽 빈칸이 확실히 넓어야 번호로 인정한다."""
    band = m[y0:y1]
    col = band.any(0)
    xs = np.where(col)[0]
    if not len(xs): return None
    x0 = int(xs[0])
    if x0 > 60: return None                 # 번호는 맨 왼쪽에 붙어 있다
    x = x0; gap = 0; x1 = x0
    while x < len(col):
        if col[x]: x1 = x; gap = 0
        else:
            gap += 1
            if gap > gap_in: break          # 번호 안의 글자 사이 틈
        x += 1
    # 뒤쪽 빈칸
    after = 0; x = x1 + 1
    while x < len(col) and not col[x]: after += 1; x += 1
    return x0, x1, after


def row_bands(m, min_gap=4):
    rows = m.any(1)
    bands = []; s = None; gap = 0
    for i, v in enumerate(rows):
        if v:
            if s is None: s = i
            gap = 0
        elif s is not None:
            gap += 1
            if gap >= min_gap: bands.append((s, i - gap + 1)); s = None
    if s is not None: bands.append((s, len(rows)))
    return bands


def strip(buf, book):
    im = Image.open(io.BytesIO(buf))
    a = np.asarray(im.convert('L')).astype(int)
    m = a < 175
    bands = row_bands(m)
    if not bands: return None, '글자 없음'
    y0, y1 = bands[0]
    if y1 - y0 < 12 or y1 - y0 > 60: return None, '첫 줄 높이가 번호답지 않음'
    tok = leading_token(m, y0, y1)
    if not tok: return None, '왼쪽 덩어리 없음'
    x0, x1, after = tok
    w = x1 - x0 + 1
    if not (14 <= w <= 150): return None, f'번호 폭 {w}'
    if after < 16: return None, '번호 뒤에 빈칸이 좁음'

    rgb = im.convert('RGB')
    if book in CUT_BOOKS:
        # 맨 윗줄(번호 띠)을 통째로 잘라낸다
        top = bands[1][0] - 3 if len(bands) > 1 else y1
        if top >= rgb.height - 20: return None, '자르면 남는 게 없음'
        out = rgb.crop((0, max(0, top), rgb.width, rgb.height))
    else:
        # 번호만 흰색으로 덮는다
        out = rgb.copy()
        from PIL import ImageDraw
        ImageDraw.Draw(out).rectangle([max(0, x0 - 4), max(0, y0 - 4),
                                       min(rgb.width, x1 + 6), min(rgb.height, y1 + 4)],
                                      fill=(255, 255, 255))
    b = io.BytesIO(); out.save(b, format='PNG')
    return b.getvalue(), None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--book'); ap.add_argument('--grade'); ap.add_argument('--sem')
    ap.add_argument('--limit', type=int); ap.add_argument('--dry', action='store_true')
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()

    books = [args.book] if args.book else sorted(CUT_BOOKS | MASK_BOOKS)
    for book in books:
        rows = rows_for(book, args.grade, args.sem, args.limit)
        print(f'{book}: 대상 {len(rows)}문항')
        if args.check: continue
        if args.dry: os.makedirs(PREVIEW, exist_ok=True)
        done = changed = skipped = failed = 0
        why = {}
        for r in rows:
            try:
                buf = api(f'/storage/v1/object/{BUCKET}/' + urllib.parse.quote(r['image_path']), raw=True)
                out, msg = strip(buf, book)
                if out is None:
                    skipped += 1; why[msg] = why.get(msg, 0) + 1
                else:
                    if args.dry:
                        tag = f"{book}_{r['grade']}-{r['semester']}_{r['local_no']}".replace('/', '_')
                        io.open(os.path.join(PREVIEW, tag + '_before.png'), 'wb').write(buf)
                        io.open(os.path.join(PREVIEW, tag + '_after.png'), 'wb').write(out)
                    else:
                        api(f'/storage/v1/object/{BUCKET}/' + urllib.parse.quote(r['image_path']),
                            method='PUT', data=out,
                            headers={'Content-Type': 'image/png', 'x-upsert': 'true'}, raw=True)
                    changed += 1
            except Exception as e:
                failed += 1
                if failed < 4: print('  ✗', r['image_path'], e)
            done += 1
            if done % 100 == 0:
                print(f'\r  {done}/{len(rows)} (고침 {changed} · 건너뜀 {skipped} · 실패 {failed})',
                      end='', flush=True)
        print(f'\n  끝 — 고침 {changed} · 건너뜀 {skipped} · 실패 {failed}')
        if why: print('  건너뛴 까닭', why)


if __name__ == '__main__':
    main()
