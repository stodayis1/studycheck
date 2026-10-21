"""유튜브 썸네일 — GPT 로 만든 01~27편과 같은 모양 (연두 파스텔 바탕 · 번호 배지 · 굵은 제목 · 말풍선 · 수지)

  python scripts/lesson-video/thumbnails.py <영상 폴더> [--only 30,31] [--proofs] [--force]

· 개념: 연두 파스텔(#DDF5E6). 영상 폴더의 NN_개념_….구간.json 마다, GPT 썸네일(큰 파일)이 이미 있으면 건너뛴다.
· 증명(--proofs): 한 단계 진한 초록 바탕(원장님 2026-10-20) — 개념 썸네일과 목록에서 구분된다.
· 풀이(--solutions, <영상 폴더>/풀이영상): 민트 초록 바탕 · 배지 「필수예제 01」 + 「개념+유형 9쪽」 · 수지 자세는 편마다 돌아가며.
· 수지 자세는 대본의 thumb_pose (A 가리키기 · B 이것만 기억 · C 갸웃 · D 지시봉 · E 화이팅). 증명은 D.
· 크기는 GPT 썸네일과 같은 1672×941.
"""
import glob, json, os, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(HERE, '..', '..')
W, H = 1672, 941
F = 'C:/Windows/Fonts/'
TITLE_FONT = F + 'BlackHanSans-Regular.ttf'
POSE = {'A': 'pose_A_point.png', 'B': 'pose_B_remember.png', 'C': 'pose_C_wonder.png',
        'D': 'pose_D_pointer.png', 'E': 'pose_E_cheer.png'}
THEME = {
    'concept': dict(bg=(221, 245, 230), grid=(204, 234, 214), badge=(22, 72, 40), pill=(196, 232, 206),
                    label=(24, 52, 34), title=(17, 33, 52)),
    'proof':   dict(bg=(156, 214, 172), grid=(140, 200, 157), badge=(16, 58, 32), pill=(200, 236, 210),
                    label=(16, 44, 28), title=(12, 28, 44)),
    'solution': dict(bg=(204, 236, 228), grid=(188, 224, 213), badge=(18, 80, 70), pill=(176, 222, 208),
                    label=(16, 52, 46), title=(12, 28, 44)),
}


def font(path, sz): return ImageFont.truetype(path, sz)
def malgun(sz): return font(F + 'malgunbd.ttf', sz)

# 블랙한산스에 없는 글자(² · − ≠ 등)는 맑은 고딕 굵게로 채운다
_ND = {}
def has(f, ch):
    if f not in _ND: _ND[f] = bytes(f.getmask(chr(0x10FFFD)))
    return ch == ' ' or bytes(f.getmask(ch)) != _ND[f]
def fb(f, ch): return f if has(f, ch) else malgun(int(f.size * 0.92))
SUP = {'²': '2', '³': '3'}
SWAP = {'−': '-', '·': ', '}          # 블랙한산스·맑은 고딕 둘 다 어색한 기호는 비슷한 글자로

def _glyphs(text, f):
    """(글자, 글꼴, 세로 위치 보정) 목록 — 위첨자는 작게 위로, 없는 기호는 맑은 고딕을 키워서 가운데로"""
    out = []
    for c in ''.join(SWAP.get(ch, ch) for ch in text):
        if c == '≠':                                  # 굵은 = 에 사선을 직접 긋는다 (draw 에서)
            out.append(('≠', f, 0))
        elif c in SUP:
            out.append((SUP[c], font(TITLE_FONT, int(f.size * 0.55)), -f.size * 0.02))
        elif has(f, c):
            out.append((c, f, 0))
        else:
            g = malgun(int(f.size * 1.0)); out.append((c, g, -f.size * 0.08))
    return out

def tw(d, text, f): return sum(d.textlength('=' if c == '≠' else c, font=g) for c, g, _ in _glyphs(text, f))

def draw(d, xy, text, f, fill):
    x, y = xy
    for c, g, dy in _glyphs(text, f):
        if c == '≠':
            w = d.textlength('=', font=g); d.text((x, y), '=', font=g, fill=fill)
            box = d.textbbox((x, y), '=', font=g)
            d.line([(x + w * 0.72, box[1] - g.size * 0.12), (x + w * 0.28, box[3] + g.size * 0.12)], fill=fill, width=max(4, g.size // 14))
            x += w; continue
        d.text((x, y + dy), c, font=g, fill=fill); x += d.textlength(c, font=g)

# 썸네일에서만 바꿔 쓰는 말풍선 (대본 말풍선이 기호라 썸네일만 보고는 뜻이 안 통할 때)
BUBBLE = {31: '곱의 법칙으로 함수 세기', 20: '겹친 부분은 한 번만 세기', 10: '연립 → 이차방정식 → 판별식'}


def split_title(d, title, f, width):
    """띄어쓰기로 나눠 최대 3줄. 줄 길이를 고르게"""
    words = title.split(' ')
    best = None
    for n in (1, 2, 3, 4):
        if n > len(words): break
        # 단어를 n 덩어리로 나누는 가장 고른 방법
        import itertools
        for cuts in itertools.combinations(range(1, len(words)), n - 1):
            parts = [' '.join(words[a:b]) for a, b in zip((0,) + cuts, cuts + (len(words),))]
            wmax = max(tw(d, p, f) for p in parts)
            if wmax <= width and (best is None or (n, wmax) < (best[0], best[1])):
                best = (n, wmax, parts)
        if best: return best[2]
    return None


def make(kind, no_label, chapter, title, bubble, pose, pill=None):
    T = THEME[kind]
    im = Image.new('RGB', (W, H), T['bg']); d = ImageDraw.Draw(im)
    for x in range(0, W, 46): d.line([(x, 0), (x, H)], fill=T['grid'], width=2)
    for y in range(0, H, 46): d.line([(0, y), (W, y)], fill=T['grid'], width=2)
    # 배지 + 과정
    bf = malgun(64); bw = d.textlength(no_label, font=bf) + 56
    d.rounded_rectangle((70, 60, 70 + bw, 160), 26, fill=T['badge'])
    d.text((70 + bw / 2, 110), no_label, font=bf, fill=(255, 255, 255), anchor='mm')
    lf = malgun(46); lab = pill or f'공통수학2 · {chapter}'; lw = d.textlength(lab, font=lf)
    d.rounded_rectangle((70 + bw + 22, 72, 70 + bw + 22 + lw + 52, 148), 38, fill=T['pill'])
    d.text((70 + bw + 48, 110), lab, font=lf, fill=T['label'], anchor='lm')
    # 수지 자리를 먼저 잡는다 (지시봉처럼 옆으로 뻗은 자세도 제목을 덮지 않게)
    sj = Image.open(os.path.join(HERE, 'suji', POSE[pose])).convert('RGBA'); sj = sj.crop(sj.getbbox())
    th = int(H * (0.84 if pose == 'E' else 0.95))
    sj = sj.resize((int(sj.width * th / sj.height), th), Image.LANCZOS)
    x = W - sj.width - 40
    # 제목 (굵은 블랙한산스) — 수지 왼쪽 칸에 맞게 크기·줄
    area_w = min(900, x - 66 - 30)
    parts = None
    for sz in (190, 172, 156, 140, 126, 112, 100, 90, 80, 72):
        f = font(TITLE_FONT, sz)
        parts = split_title(d, title, f, area_w)
        if parts and len(parts) * sz * 1.08 <= 470: break
    if not parts:                                   # 띄어쓰기 없는 긴 수식 — 글자 단위로 나눈다
        parts, cur = [], ''
        for ch in title:
            if tw(d, cur + ch, f) > area_w: parts.append(cur); cur = ch
            else: cur += ch
        parts.append(cur)
    y = 205 + (470 - len(parts) * sz * 1.08) / 2
    for p in parts:
        draw(d, (66, y), p, f, T['title']); y += sz * 1.08
    # 말풍선
    kf = malgun(50); kw = d.textlength(bubble, font=kf)
    while kw > 800 and kf.size > 34: kf = malgun(kf.size - 2); kw = d.textlength(bubble, font=kf)
    by = 700
    sh = Image.new('L', (W, H), 0); ImageDraw.Draw(sh).rounded_rectangle((60, by + 8, 60 + kw + 110, by + 118), 55, fill=60)
    im.paste((90, 120, 100), (0, 0), sh.filter(ImageFilter.GaussianBlur(10)))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((60, by, 60 + kw + 110, by + 110), 55, fill=(255, 255, 255))
    tx = 60 + kw + 110
    d.polygon([(tx - 70, by + 18), (tx + 40, by - 18), (tx - 20, by + 60)], fill=(255, 255, 255))
    d.text((115, by + 55), bubble, font=kf, fill=(20, 24, 30), anchor='lm')
    d.text((70, 880), '수학의지혜 수지쌤', font=malgun(34), fill=(70, 90, 80), anchor='lm')
    # 수지
    shadow = sj.split()[-1].point(lambda v: v * 0.22).filter(ImageFilter.GaussianBlur(14))
    im.paste((40, 60, 50), (x + 14, H - th + 18), shadow)
    im.paste(sj, (x, H - th + 8), sj)
    return im


def main():
    a = sys.argv[1:]
    folder = a[0]; force = '--force' in a; proofs = '--proofs' in a
    if '--solutions' in a:
        made = []
        for k, g in enumerate(sorted(glob.glob(os.path.join(folder, '*_풀이*.구간.json')))):
            base = g[:-len('.구간.json')]
            if os.path.exists(base + '.jpg') and not force: continue
            G = json.load(open(g, encoding='utf-8'))
            bub = next((st['bubble'] for st in G['steps'][2:] if st.get('lines')), G['steps'][-1]['bubble'])
            # 원장님 2026-10-21: 썸네일에 교재 쪽과 문제 번호가 꼭 있어야 한다 → 배지 「필수예제 05」, 옆에 「개념+유형 60쪽」
            make('solution', G['label'], '', G['title'], bub, 'ABCD'[k % 4],
                 pill=f"개념+유형 {G['book_page']}쪽").save(base + '.jpg', quality=93)
            made.append(os.path.basename(base))
        print(len(made), '장'); [print(' ', m) for m in made]; return
    only = set(a[a.index('--only') + 1].split(',')) if '--only' in a else None
    scripts = {}
    for f in glob.glob(os.path.join(REPO, 'docs', '대본', '공통수학2', '*.json')):
        if os.path.basename(f).startswith('_'): continue
        L = json.load(open(f, encoding='utf-8')); scripts[L['no']] = L
    made = []
    if not proofs:
        for g in sorted(glob.glob(os.path.join(folder, '*_개념_*.구간.json'))):
            base = g[:-len('.구간.json')]; no = os.path.basename(base)[:2]
            if only and no not in only: continue
            big = [p for p in (base + '.jpg', base + '.png') if os.path.exists(p) and os.path.getsize(p) > 500000]
            if big and not force: continue                      # 원장님이 GPT 로 만든 것은 그대로 둔다
            L = scripts[int(no)]
            bubble = BUBBLE.get(L['no']) or next(s['bubble'] for s in L['scenes'] if s['show'].startswith('cut_'))
            make('concept', no, L['chapter'], L['title'], bubble, L.get('thumb_pose', 'A')).save(base + '.jpg', quality=93)
            made.append(os.path.basename(base))
    else:
        for g in sorted(glob.glob(os.path.join(folder, '*_증명*.구간.json'))):
            base = g[:-len('.구간.json')]
            G = json.load(open(g, encoding='utf-8'))
            if only and G['order'] not in only: continue
            if os.path.exists(base + '.jpg') and not force: continue
            make('proof', G['order'], G['chapter'] + ' 증명', G['title'], G['steps'][0]['bubble'], 'D').save(base + '.jpg', quality=93)
            made.append(os.path.basename(base))
    print(len(made), '장'); [print(' ', m) for m in made]


if __name__ == '__main__':
    main()
