"""증명 대본 검사 + 노트 미리보기 (음성·영상 없이, 돈 안 듦)

  python scripts/lesson-video/proof_validate.py <증명 대본.json 또는 폴더> [--sheet <미리보기 폴더>]

잡는 것: 말(say)에 영문자·숫자·기호, { } 짝, 모르는 표시, 자세(A~E) 아님, cue 가 말에 없음,
         수식(tex)이 안 그려짐, 말풍선에 화면에서 깨지는 글자, 노트 줄이 너무 넓음(자동으로 줄어듦 → 경고)
--sheet: 노트에 쓰일 줄을 단계별로 쌓은 그림 (<id>.png) — 영상 마지막 노트와 같은 모양
"""
import argparse, glob, io, json, os, re, sys
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lesson_video import plain, font, has_glyph, penfont
PENF = penfont(40)
from proof_video import render_line, COLORS, NOTE

GOTHIC = font(32, True)
MAXW = (NOTE[2] - NOTE[0] - 8) - 130 - 40


def check(path, sheet_dir=None):
    errs, warns = [], []
    P = json.load(open(path, encoding='utf-8'))
    for k in ('id', 'title', 'concept_no', 'chapter', 'sub_chapter', 'book_page', 'steps'):
        if k not in P: errs.append(f'항목 없음: {k}')
    total = 0; rows = []
    for i, st in enumerate(P.get('steps', []), 1):
        tag = f'단계{i}'
        say = st.get('say', ''); p = plain(say); total += len(p)
        if st.get('pose') not in ('A', 'B', 'C', 'D', 'E'): errs.append(f'{tag}: pose 는 A~E')
        if say.count('{') != say.count('}'): errs.append(f'{tag}: {{ }} 짝이 안 맞음')
        for m in re.findall(r'\{(\S+)', say):
            if m not in ('빠르게', '강조', '천천히'): errs.append(f'{tag}: 모르는 표시 {{{m}')
        bad = re.findall(r'[A-Za-z0-9$\\^_=+*/<>√²³∴≤≥±→()\[\]|]', p)
        if bad: errs.append(f'{tag}: 말에 읽기 어려운 글자 {"".join(sorted(set(bad)))}')
        miss = {c for c in st.get('bubble', '') if not has_glyph(GOTHIC, c)}
        if miss: errs.append(f'{tag}: 말풍선에 □로 깨지는 글자 {"".join(sorted(miss))}')
        if not st.get('bubble'): errs.append(f'{tag}: 말풍선 비었음')
        norm = lambda s: re.sub(r'[\s,]', '', s)
        for j, w in enumerate(st.get('write', []), 1):
            wt = f'{tag} 줄{j}'
            if norm(w.get('cue', '')) not in norm(p): errs.append(f'{wt}: cue 「{w.get("cue")}」가 말에 없음')
            if w.get('color', 'ink') not in COLORS: errs.append(f'{wt}: color 는 ink/red/blue')
            outside = re.sub(r'\$[^$]*\$', '', w.get('tex', ''))      # 수식 밖 글자는 손글씨 글꼴로만 그려진다
            miss = {c for c in outside if not c.isspace() and not has_glyph(PENF, c)}
            if miss: errs.append(f'{wt}: 노트에서 □로 깨지는 글자 {"".join(sorted(miss))} — 수식($…$) 안으로 넣거나 다른 글자로')
            try:
                img = render_line(w['tex'], COLORS[w.get('color', 'ink')], w.get('size', 60))
            except Exception as e:
                errs.append(f'{wt}: 수식이 안 그려짐 — {str(e).splitlines()[0][:80]}'); continue
            if img.width > MAXW - 70 * w.get('indent', 0):
                warns.append(f'{wt}: 줄이 넓어 {int(100 * (MAXW - 70 * w.get("indent", 0)) / img.width)}% 로 줄어듦 — 두 줄로 나누는 게 좋음')
            rows.append((i, w, img))
    if not (500 <= total <= 2000): warns.append(f'말 전체 {total}자 (보통 800~1600자)')
    if sheet_dir and rows:
        os.makedirs(sheet_dir, exist_ok=True)
        Wd = 1400; h = sum(r[2].height + 26 for r in rows) + 40 * len(P['steps']) + 80
        im = Image.new('RGB', (Wd, h), (253, 252, 247)); d = ImageDraw.Draw(im); y = 30; cur = 0
        for i, w, img in rows:
            if i != cur:
                cur = i; st = P['steps'][i - 1]
                d.text((10, y), f"단계 {i} · 자세 {st.get('pose')} · {st.get('bubble')}", font=font(22, True), fill=(150, 60, 29)); y += 36
            x = 130 + 70 * w.get('indent', 0)
            if img.width > Wd - x - 20: img = img.resize((Wd - x - 20, int(img.height * (Wd - x - 20) / img.width)))
            im.paste(img, (x, y), img)
            if w.get('box'): d.rounded_rectangle((x - 14, y - 10, x + img.width + 14, y + img.height + 10), 14, outline=(215, 54, 44), width=5)
            if w.get('underline'): d.line([(x, y + img.height + 10), (x + img.width, y + img.height + 10)], fill=(215, 54, 44), width=5)
            y += img.height + 26
        im.save(os.path.join(sheet_dir, P['id'] + '.png'))
    return errs, warns, total


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('target'); ap.add_argument('--sheet')
    a = ap.parse_args()
    files = sorted(glob.glob(os.path.join(a.target, '*.json'))) if os.path.isdir(a.target) else [a.target]
    bad = 0
    for f in files:
        e, w, n = check(f, a.sheet)
        print(f"[{'통과' if not e else '고칠 것'}] {os.path.basename(f)}  ({n}자)")
        for x in e: print('   ✗', x)
        for x in w: print('   ·', x)
        bad += bool(e)
    print(f'\n{len(files)}편 중 고칠 것 {bad}편'); sys.exit(1 if bad else 0)


if __name__ == '__main__':
    import logging; logging.getLogger('matplotlib.mathtext').setLevel(logging.ERROR)
    main()
