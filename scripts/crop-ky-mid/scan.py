"""개념+유형(비상) **중등** 유형편 — 유형 머리글과 문항 번호를 읽는다.

공통수학1·2 와 판이 달라 글꼴이 다르다. 중등은 이렇다.

  문항 번호 : MyriadPro-BoldCond  19pt 이상
  유형 머리 : 「유형」(OTGongjungjeonhwa) + 번호(OTBlahblah 15pt) + 제목(그 줄의 나머지 한글)
  2단 구성  : 쪽 가운데를 기준으로 왼쪽 단 → 오른쪽 단 순서로 읽는다

번호는 **소단원마다 1부터 다시** 시작한다. 그래서 유형 번호가 줄어들면 새 소단원으로 본다.

쓰는 법
  python scripts/crop-ky-mid/scan.py 중3 1        # 읽기만 (확인용)
  python scripts/crop-ky-mid/scan.py 중3 1 --json out.json
"""
import argparse
import json
import os
import re

import pymupdf

B = r'C:\Users\USER\Desktop\빅픽쳐\문제은행\중등'

# 과정 → (유형편 본문, 해설)
PDFS = {
    ('중1', 1): (r'중1\１학기\개념서\개념유형\2022개정_개념플러스유형_중등수학1-1_유형편_학생용.pdf',
                r'중1\１학기\개념서\개념유형\개념플러스유형_중등수학(22개정)_1-1_개념편및라이트_정답해설.pdf'),
    ('중1', 2): (r'중1\２학기\개념서\2022개정_개념플러스유형_중등수학1-2_유형편_학생용.pdf',
                r'중1\２학기\개념서\22개념플러스유형_중등수학(22개정)_1-2_개념편및라이트_정답해설.pdf'),
    ('중2', 1): (r'중2\１학기\개념서\개념유형\2022개정_개념플러스유형_중등수학2-1_유형편_학생용.pdf',
                r'중2\１학기\개념서\개념유형\개념플러스유형_중등수학_라이트_2-1_정답과해설.pdf'),
    ('중2', 2): (r'중2\２학기\개념서\개념유형\2022개정_개념플러스유형_중등수학2-2_유형편_학생용.pdf',
                r'중2\２학기\개념서\개념유형\22개정_개념플러스유형_라이트_중학수학2-2_정답해설_2511.pdf'),
    ('중3', 1): (r'중3\１학기\개념서\개념유형\2022개정_개념플러스유형_중등수학3-1_유형편_학생용.pdf',
                r'중3\１학기\개념서\개념유형\개념유형 중학수학3-1(22개정)_라이트_정답과 해설.pdf'),
    ('중3', 2): (r'중3\２학기\개념서\개념유형라이트\개념플러스유형 유형편 3-2 학생용.pdf',
                r'중3\２학기\개념서\개념유형라이트\_book_202401_개념플러스유형_라이트3-2_정답과해설(개념편및유형편).pdf'),
}

NUM_FONT = 'MyriadPro-BoldCond'
NUM_MIN = 19
HEAD_WORD_FONT = 'OTGongjungjeonhwa'   # 「유형」 두 글자
HEAD_NO_FONT = 'OTBlahblah'            # 그 옆의 유형 번호
# 유형 머리글 없이 문항만 늘어서는 구간. 여기 문항을 앞 유형에 붙이면 유형이 틀어진다.
SECTION_WORDS = ('기출문제', '마무리', '실전문제', '단원 마무리')


def printed_page(page):
    """쪽 아래에 인쇄된 쪽번호. PDF 안의 순서가 아니라 **책의 순서**를 이것으로 본다."""
    H = page.rect.height
    cand = []
    for b in page.get_text('dict')['blocks']:
        if b['type']:
            continue
        for l in b.get('lines', []):
            for s in l['spans']:
                t = s['text'].strip()
                if s['bbox'][3] > H - 48 and re.fullmatch(r'\d{1,3}', t):
                    cand.append((s['bbox'][3], int(t)))
    cand.sort()
    return cand[-1][1] if cand else None


def check_order(doc):
    """PDF 에 들어 있는 쪽 순서가 책 순서와 같은지 본다.

    ★ 받은 PDF 가 뒤집혀 있던 적이 있다(중3-1 유형편, 2026-10-05).
      그대로 읽으면 유형 번호가 1 → 3 → 2 처럼 건너뛰어 **유형 분류가 통째로 어긋난다.**
      그래서 자르기 전에 반드시 여기서 확인하고, 어긋나면 멈춘다.
    """
    seq = [(i + 1, printed_page(doc[i])) for i in range(len(doc))]
    have = [(i, v) for i, v in seq if v is not None]
    back = [(have[k - 1], have[k]) for k in range(1, len(have)) if have[k][1] < have[k - 1][1]]
    return have, back


def spans(page):
    return [s for b in page.get_text('dict')['blocks'] if b['type'] == 0
            for l in b.get('lines', []) for s in l['spans'] if s['text'].strip()]


def read(doc):
    """읽기 순서(쪽 → 단 → 위에서 아래)로 유형 머리글과 문항 번호를 늘어놓는다."""
    ev = []
    for i in range(len(doc)):
        W = doc[i].rect.width
        sp = spans(doc[i])
        for s in sp:
            t = s['text'].strip()
            col = 1 if s['bbox'][0] > W / 2 else 0
            if NUM_FONT in s['font'] and s['size'] > NUM_MIN and re.fullmatch(r'\d{1,4}', t):
                ev.append(dict(k='q', no=int(t), pg=i + 1, col=col,
                               y=s['bbox'][1], y1=s['bbox'][3], x0=s['bbox'][0], x1=s['bbox'][2]))
            elif t in SECTION_WORDS and s['size'] > 10:
                ev.append(dict(k='x', pg=i + 1, col=col, y=s['bbox'][1], word=t))
            elif t == '유형' and HEAD_WORD_FONT in s['font']:
                y = s['bbox'][1]
                # 같은 줄에서 「유형」 오른쪽 — 같은 단 안에서만 (옆 단 제목이 붙지 않게)
                lim = W / 2 if col == 0 else W
                row = sorted([z for z in sp
                              if abs(z['bbox'][1] - y) < 10
                              and z['bbox'][0] > s['bbox'][0] - 2
                              and z['bbox'][0] < lim],
                             key=lambda z: z['bbox'][0])
                num = ''.join(z['text'].strip() for z in row if HEAD_NO_FONT in z['font'])
                ti = ''.join(z['text'].strip() for z in row
                             if HEAD_NO_FONT not in z['font'] and HEAD_WORD_FONT not in z['font'])
                if num.isdigit():
                    ev.append(dict(k='t', no=int(num), pg=i + 1, col=col, y=y,
                                   title=re.sub(r'\s+', ' ', ti).strip()))
    ev.sort(key=lambda e: (e['pg'], e['col'], e['y']))

    # 책 앞머리(머리말·구성 안내)에도 「유형」 글자가 있어 머리글로 잘못 잡힌다.
    # 문항 번호가 처음 나오는 쪽보다 앞은 본문이 아니다 — 통째로 버린다.
    first_q = min((e['pg'] for e in ev if e['k'] == 'q'), default=10 ** 9)
    ev = [e for e in ev if e['pg'] >= first_q]

    # ★ 소단원 첫머리에 「유형 목차」 쪽이 있다 — 머리글만 10여 개 늘어서고 문항은 없다.
    #   그대로 두면 유형이 두 벌로 잡히고, 문항이 엉뚱한 유형에 붙는다.
    #   '머리글이 3개 이상이고 문항 번호가 하나도 없는 쪽'을 목차로 보고 버린다.
    from collections import Counter
    heads = Counter(e['pg'] for e in ev if e['k'] == 't')
    quest = Counter(e['pg'] for e in ev if e['k'] == 'q')
    index_pages = {p for p, n in heads.items() if n >= 3 and quest.get(p, 0) == 0}
    return [e for e in ev if not (e['k'] == 't' and e['pg'] in index_pages)]


def group(ev):
    """유형 번호가 줄어들면 새 소단원. 문항은 바로 앞 유형에 붙는다."""
    out, sub, prev = [], 0, 10 ** 9
    cur = None
    etc = []            # 기출문제·마무리 — 유형이 없는 문항
    for e in ev:
        if e['k'] == 't':
            if e['no'] <= prev:
                sub += 1
            prev = e['no']
            cur = dict(sub=sub, typeNo=e['no'], title=e['title'], items=[])
            out.append(cur)
        elif e['k'] == 'x':
            cur = None   # 여기부터는 유형이 없다 — 다음 유형 머리글까지
        elif cur is not None:
            # ★ 유형 머리글을 놓친 자리가 있다(글꼴이 조금 다른 쪽이 있다).
            #   그러면 두 유형이 한 덩이로 묶여 문항 번호가 1,2,…,6,1,2,…,6 처럼 된다.
            #   번호가 **1 로 돌아가면** 거기서 새 유형으로 끊는다. 해설(스피드 체크)도
            #   같은 자리에서 끊겨 있어 서로 짝이 맞는다.
            if cur['items'] and e['no'] <= cur['items'][-1]['no']:
                cur = dict(sub=sub, typeNo=cur['typeNo'] + 1, title=cur['title'], items=[])
                out.append(cur)
            cur['items'].append(e)
        else:
            etc.append(e)
    # ★ 번호가 겹치면 그림이 덮어써진다.
    #   쪼갠 유형에 '다음 번호'를 주다 보니 진짜 다음 유형과 같은 번호가 되어
    #   628개를 자르고도 파일이 608개였다(2026-10-05).
    #   그래서 소단원 안에서 **나온 순서**(idx)를 따로 매겨 그걸 번호로 쓴다.
    seen = {}
    for g in out:
        seen[g['sub']] = seen.get(g['sub'], 0) + 1
        g['idx'] = seen[g['sub']]
    return out, etc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('grade')
    ap.add_argument('semester', type=int)
    ap.add_argument('--json')
    a = ap.parse_args()
    body, _ = PDFS[(a.grade, a.semester)]
    doc = pymupdf.open(os.path.join(B, body))
    have, back = check_order(doc)
    print('%s-%d 유형편 · PDF %d쪽 · 하단 쪽번호를 읽은 쪽 %d'
          % (a.grade, a.semester, len(doc), len(have)))
    if back:
        print('  ✗ 쪽 순서가 책과 다릅니다 (거꾸로인 곳 %d) — 자르면 안 됩니다' % len(back))
        for x in back[:5]:
            print('      PDF %d쪽(인쇄 %d) 다음이 PDF %d쪽(인쇄 %d)' % (x[0][0], x[0][1], x[1][0], x[1][1]))
        return
    ev = read(doc)
    gs, etc = group(ev)
    n = sum(len(g['items']) for g in gs)
    subs = max((g['sub'] for g in gs), default=0)
    print('  유형 %d개 · 소단원 %d개 · 유형 문항 %d개 · 기출·마무리 %d개'
          % (len(gs), subs, n, len(etc)))
    noti = [g for g in gs if not g['title']]
    print('  제목을 못 읽은 유형 %d개' % len(noti))
    big = [g for g in gs if len(g['items']) > 25]
    print('  문항이 25개 넘는 유형 %d개 %s  ← 머리글을 놓쳤을 수 있다'
          % (len(big), [(g['sub'], g['typeNo'], len(g['items'])) for g in big[:5]]))
    for g in gs[:4]:
        print('   소단원%d 유형%-3d %-26s %d문항' % (g['sub'], g['typeNo'], g['title'][:26], len(g['items'])))
    if a.json:
        json.dump({'types': gs, 'etc': etc}, open(a.json, 'w', encoding='utf8'), ensure_ascii=False)
        print('  → %s' % a.json)


if __name__ == '__main__':
    main()
