"""스피드 체크에서 **정답을 그림으로** 잘라 문항 옆에 둔다.

왜 그림인가
  글자로 복원해 봤더니 분수·근호가 조각나 60%밖에 못 썼다(`q 1 3 w` = 1/3 꼴).
  학생 화면은 어차피 「정답 확인하기」로 보여 주고 본인이 O/X 하는 방식이라 그림이면 충분하다.
  원장님도 개념+유형은 해설까지는 필요 없고 정답만 보이면 된다고 하셨다.

어떻게 짝짓나
  유형 번호로 맞추면 어긋난다 — 본문과 해설의 유형 끊는 자리가 조금씩 다르다.
  대신 **읽기 순서로 묶음끼리 1:1** 로 맞춘다. 묶음은 번호가 1로 돌아가는 곳에서 끊는다.
  묶음 수와 각 묶음의 문항 수가 **모두 같을 때만** 붙인다. 하나라도 어긋나면 그 과정은 건너뛴다.

파일 이름
  문항 그림 옆에 `{번호}).png` 로 둔다 — upload-problems.mjs 가 정답 그림으로 읽는 이름이다.

쓰는 법
  python scripts/crop-ky-mid/ansimg.py 중3 1 --out "C:/Users/USER/문제은행/_ky중등"
"""
import argparse
import os
import sys

import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from scan import B, PDFS, spans, read, group   # noqa: E402
import ans as A                                 # noqa: E402

ZOOM = 2.6
BOOK_CODE = 'ky_mid'


def runs(items):
    """번호가 1로 돌아가는 곳에서 끊는다."""
    out, cur, prev = [], [], 10 ** 9
    for e in items:
        if cur and e['no'] <= prev:
            out.append(cur)
            cur = []
        prev = e['no']
        cur.append(e)
    if cur:
        out.append(cur)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('grade')
    ap.add_argument('semester', type=int)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()

    body_p, ans_p = PDFS[(a.grade, a.semester)]
    bd = pymupdf.open(os.path.join(B, body_p))
    gs, _ = group(read(bd))
    bruns = [g for g in gs]

    doc = pymupdf.open(os.path.join(B, ans_p))
    pages = A.speed_pages(doc)
    ev = A.read_answers(doc, pages)
    keep, aetc, on = [], [], True
    for e in ev:
        if e['k'] == 'x':
            on = False
        elif e['k'] == 't':
            on = True
        elif e['k'] == 'q':
            (keep if on else aetc).append(e)
    aruns = runs(keep)

    print('%s-%d · 본문 묶음 %d · 해설 묶음 %d' % (a.grade, a.semester, len(bruns), len(aruns)))

    # ★ 책 자체가 다른 자리가 있다(중2-2 소4 유형5 — 본문 4문항인데 해설은 3개).
    #   전부-아니면-전무로 막으면 한 곳 때문에 책 한 권이 통째로 막힌다.
    #   두 줄(묶음별 문항 수)을 맞춰 보고 **같은 구간만** 붙인다. 어긋난 유형은 비워 둔다.
    import difflib
    bl = [len(g['items']) for g in bruns]
    al = [len(r) for r in aruns]
    sm = difflib.SequenceMatcher(None, bl, al, autojunk=False)
    pairs = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == 'equal':
            pairs += [(bruns[i1 + k], aruns[j1 + k]) for k in range(i2 - i1)]
    skipped = len(bruns) - len(pairs)
    print('  짝이 맞는 유형 %d · 건너뛴 유형 %d' % (len(pairs), skipped), flush=True)
    if not pairs:
        print('  ✗ 맞는 것이 없습니다')
        return

    course = '%s-%d' % (a.grade, a.semester)
    made = 0
    seq = {}
    for g, ar in pairs:
        for k, (bi, ai) in enumerate(zip(g['items'], ar), 1):
            page = doc[ai['pg'] - 1]
            W = page.rect.width
            lo = 0 if ai['col'] == 0 else W / 2
            hi = W / 2 if ai['col'] == 0 else W
            # 같은 쪽·같은 단의 **바로 다음 정답** 위까지.
            # ★ 묶음 안에서만 찾으면 묶음의 마지막 정답이 쪽 끝까지 늘어나
            #   다음 유형의 정답을 통째로 삼킨다(눈으로 확인했을 때 실제로 그랬다).
            #   그래서 묶음과 상관없이 전체에서 다음 것을 찾는다.
            later = [z for z in keep
                     if z['pg'] == ai['pg'] and z['col'] == ai['col'] and z['y'] > ai['y'] + 2]
            nxt = min(later, key=lambda z: z['y']) if later else None
            bot = (nxt['y'] - 2) if nxt else min(ai['y'] + 150, page.rect.height - 30)
            top = ai['y'] - 3
            x0 = max(lo + 2, ai['x1'] + 2)
            if bot - top < 8 or hi - x0 < 30:
                continue
            d = os.path.join(a.out, course, BOOK_CODE, '%02d' % g['sub'])
            os.makedirs(d, exist_ok=True)
            local = '%02d%02d%02d' % (g['sub'], g['idx'], k)
            page.get_pixmap(matrix=pymupdf.Matrix(ZOOM, ZOOM),
                            clip=pymupdf.Rect(x0, top, hi - 4, bot)) \
                .save(os.path.join(d, '%s).png' % local))
            made += 1
    # 기출·마무리 — 묶는 단위가 본문과 달라(본문 69 : 해설 31) 묶음끼리는 못 맞춘다.
    # 전체 개수가 같을 때만 **읽기 순서로 1:1** 로 맞춘다.
    _, etc = group(read(bd))
    if len(etc) == len(aetc):
        for bi, ai in zip(etc, aetc):
            page = doc[ai['pg'] - 1]
            W = page.rect.width
            lo = 0 if ai['col'] == 0 else W / 2
            hi = W / 2 if ai['col'] == 0 else W
            # ★ 기출·마무리 답은 **한 줄에 여러 개가 나란히** 놓인다(유형 답은 세로로 쌓인다).
            #   세로로만 끊으면 옆 답이 통째로 딸려 온다. 가로도 같이 본다.
            same_page = [z for z in aetc + keep if z['pg'] == ai['pg'] and z['col'] == ai['col']]
            # 같은 줄에서 오른쪽에 있는 다음 답 → 거기가 오른쪽 끝
            right = [z for z in same_page
                     if abs(z['y'] - ai['y']) < 6 and z['x1'] > ai['x1'] + 4]
            x1 = (min(right, key=lambda z: z['x1'])['x1'] - 10) if right else (hi - 4)
            # 아래 줄 중, 가로 범위가 겹치는 것 → 거기가 아래 끝
            below = [z for z in same_page
                     if z['y'] > ai['y'] + 6 and z['x1'] < x1 + 12]
            nxt = min(below, key=lambda z: z['y']) if below else None
            bot = (nxt['y'] - 2) if nxt else min(ai['y'] + 60, page.rect.height - 30)
            # 위로도 같은 식으로 끊는다. 번호 줄을 넉넉히 잡으면 **윗 답이 딸려온다**.
            above = [z for z in same_page
                     if z['y'] < ai['y'] - 6 and z['x1'] < x1 + 12]
            prv = max(above, key=lambda z: z['y']) if above else None
            top = max(ai['y'] - 9, (prv['y1'] + 2) if prv else 0)
            x0 = max(lo + 2, ai['x1'] + 2)
            if bot - ai['y'] < 8 or x1 - x0 < 24:
                continue
            sub = bi['sub'] if 'sub' in bi else None
            if sub is None:
                before = [g for g in bruns if g['items']
                          and (g['items'][0]['pg'], g['items'][0]['y']) <= (bi['pg'], bi['y'])]
                sub = before[-1]['sub'] if before else 1
            bi['sub'] = sub
            seq[sub] = seq.get(sub, 0) + 1
            d = os.path.join(a.out, course, BOOK_CODE, '%02d' % sub)
            os.makedirs(d, exist_ok=True)
            page.get_pixmap(matrix=pymupdf.Matrix(ZOOM, ZOOM),
                            # 번호 줄이 통째로 들어가게 위를 넉넉히 둔다.
                            # 좁게 자르면 같은 줄에 걸친 답(④ 같은 것)이 잘려 나간다.
                            clip=pymupdf.Rect(x0, top, x1, max(bot, ai['y1'] + 4))) \
                .save(os.path.join(d, '%02dE%03d).png' % (sub, seq[sub])))
            made += 1
    else:
        print('  ! 기출·마무리는 개수가 달라 건너뜁니다 (본문 %d : 해설 %d)' % (len(etc), len(aetc)))

    print('  ✓ 정답 그림 %d개' % made)


if __name__ == '__main__':
    main()
