"""해설 PDF 의 **스피드 체크**에서 정답을 뽑는다.

해설 본문은 2단에 수식이 빽빽해 글자로 복원하면 분수·근호가 조각난다(해 봤다).
대신 책 뒤쪽 **「스피드 체크 — 정답만 모아」** 를 쓴다. 유형별로
  유형 N  /  1 <답>  2 ⑴… ⑵…  3 …
꼴로 답만 모여 있어 훨씬 깨끗하다.

한 해설 파일에 **개념편 스피드 체크와 유형편 스피드 체크가 둘 다** 있다.
  개념편 쪽 : 「개념 익히기」·「쏙쏙」·「필수 문제」 가 보인다
  유형편 쪽 : 「유형」 이 보인다
그래서 「유형」이 있는 스피드 체크 쪽만 모아서 읽는다.

해설은 본문과 같은 글꼴을 쓰되 크기만 작다.
  유형 머리 : 「유형」(OTGongjungjeonhwa) + 번호(OTBlahblah 10~13pt)
  문항 번호 : MyriadPro-BoldCond 11~15pt
  정답      : 그 번호 오른쪽 ~ 다음 번호 위까지의 글자

해설 한 권에 개념편 답과 유형편 답이 같이 들어 있다. 유형편 구간만 쓴다.

★ 뽑은 뒤 반드시 **본문과 유형별 개수를 대조**한다. 하나라도 어긋나면 답이 통째로
  한 칸씩 밀려 들어가므로, 맞는 유형만 쓰고 안 맞는 유형은 비워 둔다.

쓰는 법
  python scripts/crop-ky-mid/ans.py 중3 1
  python scripts/crop-ky-mid/ans.py 중3 1 --json scripts/crop-ky-mid/ans_m31.json
"""
import argparse
import json
import os
import re
import sys

import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from scan import B, PDFS, spans, read, group   # noqa: E402
from typemap import unmath                     # noqa: E402

NUM_FONT = 'MyriadPro-BoldCond'
HEAD_WORD = 'OTGongjungjeonhwa'
HEAD_NO = 'OTBlahblah'


def speed_pages(doc):
    """유형편 스피드 체크 쪽만 고른다.

    「스피드」가 적힌 쪽 중 **「유형」이 보이는 쪽**이 유형편 몫이다.
    (개념편 몫은 「개념 익히기」·「필수 문제」가 보인다)
    그 쪽과 바로 다음 쪽까지가 한 벌이라, 사이 쪽도 같이 넣는다.
    """
    marks = [i for i in range(len(doc)) if '스피드' in doc[i].get_text()]
    # 개념편 몫에는 「필수 문제」·「개념 익히기」·「쏙쏙」이 보인다. 그게 **없는** 쪽이 유형편 몫.
    #   (유형편 스피드가 「유형 N」 대신 소단원 이름으로 적힌 판도 있다 — 중2-1.
    #    그래서 '유형이 있는 쪽'으로 찾으면 못 찾는다)
    CONCEPT = ('필수 문제', '개념 익히기', '쏙쏙', '유제')
    mine = [i for i in marks if not any(w in doc[i].get_text() for w in CONCEPT)]
    if not mine:
        return []
    return list(range(min(mine), max(mine) + 2))


def read_answers(doc, pages=None):
    """스피드 체크에서 (유형 머리 / 문항 번호 + 정답)을 읽기 순서대로."""
    ev = []
    for i in (pages if pages is not None else range(len(doc))):
        if i >= len(doc):
            continue
        W = doc[i].rect.width
        sp = spans(doc[i])
        for s in sp:
            t = s['text'].strip()
            col = 1 if s['bbox'][0] > W / 2 else 0
            if NUM_FONT in s['font'] and 10 < s['size'] < 16 and re.fullmatch(r'\d{1,3}', t):
                ev.append(dict(k='q', no=int(t), pg=i + 1, col=col,
                               y=s['bbox'][1], y1=s['bbox'][3], x1=s['bbox'][2]))
            elif t in ('기출문제', '마무리', '실전문제') and 'BMDoHyeon' in s['font']:
                # 해설에도 본문과 같은 구간 표시가 있다. 여기 답은 유형 답이 아니다 —
                # 안 끊으면 다음 유형 답이 앞 유형에 딸려 붙어 한 칸씩 밀린다.
                ev.append(dict(k='x', pg=i + 1, col=col, y=s['bbox'][1], word=t))
            elif t == '유형' and HEAD_WORD in s['font']:
                y = s['bbox'][1]
                lim = W / 2 if col == 0 else W
                row = [z for z in sp if abs(z['bbox'][1] - y) < 9
                       and z['bbox'][0] > s['bbox'][0] - 30 and z['bbox'][0] < lim]
                num = ''.join(z['text'].strip() for z in row if HEAD_NO in z['font'])
                if num.isdigit():
                    ev.append(dict(k='t', no=int(num), pg=i + 1, col=col, y=y))
    ev.sort(key=lambda e: (e['pg'], e['col'], e['y']))
    return ev


def answer_text(doc, e, nxt):
    """그 문항 번호 오른쪽부터 다음 번호 위까지의 글자를 모은다."""
    page = doc[e['pg'] - 1]
    W = page.rect.width
    lo = 0 if e['col'] == 0 else W / 2
    hi = W / 2 if e['col'] == 0 else W
    bot = (nxt['y'] - 2) if (nxt and nxt['pg'] == e['pg'] and nxt['col'] == e['col']) else page.rect.height
    got = []
    for s in spans(page):
        x, y = s['bbox'][0], s['bbox'][1]
        if not (lo - 2 <= x < hi):
            continue
        if y < e['y'] - 3 or y > bot:
            continue
        if y < e['y1'] + 2 and x < e['x1']:      # 번호 자신은 뺀다
            continue
        got.append((y, x, s['text']))
    # ★ 같은 줄인데 글자마다 y 가 1~2pt 씩 다르다(쉼표는 조금 위, 숫자는 조금 아래).
    #   y 를 그대로 쓰면 쉼표가 전부 앞으로 몰려 '., , 3636-6' 처럼 엉킨다.
    #   줄로 묶은 뒤 줄 안에서 x 순으로 읽는다.
    got.sort(key=lambda g: g[0])
    rows, cur = [], []
    for y, x, t in got:
        if cur and y - cur[0][0] > 4:
            rows.append(cur); cur = []
        cur.append((y, x, t))
    if cur:
        rows.append(cur)
    out = []
    for r in rows:
        out.append(''.join(t for _, _, t in sorted(r, key=lambda g: g[1])))
    return unmath(' '.join(out))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('grade')
    ap.add_argument('semester', type=int)
    ap.add_argument('--json')
    a = ap.parse_args()
    body_p, ans_p = PDFS[(a.grade, a.semester)]

    body = pymupdf.open(os.path.join(B, body_p))
    bgs, _ = group(read(body))
    want = {(g['sub'], g['typeNo']): len(g['items']) for g in bgs}

    doc = pymupdf.open(os.path.join(B, ans_p))
    pages = speed_pages(doc)
    if not pages:
        print('✗ 유형편 스피드 체크 쪽을 못 찾았습니다')
        return
    print('  스피드 체크(유형편) 쪽: %d~%d' % (pages[0] + 1, pages[-1] + 1))
    ev = read_answers(doc, pages)

    # 유형 번호가 줄어들면 새 소단원 — 본문과 같은 규칙
    out, sub, prev, cur = {}, 0, 10 ** 9, None
    qs = [e for e in ev if e['k'] == 'q']
    for idx, e in enumerate(ev):
        if e['k'] == 't':
            if e['no'] <= prev:
                sub += 1
            prev = e['no']
            cur = (sub, e['no'])
            out.setdefault(cur, [])
        elif e['k'] == 'x':
            cur = None       # 기출·마무리 구간 — 다음 유형 머리글까지 버린다
        elif cur is not None:
            j = qs.index(e)
            out[cur].append((e['no'], answer_text(doc, e, qs[j + 1] if j + 1 < len(qs) else None)))

    ok = bad = 0
    res = {}
    for k, n in sorted(want.items()):
        got = out.get(k, [])
        if len(got) == n and [g[0] for g in got] == list(range(1, n + 1)):
            ok += 1
            for no, txt in got:
                res['%02d%02d%02d' % (k[0], k[1], no)] = txt
        else:
            bad += 1
    print('%s-%d · 본문 유형 %d개 · 해설에서 읽은 유형 %d개' % (a.grade, a.semester, len(want), len(out)))
    print('  개수가 맞는 유형 %d · 안 맞는 유형 %d · 정답 %d개' % (ok, bad, len(res)))
    if bad:
        miss = [k for k, n in sorted(want.items()) if not (len(out.get(k, [])) == n)]
        print('  안 맞는 유형(앞 8개):', miss[:8])
    if a.json:
        json.dump(res, open(a.json, 'w', encoding='utf8'), ensure_ascii=False)
        print('  → %s' % a.json)
    for k in list(res)[:5]:
        print('   %s : %s' % (k, res[k][:60]))


if __name__ == '__main__':
    main()
