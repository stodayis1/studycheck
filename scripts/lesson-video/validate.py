"""강의 대본 JSON 검사 — 영상으로 만들기 전에 기계로 잡을 수 있는 실수를 잡는다.

  python scripts/lesson-video/validate.py <대본.json 또는 폴더> --pdf <개념편 PDF> --mat <재료 폴더>

잡는 것
  · 수지쌤 말(say)에 영문자·숫자·수식 기호가 남음 → 음성이 이상하게 읽는다
  · 표시 { } 짝이 안 맞음, 모르는 표시
  · 필기(marks)의 cue 가 말 안에 없음 → 필기가 엉뚱한 때 나온다
  · 필기의 find 가 그 토막 안에서 안 찾아짐 → 영상 만들 때 멈춘다
  · show 가 없는 토막을 가리킴, 말풍선·필기 글자가 너무 김
"""
import argparse, glob, json, os, re, sys
import pymupdf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lesson_video import parse_say, plain, find_rect, penfont, font, has_glyph, SUP
PEN, GOTHIC = penfont(40), font(36, True)

TYPES = {'underline', 'box', 'circle', 'highlight', 'note', 'arrow'}


def check(path, doc, mat_dir):
    errs, warns = [], []
    L = json.load(open(path, encoding='utf-8'))
    mat = json.load(open(os.path.join(mat_dir, f"{L['no']:02d}.json"), encoding='utf-8'))
    cuts = {c['show']: c for c in mat['cuts']}
    for k in ('no', 'title', 'file', 'chapter', 'sub_chapter', 'book', 'unit', 'pages', 'scenes', 'examples'):
        if k not in L: errs.append(f'항목 없음: {k}')
    if os.path.basename(path) != L.get('file', '') + '.json':
        warns.append(f"파일 이름이 file 항목과 다름: {os.path.basename(path)}")
    total = 0
    for i, sc in enumerate(L.get('scenes', []), 1):
        tag = f'장면{i}'
        for k in ('show', 'step', 'bubble', 'say'):
            if not sc.get(k): errs.append(f'{tag}: {k} 비었음')
        show = sc.get('show', '')
        if show not in ('title', 'examples') and show not in cuts:
            errs.append(f'{tag}: 없는 토막 {show}')
        say = sc.get('say', '')
        if say.count('{') != say.count('}'): errs.append(f'{tag}: {{ }} 짝이 안 맞음')
        for m in re.findall(r'\{(\S+)', say):
            if m not in ('빠르게', '강조', '천천히'): errs.append(f'{tag}: 모르는 표시 {{{m}')
        p = plain(say); total += len(p)
        bad = re.findall(r'[A-Za-z0-9$\\^_=+*/<>√²³∴≤≥±→()\[\]|]', p)
        if bad: errs.append(f'{tag}: 말에 읽기 어려운 글자 {"".join(sorted(set(bad)))}  ← 한글로 풀어 쓸 것')
        clip = sc.get('clip')
        if clip:
            if show not in cuts: errs.append(f'{tag}: clip 은 교재 토막 장면에만')
            elif not (cuts[show]['y0'] - 2 <= clip[0] < clip[1] <= cuts[show]['y1'] + 2):
                errs.append(f'{tag}: clip {clip} 이 토막(y {cuts[show]["y0"]}~{cuts[show]["y1"]}) 밖')
        for k in ('bubble', 'step'):          # 칩·말풍선은 맑은 고딕으로 그린다
            miss = {c for c in sc.get(k, '') if not has_glyph(GOTHIC, c)}
            if miss: errs.append(f'{tag}: {k} 에 화면에서 □로 깨지는 기호 {"".join(sorted(miss))}')
        for m in sc.get('marks', []):          # 필기는 손글씨 → 없으면 맑은 고딕
            miss = {c for c in m.get('text', '').replace('−', '-') if c not in SUP and not has_glyph(PEN, c) and not has_glyph(GOTHIC, c)}
            if miss: errs.append(f'{tag}: 필기 「{m.get("text")}」에 □로 깨지는 기호 {"".join(sorted(miss))}  (Ø ∈ ⊂ ∩ ∪ × ≠ → 는 됨)')
        if len(sc.get('bubble', '')) > 28: warns.append(f'{tag}: 말풍선이 김({len(sc["bubble"])}자)')
        for j, m in enumerate(sc.get('marks', []), 1):
            mt = f'{tag} 필기{j}'
            if m.get('type') not in TYPES: errs.append(f'{mt}: 모르는 종류 {m.get("type")}')
            norm = lambda s: re.sub(r'[\s,]', '', s)
            if norm(m.get('cue', '')) not in norm(p): errs.append(f'{mt}: cue 「{m.get("cue")}」가 말 안에 없음')
            if show not in cuts:
                errs.append(f'{mt}: 교재 토막이 없는 장면에는 필기를 못 함'); continue
            c = cuts[show]; page = doc[c['page'] - 1]
            if 'rect' not in m and 'find' not in m:
                errs.append(f'{mt}: find 나 rect 가 필요')
            else:
                g = find_rect(m, page, (c['y0'], c['y1']))   # 영상 도구와 똑같이 계산한 자리 (nth 는 토막 안 순번)
                if g is None:
                    errs.append(f'{mt}: 「{m.get("find")}」를 토막 안에서 못 찾음')
                elif clip and not (clip[0] - 2 <= g[1] and g[3] <= clip[1] + 2):
                    errs.append(f'{mt}: 필기 자리(y {g[1]:.0f}~{g[3]:.0f})가 확대 범위 clip {clip} 밖')
                elif not (c['y0'] - 2 <= g[1] and g[3] <= c['y1'] + 2):
                    errs.append(f'{mt}: 실제로 그려질 자리(y {g[1]:.0f}~{g[3]:.0f})가 토막(y {c["y0"]}~{c["y1"]}) 밖 — nth 확인')
            # 같은 cue 가 말에 두 번 이상 나오면, 앞 필기 다음 것부터 찾는다(영상 도구) — 의도와 다를 수 있어 알려 준다
            if p.replace(' ', '').count(m.get('cue', '').replace(' ', '')) > 1:
                warns.append(f'{mt}: cue 「{m.get("cue")}」가 말에 여러 번 나옴 — 앞 필기 뒤 첫 번째에 걸린다')
            if m.get('type') in ('note', 'arrow') and len(m.get('text', '')) > 22:
                warns.append(f'{mt}: 필기 글자가 김')
    if not (500 <= total <= 2000): warns.append(f'말 전체 {total}자 (보통 700~1500자)')
    return errs, warns, total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('target'); ap.add_argument('--pdf', required=True); ap.add_argument('--mat', required=True)
    a = ap.parse_args()
    doc = pymupdf.open(a.pdf)
    files = sorted(glob.glob(os.path.join(a.target, '*.json'))) if os.path.isdir(a.target) else [a.target]
    files = [f for f in files if not os.path.basename(f).startswith('_')]
    bad = 0
    for f in files:
        e, w, n = check(f, doc, a.mat)
        mark = '통과' if not e else '고칠 것'
        print(f'[{mark}] {os.path.basename(f)}  ({n}자)')
        for x in e: print('   ✗', x)
        for x in w: print('   ·', x)
        bad += bool(e)
    print(f'\n{len(files)}편 중 고칠 것 {bad}편')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
