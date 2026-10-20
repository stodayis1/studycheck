"""개념+유형 개념편 PDF에서 **개념 쪽**을 강의 토막별 그림으로 자른다.

  python scripts/lesson-video/concept_cuts.py --pdf "<개념편 PDF>" --out "<폴더>" [--only 1]

개념 하나 = 영상 한 편. 개념은 쪽 위에 RixRakSans 22pt 제목이 있는 쪽에서 시작해, 첫 필수예제
(YDVYheadL 24pt 번호) 쪽 앞에서 끝난다. 한 개념 안의 토막은 쪽 안의 표시로 가른다.
  · 개념 ①②…   NanumSquareRound 9.8pt 소제목 (왼쪽에 DIN-Bold 번호)
  · 개념 Plus   'Plus' (BalooBhaina) → 그 아래 YDVYGO14 8.8pt 파란 소제목마다 한 토막
  · 개념 Check  'Check' (BalooBhaina) → 쪽 끝까지 한 토막
결과: <out>/NN/cut_KK.png + <out>/cuts.json  (대본 쓰는 재료)
"""
import argparse, json, os
import pymupdf

X0, X1 = 108, 562          # 왼쪽 쪽번호 띠와 오른쪽 여백을 뺀 본문 칸
FOOT = 728                 # 쪽 아래 쪽번호 줄 위
DPI = 220


def spans(p):
    return [s for b in p.get_text('dict')['blocks'] if b['type'] == 0
            for l in b['lines'] for s in l['spans'] if s['text'].strip()]


def title_of(sp):
    return ''.join(s['text'] for s in sp if s['size'] > 21 and s['bbox'][1] < 120
                   and s['font'].startswith(('RixRak', 'NPBIE'))).strip()


def is_example(sp):
    return any(s['font'].startswith('YDVYheadL') and s['size'] > 20 for s in sp)


def concepts(doc):
    out, cur = [], None
    for i, p in enumerate(doc):
        sp = spans(p)
        t = title_of(sp)
        if t:
            cur = dict(title=t, pages=[i]); out.append(cur)
        elif cur and not is_example(sp) and cur.get('open', True) and i == cur['pages'][-1] + 1:
            cur['pages'].append(i)
        if is_example(sp) and cur:
            cur['open'] = False
    for c in out:
        c.pop('open', None)
    return out


def markers(p):
    sp, ms = spans(p), []
    plus_y = None
    for s in sp:
        f, y, t = s['font'], s['bbox'][1], s['text'].strip()
        if f.startswith('NanumSquareRou') and 9.5 < s['size'] < 10.2:
            ms.append(dict(y=y, kind='개념', head=t))
        elif f.startswith('BalooBhaina') and t == 'Plus':
            plus_y = y; ms.append(dict(y=y, kind='plus-start', head='개념 Plus'))
        elif f.startswith('BalooBhaina') and t == 'Check':
            ms.append(dict(y=y, kind='check', head='개념 Check'))
        elif f.startswith('YDVYGO14') and 8.5 < s['size'] < 9.1 and s['color'] == 0x2f5580:
            ms.append(dict(y=y, kind='plus', head=t))
    # 같은 줄에 쪼개진 소제목 합치기
    ms.sort(key=lambda m: m['y'])
    merged = []
    for m in ms:
        if merged and abs(merged[-1]['y'] - m['y']) < 3 and merged[-1]['kind'] == m['kind']:
            merged[-1]['head'] += m['head']
        else:
            merged.append(m)
    # 'Plus' 머리 바로 아래 첫 소제목이 있으면 머리는 그 소제목에 붙인다
    res = []
    for m in merged:
        if res and res[-1]['kind'] == 'plus-start' and m['kind'] == 'plus' and m['y'] - res[-1]['y'] < 40:
            res[-1] = dict(y=res[-1]['y'], kind='plus', head=m['head'])
        else:
            res.append(m)
    return res


def content_bottom(p):
    ys = [s['bbox'][3] for s in spans(p) if s['bbox'][3] < FOOT]
    ys += [d['rect'].y1 for d in p.get_drawings() if d['rect'].y1 < FOOT and d['rect'].x0 > X0 - 10]
    return min(FOOT, max(ys) + 6) if ys else FOOT


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pdf', required=True); ap.add_argument('--out', required=True)
    ap.add_argument('--only', type=int, default=0)
    a = ap.parse_args()
    doc = pymupdf.open(a.pdf)
    allc = concepts(doc)
    result = []
    for n, c in enumerate(allc, 1):
        if a.only and n != a.only:
            continue
        d = os.path.join(a.out, f'{n:02d}'); os.makedirs(d, exist_ok=True)
        cuts = []
        for pi in c['pages']:
            p = doc[pi]
            ms = markers(p)
            top = 112 if pi != c['pages'][0] else 108
            # 첫 쪽: 제목 띠 아래부터. 쪽 첫 표시 앞에 이어지는 내용이 있으면 앞 토막에 붙인다
            bottom = content_bottom(p)
            starts = [m['y'] - 7 for m in ms]
            if pi != c['pages'][0] and (not ms or ms[0]['y'] > 140) and cuts:
                end = starts[0] if ms else bottom
                cuts[-1]['parts'].append(dict(page=pi + 1, y0=60, y1=end))
            for k, m in enumerate(ms):
                y0 = starts[k]; y1 = starts[k + 1] if k + 1 < len(ms) else bottom
                if m['kind'] == 'check':
                    y0 = m['y'] + 30   # 'Check' 머리줄과 「정답과 해설 ○쪽」은 빼고 문제만
                if m['kind'] == 'plus-start':
                    continue
                cuts.append(dict(kind=m['kind'], head=m['head'], parts=[dict(page=pi + 1, y0=y0, y1=y1)]))
        for k, ct in enumerate(cuts, 1):
            pics = []
            for pt in ct['parts']:
                pix = doc[pt['page'] - 1].get_pixmap(dpi=DPI, clip=pymupdf.Rect(X0, pt['y0'], X1, pt['y1']))
                pics.append(pix)
            # 여러 쪽에 걸친 토막은 세로로 이어 붙인다
            w = max(p.width for p in pics); h = sum(p.height for p in pics)
            if len(pics) == 1:
                pics[0].save(os.path.join(d, f'cut_{k:02d}.png'))
            else:
                from PIL import Image
                im = Image.new('RGB', (w, h), 'white'); yy = 0
                for p in pics:
                    im.paste(Image.frombytes('RGB', (p.width, p.height), p.samples), (0, yy)); yy += p.height
                im.save(os.path.join(d, f'cut_{k:02d}.png'))
            ct['file'] = f'{n:02d}/cut_{k:02d}.png'
        result.append(dict(no=n, title=c['title'], pages=[p + 1 for p in c['pages']], cuts=cuts))
        print(n, c['title'], [f"{ct['kind']}:{ct['head'][:14]}" for ct in cuts])
    with open(os.path.join(a.out, 'cuts.json' if not a.only else f'cuts_{a.only:02d}.json'), 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
