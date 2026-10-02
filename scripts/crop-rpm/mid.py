"""중등 RPM(개념원리) 교재 → 문항 이미지 + problems_data.json

공통수학1용(scan/crop/ans/diff/rtypes.py)과 달리 중등판은 한 번에 처리된다.
중등 RPM이 다른 점:
  · 학생용 PDF에 **유형 번호·이름이 그대로 찍혀 있다** (공통수학1은 교사용에만 있어 PDF가 둘 필요했다)
  · 문항번호 색이 구간을 뜻한다 — 원장님 확인 완료:
        초록 #0BB14B 교과서 문제(레벨2) / 파랑 #005EA1 유형 익히기(레벨3)
        분홍 #D24067 시험에 꼭 나오는 문제(레벨3) / 보라 #7E5195 발전(레벨4)
  · 해설 PDF에 「답 ④」처럼 정답이 **글자로** 있다 → 자동 채점이 되게 answer_text까지 넣는다
    (공통수학1은 정답을 그림으로만 올려서 학생이 직접 O/X 해야 했다)

쓰는 법 (PowerShell)
  python scripts/crop-rpm/mid.py --grade 중1 --sem 1 ^
      --q "<문제 PDF>" --sol "<해설 PDF>" --out "<이미지 만들 폴더>"

  만들어지는 것
    <out>/중1-1/RPM/01/0001.png     문제 그림
    <out>/중1-1/RPM/01/0001).png    정답 그림
    scripts/problems_rpm_m11.json   업로드용 자료

  그 다음
    node scripts/upload-problems.mjs "<out>"
"""
import argparse
import difflib
import io
import json
import os
import re
import urllib.parse
import urllib.request

import pymupdf
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

# 번호 색 → (구간 이름, 레벨). 원장님 확인 완료 (2026-10-02)
SECTION = {
    0x0BB14B: ('교과서 문제', 2),
    0x005EA1: ('유형 익히기', 3),
    0xD24067: ('시험에 꼭 나오는 문제', 3),
    0x7E5195: ('발전', 4),
}

# 이름만으로는 엉뚱한 데로 가는 유형 — 원장님이 직접 정해 주신 것
OVERRIDE = {
    '부호가 생략된 수의 덧셈과 뺄셈': '중1-1-04-04',
}


def load_env():
    for f in ('.env.local', '.env'):
        p = os.path.join(ROOT, f)
        if not os.path.exists(p):
            continue
        for line in io.open(p, encoding='utf8'):
            if '=' in line and not line.startswith('#'):
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip())


def api(path, params):
    url = os.environ['NEXT_PUBLIC_SUPABASE_URL'] + path + '?' + urllib.parse.urlencode(params)
    key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    req = urllib.request.Request(url, headers={'apikey': key, 'Authorization': 'Bearer ' + key})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def spans_of(page):
    return [z for b in page.get_text('dict')['blocks'] if b['type'] == 0
            for l in b.get('lines', []) for z in l['spans'] if z['text'].strip()]


def column_split(page):
    """좌·우 단을 가르는 x좌표.

    세로 구분선이 있으면 그것을 쓰고, 없으면 **글자가 전혀 없는 가운데 빈 띠**의 한가운데를 쓴다.
    예전에는 구분선이 없으면 무조건 쪽 한가운데로 잡았는데, 그러면 단 경계가 실제보다 왼쪽이라
    문장 끝이 잘려 나갔다 (중2-1 「…모두 고른 것은?」이 「…모두 고른」으로 잘림).
    """
    xs = [round(d['rect'].x0) for d in page.get_drawings()
          if d['rect'].width < 2 and d['rect'].height > 300]
    if xs:
        return xs[0]
    W = int(page.rect.width)
    used = bytearray(W + 2)
    for z in spans_of(page):
        a, b = int(max(0, z['bbox'][0])), int(min(W, z['bbox'][2]))
        for i in range(a, b + 1):
            used[i] = 1
    best, run, start = (0, W // 2), 0, 0
    for i in range(int(W * 0.33), int(W * 0.67)):
        if not used[i]:
            if run == 0:
                start = i
            run += 1
            if run > best[0]:
                best = (run, start + run // 2)
        else:
            run = 0
    return best[1]


def number_groups(sp, minsize=12.5):
    """문항번호는 큰 글자가 옆으로 붙어 네 자리를 이룬다 (00 + 49 처럼 쪼개져 있다).
    문제 PDF는 14pt, 해설 PDF는 12pt라 기준을 따로 받는다."""
    big = sorted([z for z in sp if z['size'] >= minsize],
                 key=lambda z: (round(z['bbox'][1]), z['bbox'][0]))
    cl = []
    for z in big:
        # 가로로 '붙어 있는' 것만 한 번호로 본다.
        # 간격이 음수여도 좋다고 두면 같은 높이에 있는 **반대쪽 단** 번호까지 끌어와
        # 0054 + 0050 → 00540050 이 되어 둘 다 사라진다 (26개가 이렇게 빠졌다)
        gap = (z['bbox'][0] - cl[-1][-1]['bbox'][2]) if cl else 999
        if cl and abs(z['bbox'][1] - cl[-1][-1]['bbox'][1]) < 3 and -3 <= gap <= 6:
            cl[-1].append(z)
        else:
            cl.append([z])
    out = []
    for c in cl:
        # PDF 안에 눈에 안 보이는 제어문자가 섞여 있다 ('95 ' 처럼).
        # strip()으로는 안 지워져서 중1-2에서 163문항이 숫자로 인식되지 않았다 → 숫자만 남긴다.
        t = re.sub(r'[^0-9]', '', ''.join(z['text'] for z in c))
        if re.fullmatch(r'\d{4}', t):
            out.append((t, c))
    return out


def read_problems(doc):
    """문항: 번호 · 쪽 · 단 · 세로위치 · 구간(색)"""
    items = []
    for pi, p in enumerate(doc):
        sp = spans_of(p)
        div = column_split(p)
        for t, c in number_groups(sp):
            sec, lv = SECTION.get(c[-1]['color'], (None, None))
            items.append(dict(no=t, pg=pi, col=int(c[0]['bbox'][0] > div),
                              y=c[0]['bbox'][1], x=c[0]['bbox'][0], step=sec, lv=lv,
                              div=div, w=p.rect.width, h=p.rect.height))
    items.sort(key=lambda r: (r['pg'], r['col'], r['y']))
    return items


def read_types(doc):
    """유형 머리글: 흰 글자 '유형' 배지 오른쪽의 번호와 이름(두 줄까지)"""
    out = []
    for pi, p in enumerate(doc):
        sp = spans_of(p)
        div = column_split(p)
        for z in sp:
            if z['text'].strip() != '유형' or z['color'] != 0xFFFFFF:
                continue
            y = (z['bbox'][1] + z['bbox'][3]) / 2
            x0 = z['bbox'][0]

            def near(lo, hi, smin, smax, yy):
                return sorted([q for q in sp
                               if abs((q['bbox'][1] + q['bbox'][3]) / 2 - yy) < 5
                               and x0 + lo < q['bbox'][0] < x0 + hi
                               and smin <= q['size'] <= smax],
                              key=lambda q: q['bbox'][0])

            no = ''.join(q['text'].strip() for q in near(15, 50, 11.0, 13.0, y))
            ti = ''.join(q['text'].strip() for q in near(45, 250, 9.8, 11.4, y))
            ti += ''.join(q['text'].strip() for q in near(10, 250, 9.8, 11.4, y + 13))
            if no.isdigit() and ti:
                out.append(dict(pg=pi, col=int(x0 > div), y=z['bbox'][1], no=no, title=ti))
    out.sort(key=lambda r: (r['pg'], r['col'], r['y']))
    return out


def read_directions(doc):
    """「교과서 문제」 구간은 [0001~0006] 다음 수가 소수이면 … 처럼
    **지시문 아래에 번호만 나열**된다. 번호만 자르면 무엇을 하라는 건지 사라지므로,
    각 문항 그림 위에 그 지시문을 함께 붙이려고 자리(쪽·네모)를 모아 둔다."""
    out = {}
    for pi, p in enumerate(doc):
        div = column_split(p)
        sp_page = spans_of(p)
        for b in p.get_text('dict')['blocks']:
            if b['type'] != 0:
                continue
            for li, l in enumerate(b.get('lines', [])):
                txt = ''.join(z['text'] for z in l['spans'])
                m = re.search(r'\[(\d{4})\s*[~∼-]\s*(\d{4})\]', txt)
                if not m:
                    continue
                x0, y0, x1, y1 = l['bbox']
                # 지시문은 두세 줄로 이어진다. 줄 간격으로 따지면 블록이 갈려 있을 때 놓치므로
                # **그 아래 첫 문항번호 바로 위까지**를 통째로 지시문으로 본다.
                same_col = [c[0]['bbox'][1] for t, c in number_groups(sp_page)
                            if (c[0]['bbox'][0] < div) == (x0 < div) and c[0]['bbox'][1] > y1]
                if same_col:
                    y1 = min(min(same_col) - 4, y1 + 46)
                lo = 45 if x0 < div else div + 6
                hi = (div - 4) if x0 < div else p.rect.width - 12
                for n in range(int(m.group(1)), int(m.group(2)) + 1):
                    out['%04d' % n] = dict(pg=pi, rect=(lo, y0 - 3, hi, y1 + 2))
    return out


def norm(s):
    return re.sub(r'[\s()（）·.,;：:]', '', s or '')


def map_types(types, std):
    """책 유형 → 학원 표준유형. 이름으로 고르고, 책 흐름(소단원 순서)에서 벗어난 것만 바로잡는다."""
    def sim(a, b):
        a, b = norm(a), norm(b)
        r = difflib.SequenceMatcher(None, a, b).ratio()
        if a and b and (a in b or b in a):
            r = max(r, 0.82)
        return r

    res = []
    for t in types:
        if t['title'] in OVERRIDE:
            j = next(i for i, s in enumerate(std) if s['code'] == OVERRIDE[t['title']])
            res.append(dict(t, j=j, score=1.0))
            continue
        best = max(range(len(std)), key=lambda j: sim(t['title'], std[j]['type_title']))
        res.append(dict(t, j=best, score=sim(t['title'], std[best]['type_title'])))

    strong = [(i, std[r['j']]['sub_chapter_no']) for i, r in enumerate(res) if r['score'] >= 0.8]
    for i, r in enumerate(res):
        if r['score'] >= 0.8:
            continue
        before = [s for k, s in strong if k < i]
        after = [s for k, s in strong if k > i]
        lo = before[-1] if before else (after[0] if after else None)
        hi = after[0] if after else lo
        if lo is None or lo <= std[r['j']]['sub_chapter_no'] <= hi:
            continue
        cand = [j for j, s in enumerate(std) if lo <= s['sub_chapter_no'] <= hi]
        if cand:
            r['j'] = max(cand, key=lambda j: sim(r['title'], std[j]['type_title']))
    return res


def read_answers(sol):
    """해설에서 「답 …」을 읽는다. 자동 채점이 되도록 글자 정답을 뽑고, 그림으로 쓸 자리도 같이 둔다."""
    ans = {}
    for pi, p in enumerate(sol):
        sp = spans_of(p)
        div = column_split(p)
        nums = number_groups(sp, minsize=11.5)
        marks = [z for z in sp if z['text'].strip() == '답']
        for z in marks:
            y = (z['bbox'][1] + z['bbox'][3]) / 2
            # 이 '답' 바로 앞(위쪽)에 있는 같은 단의 문항번호
            cands = [(t, c) for t, c in nums
                     if int(c[0]['bbox'][0] > div) == int(z['bbox'][0] > div)
                     and c[0]['bbox'][1] <= y + 2]
            if not cands:
                continue
            t, c = max(cands, key=lambda tc: tc[1][0]['bbox'][1])
            row = sorted([q for q in sp
                          if abs((q['bbox'][1] + q['bbox'][3]) / 2 - y) < 5
                          and q['bbox'][0] > z['bbox'][2]],
                         key=lambda q: q['bbox'][0])
            # 다음 문항번호(큰 글자)가 시작되면 거기서 멈춘다 — 안 그러면 '④0081'처럼 붙어 버린다
            stop = min([q['bbox'][0] for q in row if q['size'] >= 11.5] or [9999])
            txt, lastx = '', z['bbox'][2]
            for q in row:
                if q['bbox'][0] >= stop or q['bbox'][0] - lastx > 30:
                    break
                txt += q['text'].strip()
                lastx = q['bbox'][2]
            if t not in ans:
                ans[t] = dict(text=txt.strip(), pg=pi,
                              rect=(z['bbox'][0] - 4, z['bbox'][1] - 5,
                                    max(lastx + 6, z['bbox'][2] + 40), z['bbox'][3] + 5))
    return ans


CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩'


def answer_kind(txt):
    """객관식(①~⑤, 복수정답 포함) · 숫자 주관식은 자동 채점, 그 밖(식·분수)은 정답 그림으로 자기채점.
    해설에서 정답 뒤에 풀이 글자가 딸려올 때가 있어 **앞머리의 동그라미 번호만** 떼어 쓴다."""
    t = (txt or '').strip()
    m = re.match(r'^[①-⑩](\s*[,·]\s*[①-⑩])*', t)
    if m:
        got = [str(CIRCLED.index(ch) + 1) for ch in m.group() if ch in CIRCLED]
        return 'choice', ','.join(got)
    if re.fullmatch(r'-?\d+(\.\d+)?', t):
        return 'number', t
    return 'image', None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--grade', required=True)
    ap.add_argument('--sem', required=True)
    ap.add_argument('--q', required=True)
    ap.add_argument('--sol', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--json', required=True)
    ap.add_argument('--offset', type=int, default=1, help='교재 인쇄 쪽 = PDF 쪽 + offset')
    ap.add_argument('--dry', action='store_true', help='그림은 만들지 않고 집계만')
    a = ap.parse_args()
    load_env()

    std = api('/rest/v1/standard_types', {
        'select': 'code,sub_chapter_no,sub_chapter_title,type_no,type_title,sort_order',
        'grade': 'eq.' + a.grade, 'semester': 'eq.' + a.sem, 'order': 'sort_order', 'limit': 2000})

    doc = pymupdf.open(a.q)
    sol = pymupdf.open(a.sol)
    items = read_problems(doc)
    types = map_types(read_types(doc), std)
    answers = read_answers(sol)
    directions = read_directions(doc)
    print('문항 %d · 유형 %d · 정답 %d · 지시문 딸린 문항 %d'
          % (len(items), len(types), len(answers), len(directions)))

    # 문항은 바로 앞(위)에 나온 유형에 속한다. 첫 유형보다 앞선 교과서 문제는 그 소단원 첫 유형으로 본다.
    def pos(r): return (r['pg'], r['col'], r['y'])
    ti = 0
    cur = types[0] if types else None
    rows = []
    for r in items:
        while ti + 1 < len(types) and pos(types[ti + 1]) <= pos(r):
            ti += 1
            cur = types[ti]
        if cur is None:
            continue
        s = std[cur['j']]
        txt = answers.get(r['no'], {}).get('text')
        kind, atext = answer_kind(txt)
        rows.append(dict(b='RPM', g=a.grade, s=int(a.sem),
                         n=s['sub_chapter_no'], t=s['sub_chapter_title'],
                         l=r['no'], c=s['code'], d=None, p=r['step'],
                         e=False, v=False, i=False, x='png',
                         dir='%s-%s/RPM/%02d' % (a.grade, a.sem, s['sub_chapter_no']),
                         lv=r['lv'], pg=r['pg'] + a.offset,
                         k=kind, a=atext))

    byk = {}
    for r in rows:
        byk[r['k']] = byk.get(r['k'], 0) + 1
    print('채점 방식:', byk)
    print('소단원 수:', len({r['n'] for r in rows}))
    print('정답 글자 없는 문항:', sum(1 for r in rows if r['k'] == 'image'))

    json.dump(rows, open(a.json, 'w', encoding='utf-8'), ensure_ascii=False)
    print('→', a.json)
    if a.dry:
        return

    # ── 그림 자르기 ─────────────────────────────────────────────
    # 자를 영역 정하기.
    # 한 단 안에 번호가 **나란히 둘씩** 놓인 쪽이 있다(개념 확인 문제 등).
    # 그 경우 '다음 번호 위까지'로 자르면 높이가 음수가 되어 57문항이 통째로 빠졌다.
    # → 같은 높이끼리 묶고, 세로는 '다음 줄까지', 가로는 '옆 번호 앞까지'로 자른다.
    pos_by_no = {r['no']: r for r in items}
    items.sort(key=lambda r: (r['pg'], r['col'], round(r['y']), r['x'] if 'x' in r else 0))
    groups = []
    for r in items:
        key = (r['pg'], r['col'], round(r['y'] / 6))
        if groups and groups[-1][0] == key:
            groups[-1][1].append(r)
        else:
            groups.append((key, [r]))
    for gi, (key, g) in enumerate(groups):
        nxt = groups[gi + 1][1][0] if gi + 1 < len(groups) else None
        same_col = nxt and nxt['pg'] == g[0]['pg'] and nxt['col'] == g[0]['col']
        ybottom = (nxt['y'] - 6) if same_col else g[0]['h'] - 40
        # 가로 범위는 넉넉하게. 좁게 잡아 문장 끝이 잘리면 문제를 못 읽는다.
        lo = 45 if g[0]['col'] == 0 else g[0]['div'] + 6
        hi = (g[0]['div'] - 4) if g[0]['col'] == 0 else g[0]['w'] - 12
        g.sort(key=lambda r: r.get('x', lo))
        for k, r in enumerate(g):
            r['y1'] = ybottom
            r['x0'] = lo if k == 0 else max(lo, g[k]['x'] - 10)
            r['x1'] = hi if k == len(g) - 1 else max(lo + 20, g[k + 1]['x'] - 8)

    def shoot(page, rect, path):
        """크기가 0 이하인 영역은 PDF 라이브러리가 그대로 터진다 — 미리 걸러낸다."""
        r = pymupdf.Rect(rect)
        r.normalize()
        if r.width < 5 or r.height < 5:
            return False
        page.get_pixmap(matrix=pymupdf.Matrix(2.9, 2.9), clip=r).save(path)
        return True

    def stack(page, rect, path):
        """지시문을 문항 그림 **위에** 이어 붙인다 (한 장만 봐도 뭘 하라는지 알게)."""
        r = pymupdf.Rect(rect)
        r.normalize()
        if r.width < 5 or r.height < 5:
            return
        pm = page.get_pixmap(matrix=pymupdf.Matrix(2.9, 2.9), clip=r)
        top = Image.open(io.BytesIO(pm.tobytes('png')))
        body = Image.open(path)
        w = max(top.width, body.width)
        out = Image.new('RGB', (w, top.height + body.height), 'white')
        out.paste(top, (0, 0))
        out.paste(body, (0, top.height))
        out.save(path)

    made = skipped = noans = 0
    for row in rows:
        p = pos_by_no[row['l']]
        d = os.path.join(a.out, *row['dir'].split('/'))
        os.makedirs(d, exist_ok=True)
        qpath = os.path.join(d, '%s.png' % row['l'])
        if not shoot(doc[p['pg']], (p['x0'], p['y'] - 4, p['x1'], p['y1']), qpath):
            skipped += 1
            continue
        dinfo = directions.get(row['l'])
        if dinfo:
            stack(doc[dinfo['pg']], dinfo['rect'], qpath)
        info = answers.get(row['l'])
        if not info or not shoot(sol[info['pg']], info['rect'],
                                 os.path.join(d, '%s).png' % row['l'])):
            noans += 1
        made += 1
        if made % 200 == 0:
            print('  그림 %d/%d' % (made, len(rows)), flush=True)
    print('✓ 그림 %d문항 (영역 이상해 건너뜀 %d · 정답그림 없음 %d)' % (made, skipped, noans))


if __name__ == '__main__':
    main()
