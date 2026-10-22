"""「핵심정리 및 유형별 단계별 교재」에서 문제·정답·해설 그림을 잘라낸다.

items.json 에 든 문항(= 유형이 붙은 예제·유형별 구간)만 자른다.
  · 문제 : 번호 줄부터 다음 멈춤 자리(다음 번호·유형 배지·개념 머리말·섹션 제목) 앞까지
  · 정답 : 해설 쪽의 「7. 정답 5/2 cm」 첫 줄
  · 해설 : 그 줄부터 다음 번호 앞까지

빠른정답 쪽(번호가 25개 넘게 빽빽한 쪽)은 건너뛰고, 그 뒤 「정답과 풀이」부터 쓴다.

  python scripts/crop-hs/crop.py "<교재.pdf>" <items.json 이 있는 폴더>
"""
import io
import json
import os
import re
import sys

import pymupdf
from PIL import Image

DPI = 200
Z = DPI / 72
TOP, BOTTOM = 100, 945
TOP_SOL, BOT_SOL = 96, 965
LEFT, RIGHT = 36, 692
MID = 364
PAD = 8
SKIP = ('JYJ수학교실', 'Du kannst', '중1-2', '내신대비')


def px(v):
    return int(round(v * Z))


def trim(im):
    g = im.convert('L').point(lambda v: 0 if v < 245 else 255)
    bb = g.getbbox() if g.getextrema()[0] == 0 else None
    if not bb:
        return im
    a, b, c, d = bb
    return im.crop((max(0, a - 6), max(0, b - 6), min(im.width, c + 6), min(im.height, d + 6)))


def side(x):
    return 0 if x < MID else 1


def clean(l):
    t = ''.join(s['text'] for s in l['spans']).strip()
    if not t or '무단으로' in t or any(t.startswith(k) for k in SKIP):
        return None
    return t


def main():
    pdf, folder = sys.argv[1], sys.argv[2]
    items = json.load(io.open(os.path.join(folder, 'items.json'), encoding='utf8'))
    marks = json.load(io.open(os.path.join(folder, 'marks.json'), encoding='utf8'))
    d = pymupdf.open(pdf)
    for sub in ('q', 'a', 's'):
        os.makedirs(os.path.join(folder, sub), exist_ok=True)

    cache = {}

    def page_img(i):
        if i not in cache:
            pm = d[i].get_pixmap(dpi=DPI)
            cache[i] = Image.frombytes('RGB', (pm.width, pm.height), pm.samples)
        if len(cache) > 8:
            cache.pop(next(iter(cache)))
        return cache[i]

    def cut(i, x0, y0, x1, y1):
        im = page_img(i)
        return im.crop((px(x0), px(y0), min(im.width, px(x1)), min(im.height, px(y1))))

    stops = {}
    for m in marks:
        stops.setdefault((m['page'], side(m['x'])), []).append(m['y'])
    for v in stops.values():
        v.sort()

    bypage = {}
    for it in items:
        bypage.setdefault(it['page'], []).append(it)

    done, bad = {}, []
    for pi, its in sorted(bypage.items()):
        for sd, (cx0, cx1) in enumerate(((LEFT, MID - 6), (MID, RIGHT))):
            col = sorted([it for it in its if side(it['x']) == sd], key=lambda it: it['y'])
            st = stops.get((pi, sd), [])
            for it in col:
                below = [y for y in st if y > it['y'] + 8]
                y1 = (min(below) - PAD) if below else BOTTOM
                x0 = max(cx0, it['x'] - 10)
                inside = [m for m in marks if m['kind'] == 'no' and m['page'] == pi
                          and x0 - 2 <= m['x'] <= cx1 and it['y'] - PAD - 2 <= m['y'] <= y1]
                if len(inside) != 1:
                    bad.append([it['no'], '네모 안 번호', len(inside)])
                trim(cut(pi, x0, it['y'] - PAD, cx1, y1)).save(
                    os.path.join(folder, 'q', f"{it['no']:04d}.png"))
                done[it['no']] = True

    # ── 해설 ──────────────────────────────────────────────────────
    # 번호가 25개 넘게 빽빽한 쪽 = 빠른정답. 그 뒤부터가 「정답과 풀이」다.
    stop = json.load(io.open(os.path.join(folder, 'answers.json'), encoding='utf8'))['stop']
    dense = []
    for pi in range(stop, len(d)):
        n = 0
        for b in d[pi].get_text('dict')['blocks']:
            if b['type'] != 0:
                continue
            for l in b['lines']:
                t = clean(l)
                if t and re.fullmatch(r'\d{1,4}\.', t) and abs(l['spans'][0]['size'] - 11.5) < 0.6:
                    n += 1
        if n >= 25:
            dense.append(pi)
    first_sol = (dense[-1] + 1) if dense else stop

    want = {it['no'] for it in items}
    notes = []
    for pi in range(first_sol, len(d)):
        rows = []
        for blk in d[pi].get_text('dict')['blocks']:
            if blk['type'] != 0:
                continue
            for l in blk['lines']:
                t = clean(l)
                if t:
                    rows.append((l['bbox'], t, l['spans'][0]))
        for col, (cx0, cx1) in enumerate(((LEFT, MID - 6), (MID, RIGHT))):
            cr = sorted([r for r in rows if cx0 <= r[0][0] < cx1 and TOP_SOL <= r[0][1] <= BOT_SOL],
                        key=lambda r: r[0][1])
            starts = [k for k, (bb, t, s0) in enumerate(cr)
                      if re.fullmatch(r'\d{1,4}\.', t) and abs(s0['size'] - 11.5) < 0.6
                      and int(t[:-1]) in want]
            for j, k in enumerate(starts):
                bb, t, _ = cr[k]
                n = int(t[:-1])
                bot = max([b[3] for b, _, _ in cr if bb[1] - 2 < b[1] < bb[3] - 1] + [bb[3]])
                notes.append([pi, col, cx0, cx1, bb[1], bot, n])

    ans = {}
    for j, (pi, col, cx0, cx1, y0, ybot, n) in enumerate(notes):
        nxt = notes[j + 1] if j + 1 < len(notes) else None
        end = (nxt[4] - 6) if (nxt and nxt[0] == pi and nxt[1] == col) else BOT_SOL
        trim(cut(pi, cx0, y0 - 4, cx1, ybot + 4)).save(os.path.join(folder, 'a', f'{n:04d}.png'))
        trim(cut(pi, cx0, y0 - 4, cx1, end)).save(os.path.join(folder, 's', f'{n:04d}.png'))
        ans[n] = True

    json.dump(dict(problems=len(done), answers=len(ans), first_sol=first_sol,
                   miss_q=[it['no'] for it in items if it['no'] not in done],
                   miss_a=[it['no'] for it in items if it['no'] not in ans], bad=bad),
              io.open(os.path.join(folder, 'crop.json'), 'w', encoding='utf8'), ensure_ascii=False)


if __name__ == '__main__':
    main()
