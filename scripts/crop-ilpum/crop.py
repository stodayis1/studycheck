"""일품 한 대단원에서 문제·정답·해설 그림을 잘라낸다.

지면은 2단이고 한 칸에 한 문제씩 세로로 놓인다.
  · 문제 : 번호 줄부터 **다음 멈춤 자리** 앞까지.
           멈춤 자리 = 다음 번호 · 개념 상자 · 고난도 배너 · [Level] · 창의유형 딱지 · 소단원 머리말
  · 정답 : 「1. 답 ③」 한 줄. 지수·분수가 글줄 위로 솟으므로 같은 가로줄을 통째로 잡는다.
  · 해설 : 그 줄부터 다음 「2. 답」 앞까지 (「[해설]」 이 들어 있다).

쓰는 법
  python scripts/crop-ilpum/crop.py "<대단원.pdf>" <items.json 이 있는 폴더>
  결과: <폴더>/q/0016.png · a/0016.png · s/0016.png · crop.json
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
TOP, BOTTOM = 66, 938   # 962 로 두면 쪽 아래 분홍 줄이 딸려 들어온다
BOT_ANS = 972           # 해설 쪽은 분홍 줄이 없어 글이 더 내려온다 (940~963 에 걸린 답이 있었다)
LEFT, RIGHT = 42, 690
MID = 364
PAD = 6


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
        return cache[i]

    def cut(i, x0, y0, x1, y1):
        im = page_img(i)
        return im.crop((px(x0), px(y0), min(im.width, px(x1)), min(im.height, px(y1))))

    stops = {}
    for m in marks:
        if m['kind'] == 'sub':          # 소단원 머리말은 쪽 맨 위라 멈춤 자리로 쓸 수 없다
            continue
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
                im = trim(cut(pi, x0, it['y'] - PAD, cx1, y1))
                im.save(os.path.join(folder, 'q', f"{it['no']:04d}.png"))
                done[it['no']] = True

    # ── 정답·해설 ─────────────────────────────────────────────────────
    want = {it['no'] for it in items}
    first_ans = max(bypage) + 1
    notes = []
    for pi in range(first_ans, len(d)):
        rows = []
        for blk in d[pi].get_text('dict')['blocks']:
            if blk['type'] != 0:
                continue
            for l in blk['lines']:
                t = ''.join(s['text'] for s in l['spans']).strip()
                if t:
                    rows.append((l['bbox'], t))
        for col, (cx0, cx1) in enumerate(((LEFT, MID - 6), (MID, RIGHT))):
            cr = sorted([r for r in rows if cx0 <= r[0][0] < cx1 and TOP <= r[0][1] <= BOT_ANS],
                        key=lambda r: r[0][1])
            starts = [k for k, (bb, t) in enumerate(cr)
                      if (lambda m: m and int(m.group(1)) in want)(re.match(r'^(\d{1,3})\.\s*답', t))]
            for j, k in enumerate(starts):
                bb, t = cr[k]
                n = int(re.match(r'^(\d{1,3})\.', t).group(1))
                prev_y = cr[starts[j - 1]][0][1] if j else -1e9
                row = [b for b, _ in cr if prev_y + 4 < b[1] < bb[3] - 1 and b[3] > bb[1] + 3]
                top = min([b[1] for b in row] + [bb[1]])
                bot = max([b[3] for b in row] + [bb[3]])
                notes.append([pi, col, cx0, cx1, top, bot, n])

    ans = {}
    for j, (pi, col, cx0, cx1, y0, ybot, n) in enumerate(notes):
        nxt = notes[j + 1] if j + 1 < len(notes) else None
        end = (nxt[4] - 4) if (nxt and nxt[0] == pi and nxt[1] == col) else BOT_ANS
        trim(cut(pi, cx0 - 4, y0 - 3, cx1, ybot + 3)).save(os.path.join(folder, 'a', f'{n:04d}.png'))
        trim(cut(pi, cx0 - 4, y0 - 3, cx1, end)).save(os.path.join(folder, 's', f'{n:04d}.png'))
        ans[n] = True

    json.dump(dict(problems=len(done), answers=len(ans),
                   miss_q=[it['no'] for it in items if it['no'] not in done],
                   miss_a=[it['no'] for it in items if it['no'] not in ans], bad=bad),
              io.open(os.path.join(folder, 'crop.json'), 'w', encoding='utf8'), ensure_ascii=False)


if __name__ == '__main__':
    main()
