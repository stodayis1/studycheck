"""개념원리 RPM 한 단원에서 문제·정답·해설 그림을 잘라낸다.

지면 생김새 (한글로 다시 짜인 판이라 아주 규칙적이다)
  · 문제 쪽 : 2단. 교과서 구간만 한 단이 다시 둘로 쪼개져 4칸이 된다.
              칸의 왼쪽 끝은 그 쪽에 찍힌 문제 번호들의 x 값이 알려 준다.
  · 교과서 구간의 짧은 문제들은 「[0001~0006] 다음 수가 …」 같은 묶음 지시문에
    매달려 있다. 지시문을 함께 붙여 주지 않으면 문제가 말이 안 된다 → 위에 얹는다.
  · 정답 쪽 : 2단. 「49) 답. …」 로 시작하고 그 아래가 해설이다.
              첫 줄 묶음 = 답, 다음 번호 앞까지 전부 = 해설.

쓰는 법
  python scripts/crop-rpm/crop.py "<단원.pdf>" <items.json 이 있는 폴더>
  결과: <폴더>/q/0049.png (문제) · a/0049.png (답) · s/0049.png (해설) · crop.json
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
TOP, BOTTOM = 92, 930      # 머리말·꼬리말을 뺀 본문의 세로 범위 (PDF 단위)
BOT_ANS = 950              # 정답 쪽은 본문이 조금 더 내려온다 (36)·99) 가 여기 걸렸다)
LEFT, RIGHT = 50, 680
PAD = 5                    # 자를 때 둘레에 두는 여유


def px(v):
    return int(round(v * Z))


def bands(xs):
    """번호 x 값들을 칸으로 모은다 (20pt 안쪽이면 같은 칸)."""
    out = []
    for x in sorted(xs):
        if out and x - out[-1] < 20:
            continue
        out.append(x)
    return out


def trim(im):
    """흰 여백을 걷어낸다."""
    g = im.convert('L').point(lambda v: 0 if v < 245 else 255)
    bb = g.getbbox() if g.getextrema()[0] == 0 else None
    if not bb:
        return im
    a, b, c, d = bb
    return im.crop((max(0, a - 6), max(0, b - 6), min(im.width, c + 6), min(im.height, d + 6)))


def main():
    pdf, folder = sys.argv[1], sys.argv[2]
    items = json.load(io.open(os.path.join(folder, 'items.json'), encoding='utf8'))
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

    # ── 문제 ──────────────────────────────────────────────────────────
    # 한 문제는 「그 아래 첫 멈춤 자리」까지다.
    # 멈춤 자리 = 다음 문제 줄 · 다음 묶음 지시문 · 다음 유형/배지/구간 머리말.
    marks = json.load(io.open(os.path.join(folder, 'marks.json'), encoding='utf8'))
    MID = 364

    def side(x):
        return 0 if x < MID else 1

    stops, heads = {}, {}
    for m in marks:
        k = (m['page'], side(m['x']))
        stops.setdefault(k, []).append(m['y'])
        if m['kind'] == 'instr':
            heads.setdefault(k, []).append(m)
    for v in stops.values():
        v.sort()

    bypage = {}
    for it in items:
        bypage.setdefault(it['page'], []).append(it)

    done, bad = {}, []
    for pi, its in sorted(bypage.items()):
        for sd, (cx0, cx1) in enumerate(((LEFT, MID - 4), (MID, RIGHT))):
            col = sorted([it for it in its if side(it['x']) == sd], key=lambda it: (it['y'], it['x']))
            if not col:
                continue
            st = stops.get((pi, sd), [])
            for k, it in enumerate(col):
                # 같은 줄에 나란히 선 형제가 있으면 그 앞까지만, 없으면 단 전체를 쓴다
                # 분수가 들어간 문제는 번호 줄이 조금 내려앉아 y 가 20pt 가까이 어긋난다.
                # (줄 간격은 60pt 넘으므로 이 정도로 넉넉히 봐도 아랫줄을 끌어오지 않는다)
                sib = [o for o in col if abs(o['y'] - it['y']) < 22 and o['x'] > it['x'] + 20]
                x1 = min(o['x'] for o in sib) - 6 if sib else cx1
                x0 = max(cx0, it['x'] - 8)
                # 아래쪽 끝 = 나보다 아래에 있는 첫 멈춤 자리
                below = [y for y in st if y > it['y'] + 8]
                y1 = (min(below) - PAD) if below else BOTTOM
                # 자가 점검: 잘라낸 네모 안에 **내 번호 하나만** 있어야 한다.
                # (지시문 자리도 마찬가지로 번호가 하나도 없어야 한다)
                inside = [m for m in marks
                          if m['kind'] == 'no' and m['page'] == pi
                          and x0 - 2 <= m['x'] <= x1 and it['y'] - PAD - 2 <= m['y'] <= y1]
                if len(inside) != 1:
                    bad.append([it['no'], '네모 안 번호', len(inside)])
                im = trim(cut(pi, x0, it['y'] - PAD, x1, y1))
                # 묶음 지시문은 문제 위에 얹어 준다 (두 줄 이상이어도 통째로)
                ins = it.get('instr')
                if ins:
                    # 지시문은 문제와 다른 단, 심지어 앞 쪽에 있기도 하다
                    # (357~360 은 오른쪽 단인데 지시문은 왼쪽 단 맨 아래에 있다).
                    # 그래서 문제 자리가 아니라 **지시문 제 자리**를 보고 잘라야 한다.
                    ib, ipg = ins[1], (ins[2] if len(ins) > 2 else pi)
                    isd = side(ib[0])
                    icx0, icx1 = (LEFT, MID - 4) if isd == 0 else (MID, RIGHT)
                    ist = stops.get((ipg, isd), [])
                    after = [y for y in ist if y > ib[1] + 8]
                    ihead = cut(ipg, icx0, ib[1] - 3, icx1,
                                (min(after) - 3) if after else ib[3] + 3)
                    iy1 = (min(after) - 3) if after else ib[3] + 3
                    if any(m['kind'] == 'no' and m['page'] == ipg
                           and icx0 <= m['x'] <= icx1 and ib[1] - 3 <= m['y'] <= iy1
                           for m in marks):
                        bad.append([it['no'], '지시문 자리에 번호가 섞임', 0])
                    ihead = trim(ihead)
                    w = max(ihead.width, im.width)
                    c = Image.new('RGB', (w, ihead.height + 10 + im.height), 'white')
                    c.paste(ihead, (0, 0))
                    c.paste(im, (0, ihead.height + 10))
                    im = c
                im.save(os.path.join(folder, 'q', f"{it['no']:04d}.png"))
                done[it['no']] = True

    # ── 정답·해설 ─────────────────────────────────────────────────────
    first_ans = max(bypage) + 1
    want = {it['no'] for it in items}
    notes = []     # (쪽, 칸, y0, 첫줄아래, 번호)
    for pi in range(first_ans, len(d)):
        rows = []
        for blk in d[pi].get_text('dict')['blocks']:
            if blk['type'] != 0:
                continue
            for l in blk['lines']:
                t = ''.join(s['text'] for s in l['spans']).strip()
                if t:
                    rows.append((l['bbox'], t))
        if not rows:
            continue
        mid = 364
        for col, (cx0, cx1) in enumerate(((LEFT, mid - 4), (mid, RIGHT))):
            cr = sorted([r for r in rows if cx0 <= r[0][0] < cx1 and TOP <= r[0][1] <= BOT_ANS],
                        key=lambda r: r[0][1])
            # 「1057) ①, ④」 처럼 책에 「답.」 이 빠진 줄이 있다.
            # 그래서 「답」 이라는 글자가 아니라 **문제 번호와 맞는지**로 가린다.
            starts = [k for k, (bb, t) in enumerate(cr)
                      if (lambda m: m and int(m.group(1)) in want)(re.match(r'^(\d{1,4})\)', t))]
            for j, k in enumerate(starts):
                bb, t = cr[k]
                n = int(re.match(r'^(\d{1,4})\)', t).group(1))
                # 이 풀이에 딸린 줄들 (다음 「N) 답.」 바로 앞까지)
                nk = starts[j + 1] if j + 1 < len(starts) else len(cr)
                mine = cr[k:nk]
                # 답 = 첫 줄과 같은 가로줄에 있는 것들.
                # 지수·분자는 글줄 위로 솟아 올라가 y 가 더 작다. 그래서 「답」 줄보다
                # 앞 순서로 정렬돼 있어, 뒤쪽만 보면 지수가 통째로 잘려 나간다.
                # 그래서 앞뒤를 다 훑되, 「답」 줄 속으로 실제로 파고든 것만 끌어온다.
                # (기준을 느슨하게 하면 앞 풀이의 마지막 줄이 딸려 온다)
                prev_y = cr[starts[j - 1]][0][1] if j else -1e9
                row = [b for b, _ in cr
                       if prev_y + 4 < b[1] < bb[3] - 1 and b[3] > bb[1] + 3]
                top = min([b[1] for b in row] + [bb[1]])
                bot = max([b[3] for b in row] + [bb[3]])
                # 한 문제가 「560) 답. ○」「561) 답. ×」 처럼 답을 여러 칸 갖기도 한다.
                # 문제 번호가 아닌 곁번호 줄은 그 문제의 답에 함께 넣는다.
                for b2, t2 in mine[1:]:
                    if re.match(r'^\d{1,4}\)', t2):
                        bot = max(bot, b2[3])
                notes.append([pi, col, cx0, cx1, top, bot, n])

    ans = {}
    for j, (pi, col, cx0, cx1, y0, ybot, n) in enumerate(notes):
        nxt = notes[j + 1] if j + 1 < len(notes) else None
        if nxt and nxt[0] == pi and nxt[1] == col:
            end = nxt[4] - 3
        else:
            end = BOT_ANS
        a = trim(cut(pi, cx0 - 4, y0 - 3, cx1, ybot + 3))
        s = trim(cut(pi, cx0 - 4, y0 - 3, cx1, end))
        a.save(os.path.join(folder, 'a', f'{n:04d}.png'))
        s.save(os.path.join(folder, 's', f'{n:04d}.png'))
        ans[n] = [pi, col]

    miss_q = [it['no'] for it in items if it['no'] not in done]
    miss_a = [it['no'] for it in items if it['no'] not in ans]
    json.dump(dict(problems=len(done), answers=len(ans), miss_q=miss_q, miss_a=miss_a,
                   bad=bad),
              io.open(os.path.join(folder, 'crop.json'), 'w', encoding='utf8'), ensure_ascii=False)


if __name__ == '__main__':
    main()
