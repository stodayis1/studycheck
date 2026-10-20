"""강의영상 만들기 — 대본 JSON → mp4 (1920x1080, 30fps)

  python scripts/lesson-video/lesson_video.py <대본.json> --pdf <개념편 PDF> --cuts <토막 폴더> --out <out.mp4>

화면: 왼쪽 큰 교재 카드(토막을 글씨가 크게 보이도록 확대) · 오른쪽 단계 칩, 말풍선, 수지.
필기: 장면의 marks 를 말하는 시점(cue)에 맞춰 펜으로 그리듯 그린다.
  {"cue": "대본 say 안의 글자", "type": "underline|box|circle|highlight|note|arrow",
   "find": "교재 글자(텍스트층 그대로)", "nth": 0, "pad": 3,
   "rect": [x0, y0, x1, y1]   (find 대신 PDF 좌표로 직접),
   "text": "필기 글자", "at": "right|below|above|left"   (note)}
음성: ElevenLabs 원장님 목소리, 문장 시각(alignment)을 받아 cue → 초로 바꾼다. 장면별로 캐시.
입: 1/30초 소리 크기로 다문 입·반·크게, 눈은 3~5초마다 깜빡.
"""
import argparse, base64, hashlib, json, math, os, random, subprocess, sys, urllib.error, urllib.request
import numpy as np
try:
    import pymupdf          # 교재 PDF 를 읽을 때만 필요 (증명 영상은 안 씀)
except Exception:
    pymupdf = None
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
W, H, FPS, GAP = 1920, 1080, 30, 0.45
DPI = 220; X0 = 108                     # concept_cuts.py 와 같은 값
BG = (246, 241, 235); INK = (36, 26, 21); SOFT = (107, 93, 85); BRICK = (153, 60, 29)
CARD = (255, 255, 255); LINE = (230, 221, 213)
PEN = (226, 54, 44); HL = (255, 214, 64)
FONTS = 'C:/Windows/Fonts/'
PENFONT = os.path.join(HERE, 'fonts', 'NanumPenScript-Regular.ttf')


def font(sz, bold=False):
    return ImageFont.truetype(FONTS + ('malgunbd.ttf' if bold else 'malgun.ttf'), sz)


SUP = {'²': '2', '³': '3'}
_ND = {}
def has_glyph(f, ch):
    if f not in _ND:
        _ND[f] = bytes(f.getmask('\U0010FFFD'))   # 없는 글자를 그리면 나오는 모양
    return ch == ' ' or bytes(f.getmask(ch)) != _ND[f]


def penfont(sz):
    return ImageFont.truetype(PENFONT, int(sz * 1.35)) if os.path.exists(PENFONT) else font(sz, True)


def wrap(d, text, fnt, width):
    lines, cur = [], ''
    for ch in text:
        if d.textlength(cur + ch, font=fnt) > width and cur:
            cut = cur.rfind(' ')
            if cut > 0:
                lines.append(cur[:cut]); cur = cur[cut + 1:] + ch
            else:
                lines.append(cur); cur = ch
        else:
            cur += ch
    if cur:
        lines.append(cur)
    return lines


# ───────────────────────── 음성 ─────────────────────────
def env(name):
    for l in open(os.path.join(HERE, '..', '..', '.env.local'), encoding='utf-8').read().splitlines():
        if l.startswith(name + '='):
            return l.split('=', 1)[1].strip()


# 대본 표시 (선생님이 대본 파일에서 직접 고칠 수 있게 단순하게)
#   /        잠깐 쉼 (0.2초)          //       길게 쉼 (0.55초)
#   {빠르게 …}  단순 계산·읽기 — 빠르게    {강조 …}  중요한 말 — 천천히, 크게, 힘 줘서
#   {천천히 …}  처음 나오는 정의 — 또박또박
# 표시가 없는 쉼표는 따로 쉬게 하지 않는다 (쉼표마다 쉬면 뚝뚝 끊긴다, 원장님 2026-10-15)
MODES = {                     # 차이를 작게 — 너무 크면 억양이 인위적으로 오르내린다 (원장님 2026-10-15)
    '보통':   dict(speed=1.0,  stability=0.55, style=0.15, gain=0),
    '빠르게': dict(speed=1.08, stability=0.55, style=0.10, gain=0),
    '강조':   dict(speed=0.97, stability=0.50, style=0.25, gain=2),
    '천천히': dict(speed=0.94, stability=0.55, style=0.15, gain=0),
}
PAUSE = {'/': 0.2, '//': 0.55}


# 읽기 고침 — 대본은 맞춤법대로 쓰고, 소리 내기 직전에만 바꾼다 (원장님 2026-10-15)
#  · 「원점」은 [원쩜]으로 소리 난다. 글자대로 「원점」이라 읽으면 어색하다
#  · 「점 에이」를 띄어 쓰면 「…오와 점 / 에이」처럼 「점」 뒤에서 끊어 읽는다 → 「점에이」로 붙인다
SOUND = [('꼭짓점', '꼭찌쩜'), ('원점', '원쩜'), ('교점', '교쩜'), ('중점', '중쩜'), ('내분점', '내분쩜'),
         ('외분점', '외분쩜'), ('접점', '접쩜'), ('정점', '정쩜'), ('끝점', '끝쩜')]
LETTERS = '에이|비|씨|디|이|에프|지|에이치|아이|제이|케이|엠|엔|오|피|큐|알|에스|티|유|브이|더블유|엑스|와이|제트'


def sound(text):
    import re
    for a, b in SOUND:
        text = text.replace(a, b)
    return re.sub(r'(쩜|점) (' + LETTERS + r')(?=[\s,.?!와과의은는이가을를도에까부로으만랑]|$)', r'\1\2', text)


def parse_say(say):
    """대본 한 장면 → [('pause', 초) | ('speak', 글자, 방식)]"""
    import re
    out = []
    for tok in re.split(r'(\{[^{}]+\}|\s//\s|\s/\s)', ' ' + say + ' '):
        if not tok or not tok.strip():
            continue
        t = tok.strip()
        if t in PAUSE:
            out.append(('pause', PAUSE[t])); continue
        m = re.fullmatch(r'\{(빠르게|강조|천천히)\s+(.+)\}', t, re.S)
        if m:
            out.append(('speak', m.group(2).strip(), m.group(1)))
        else:
            out.append(('speak', t, '보통'))
    # 「…}이야.」처럼 표시 바로 뒤에 붙은 짧은 꼬리말은 따로 읽히면 어색하다 → 앞 토막에 붙인다
    merged = []
    for it in out:
        if (it[0] == 'speak' and it[2] == '보통' and len(it[1]) <= 7 and merged and merged[-1][0] == 'speak'):
            prev = merged.pop()
            glue = '' if it[1][0] in '이가은는을를야의에와과도만' else ' '
            merged.append(('speak', prev[1] + glue + it[1], prev[2]))
        else:
            merged.append(it)
    return merged


def plain(say):
    return ' '.join(x[1] for x in parse_say(say) if x[0] == 'speak')


def tts_chunk(text, mode, voice, model, cache, prev, nxt):
    os.makedirs(cache, exist_ok=True)
    st = MODES[mode]
    key = hashlib.sha1(json.dumps([sound(text), st, voice, model, prev[-200:], nxt[:200], 3]).encode()).hexdigest()[:16]
    mp3, al = os.path.join(cache, key + '.mp3'), os.path.join(cache, key + '.json')
    if not os.path.exists(mp3):
        body = dict(text=sound(text), model_id=model, language_code='ko',
                    voice_settings=dict(stability=st['stability'], similarity_boost=0.85, style=st['style'],
                                        speed=st['speed'], use_speaker_boost=True))
        if prev: body['previous_text'] = sound(prev)[-500:]
        if nxt: body['next_text'] = sound(nxt)[:500]
        req = urllib.request.Request(
            f'https://api.elevenlabs.io/v1/text-to-speech/{voice}/with-timestamps?output_format=mp3_44100_128',
            data=json.dumps(body).encode(), headers={'xi-api-key': env('ELEVENLABS_API_KEY'), 'content-type': 'application/json'})
        import time
        for attempt in range(8):                   # 동시에 너무 많이 보내면 429 — 기다렸다 다시 (크레딧 부족이면 멈춘다)
            try:
                j = json.load(urllib.request.urlopen(req, timeout=300)); break
            except urllib.error.HTTPError as e:
                body = e.read().decode('utf-8', 'ignore')
                if e.code == 429 and 'quota' not in body and attempt < 7:
                    time.sleep(3 * (attempt + 1) + random.random() * 3); continue
                raise SystemExit(f'ElevenLabs {e.code}: {body[:300]}')
        open(mp3, 'wb').write(base64.b64decode(j['audio_base64']))
        json.dump(j['alignment'], open(al, 'w', encoding='utf-8'), ensure_ascii=False)
    return mp3, json.load(open(al, encoding='utf-8'))


def decode(mp3, sr=44100):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', mp3, '-ac', '1', '-ar', str(sr), '-f', 's16le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768


def synth_scene(say, voice, model, cache, prev_scene='', next_scene='', out_wav=None):
    """장면 하나를 토막별로 읽혀 이어 붙인다. 토막 앞뒤 빈 소리는 잘라서 쉬는 길이를 우리가 정한다.
    돌려주는 정렬(alignment)은 표시를 뺀 글자 기준."""
    sr = 44100
    items = parse_say(say)
    texts = [x[1] for x in items if x[0] == 'speak']
    audio, chars, starts, ends = [], [], [], []
    t = 0.0; k = 0; last_speak = False
    for it in items:
        if it[0] == 'pause':
            n = int(it[1] * sr); audio.append(np.zeros(n, np.float32)); t += n / sr; last_speak = False; continue
        text, mode = it[1], it[2]
        prev = ' '.join([prev_scene] + texts[:k]).strip(); nxt = ' '.join(texts[k + 1:] + [next_scene]).strip()
        mp3, al = tts_chunk(text, mode, voice, model, cache, prev, nxt); k += 1
        x = decode(mp3, sr) * (10 ** (MODES[mode]['gain'] / 20))
        loud = np.where(np.abs(x) > 0.02)[0]
        a0 = max(0, loud[0] - int(0.03 * sr)) if len(loud) else 0
        a1 = min(len(x), loud[-1] + int(0.08 * sr)) if len(loud) else len(x)
        if last_speak:                                   # 표시 없이 이어지는 토막 사이는 아주 짧게
            n = int(0.06 * sr); audio.append(np.zeros(n, np.float32)); t += n / sr
            chars.append(' '); starts.append(t); ends.append(t)
        x = x[a0:a1]; audio.append(np.clip(x, -1, 1)); lead = a0 / sr
        for c, s0, s1 in zip(al['characters'], al['character_start_times_seconds'], al['character_end_times_seconds']):
            chars.append(c); starts.append(max(0, s0 - lead) + t); ends.append(max(0, s1 - lead) + t)
        t += len(x) / sr; last_speak = True
        chars.append(' '); starts.append(t); ends.append(t)
    y = np.concatenate(audio) if audio else np.zeros(1, np.float32)
    import wave
    with wave.open(out_wav, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes())
    return out_wav, dict(characters=chars, character_start_times_seconds=starts, character_end_times_seconds=ends)


def cue_time(al, say, cue, after=0.0):
    """대본 안 cue 글자가 소리로 나오는 시각(초). 띄어쓰기·쉼표는 무시하고 찾는다.
    같은 말이 여러 번 나오면 after(앞 필기 시각) 이후 첫 번째 것."""
    norm = lambda s: ''.join(c for c in s if c not in ' ,')
    keep = [i for i, c in enumerate(al['characters']) if c not in ' ,']
    flat = ''.join(al['characters'][i] for i in keep)
    c = norm(sound(cue)); i = flat.find(c); first = i
    while i >= 0 and al['character_start_times_seconds'][keep[i]] < after - 1e-6:
        i = flat.find(c, i + 1)
    if i < 0: i = first
    if i >= 0:
        return al['character_start_times_seconds'][keep[i]]
    print(f'  ! cue 못 찾음, 어림: {cue}')
    j = plain(say).find(cue); end = al['character_end_times_seconds'][-1]
    return end * max(0, j) / max(1, len(plain(say))) if j >= 0 else 0.0


def pcm(mp3):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', mp3, '-ac', '1', '-ar', '16000', '-f', 's16le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768


def mouth_track(x, n):
    hop = 16000 / FPS
    rms = np.array([np.sqrt(np.mean(x[int(i * hop):int((i + 1) * hop)] ** 2)) if int(i * hop) < len(x) else 0.0
                    for i in range(n)])
    ref = np.percentile(rms[rms > 0], 90) if (rms > 0).any() else 1
    v = np.convolve(rms / ref, [0.25, 0.5, 0.25], 'same')
    seq = np.where(v < 0.18, 0, np.where(v < 0.55, 1, 2))
    for i in range(1, n - 1):             # 한 칸짜리 튐 제거
        if seq[i - 1] == seq[i + 1] != seq[i]:
            seq[i] = seq[i - 1]
    names = np.array(['closed', 'half', 'open'])[seq].tolist()
    rnd = random.Random(n); t = rnd.uniform(1.5, 3)
    while t * FPS < n - 5:
        i = int(t * FPS)
        if names[i] == 'closed':
            for k in range(4): names[i + k] = 'blink'
        t += rnd.uniform(3, 5)
    return names


# ───────────────────────── 화면 ─────────────────────────
CARD_BOX = (36, 132, 1500, 1052)


def shadow_card(im, box, r=26):
    sh = Image.new('L', im.size, 0); ImageDraw.Draw(sh).rounded_rectangle(box, r, fill=60)
    im.paste((150, 120, 100), (0, 0), sh.filter(ImageFilter.GaussianBlur(16)).point(lambda v: v // 3))
    ImageDraw.Draw(im).rounded_rectangle(box, r, fill=CARD, outline=LINE, width=2)


class Book:
    """토막 그림을 카드 안에 크게 놓고, PDF 좌표 → 화면 좌표 변환을 들고 있다."""

    def __init__(self, cut_png, part, clip=None):
        cut = Image.open(cut_png).convert('RGB')
        # clip=[y0, y1] (PDF 좌표): 장면에서 토막의 일부만 크게 보여 줄 때 (문항이 많은 정답 장면 등)
        self.cy = 0
        if clip:
            k = DPI / 72
            c0 = max(0, int((clip[0] - part['y0']) * k)); c1 = min(cut.height, int((clip[1] - part['y0']) * k))
            cut = cut.crop((0, c0, cut.width, c1)); self.cy = c0
        bb = cut.convert('L').point(lambda v: 255 if v < 110 else 0).getbbox() or (0, 0, cut.width, cut.height)
        bb = (max(0, bb[0] - 24), max(0, bb[1] - 24), min(cut.width, bb[2] + 24), min(cut.height, bb[3] + 24))
        self.img = cut.crop(bb)
        inner = (CARD_BOX[0] + 36, CARD_BOX[1] + 36, CARD_BOX[2] - 36, CARD_BOX[3] - 36)
        iw, ih = inner[2] - inner[0], inner[3] - inner[1]
        self.s = min(iw / self.img.width, ih / self.img.height, 1.9)
        self.img = self.img.resize((int(self.img.width * self.s), int(self.img.height * self.s)), Image.LANCZOS)
        self.ox = inner[0] + (iw - self.img.width) // 2
        self.oy = inner[1] + (ih - self.img.height) // 2
        self.bb, self.part = bb, part

    def to_screen(self, x, y):
        k = DPI / 72
        cx, cy = (x - X0) * k - self.bb[0], (y - self.part['y0']) * k - self.bb[1] - self.cy
        return self.ox + cx * self.s, self.oy + cy * self.s


def base_frame(L, sc, book, mouth):
    im = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(im)
    d.text((44, 26), f"{L['no']:02d}  {L['title']}", font=font(44, True), fill=INK)
    tw = d.textlength(f"{L['no']:02d}  {L['title']}", font=font(44, True))
    d.text((44 + tw + 24, 44), L['book'], font=font(24), fill=SOFT)
    shadow_card(im, CARD_BOX)
    if book:
        im.paste(book.img, (book.ox, book.oy))
    elif sc['show'] == 'title':
        x, y = CARD_BOX[0] + 90, CARD_BOX[1] + 300
        d.text((x, y), L.get('unit', '공통수학2'), font=font(40), fill=SOFT)
        d.text((x, y + 60), L['title'], font=font(110, True), fill=INK)
        d.rectangle((x + 4, y + 220, x + 150, y + 230), fill=BRICK)
    elif sc['show'] == 'examples':
        x0, y0 = CARD_BOX[0] + 60, CARD_BOX[1] + 50
        d.text((x0, y0), '이어서 풀 필수예제', font=font(44, True), fill=BRICK)
        for k, t in enumerate(L['examples']):
            y = y0 + 100 + k * 118
            d.rounded_rectangle((x0, y, CARD_BOX[2] - 60, y + 96), 18, fill=(251, 246, 240), outline=LINE, width=2)
            d.text((x0 + 32, y + 18), f'{k + 1:02d}', font=font(44, True), fill=BRICK)
            d.text((x0 + 130, y + 20), t, font=font(42), fill=INK)
    # 오른쪽 칸: 단계 칩 · 말풍선 · 수지
    R0, RW = 1524, 372
    cf = font(28, True); lines = wrap(d, sc['step'], cf, RW - 44)[:3]
    ch = 40 * len(lines) + 28
    d.rounded_rectangle((R0, 132, R0 + RW, 132 + ch), 20, fill=BRICK)
    for k, ln in enumerate(lines):
        d.text((R0 + 22, 144 + k * 40), ln, font=cf, fill=CARD)
    bf = font(34, True); bl = wrap(d, sc['bubble'], bf, RW - 52)[:4]
    by0 = 132 + ch + 24; bh = 50 * len(bl) + 40
    d.rounded_rectangle((R0, by0, R0 + RW, by0 + bh), 26, fill=CARD, outline=LINE, width=3)
    d.polygon([(R0 + 230, by0 + bh - 2), (R0 + 280, by0 + bh - 2), (R0 + 270, by0 + bh + 36)], fill=CARD)
    d.line([(R0 + 230, by0 + bh), (R0 + 270, by0 + bh + 36), (R0 + 280, by0 + bh)], fill=LINE, width=3)
    for k, ln in enumerate(bl):
        d.text((R0 + 26, by0 + 20 + k * 50), ln, font=bf, fill=INK)
    f = os.path.join(HERE, 'suji', ('cheer' if sc.get('pose') == 'cheer' else mouth) + '.png')
    sj = Image.open(f).convert('RGBA'); sj = sj.crop(sj.getbbox())
    th = min(560, H - (by0 + bh + 44))
    s = th / sj.height; sj = sj.resize((int(sj.width * s), th), Image.LANCZOS)
    im.paste(sj, (R0 + RW // 2 - sj.width // 2 + 10, H - th), sj)
    return im


# ───────────────────────── 필기 ─────────────────────────
def find_rect(m, page, yr=None):
    """필기 자리(PDF 좌표). rect 를 주면 그대로, find 면 찾아서 nth 번째 묶음.
    yr=(y0, y1) 를 주면 그 토막 안에서 찾은 것만 센다(nth 는 토막 안 순번). 검사(validate.py)도 이걸 쓴다."""
    if 'rect' in m:
        return tuple(m['rect'])
    hits = page.search_for(m['find'])
    if not hits:
        return None
    # 한 번 찾은 것이 여러 조각(분수·루트)으로 나온다 → 줄 단위로 묶는다.
    # 루트 기호처럼 세로로 긴 조각은 위아래 줄까지 덮으니 가로 폭에만 쓴다
    groups = []
    for r in hits:
        r = pymupdf.Rect(r)
        if r.height > 16 or r.width < 1:
            if groups and r.x0 - groups[-1].x1 < 4:
                groups[-1].x1 = max(groups[-1].x1, r.x1)
            continue
        if groups and r.x0 - groups[-1].x1 < 6 and abs(r.y1 - groups[-1].y1) < 8:
            groups[-1] |= r
        else:
            groups.append(r)
    if yr:
        groups = [g for g in groups if yr[0] - 2 <= g.y0 and g.y1 <= yr[1] + 2]
    if not groups:
        return None
    return tuple(groups[min(m.get('nth', 0), len(groups) - 1)])


def mark_geom(m, page, book):
    g = find_rect(m, page, (book.part['y0'], book.part['y1']))
    if g is None:
        raise SystemExit(f"교재에서 못 찾음: {m.get('find')}")
    x0, y0, x1, y1 = g
    pad = m.get('pad', 3)
    a = book.to_screen(x0 - pad, y0 - pad); b = book.to_screen(x1 + pad, y1 + pad)
    return a[0], a[1], b[0], b[1]


def wobble(pts, seed, amp=1.6):
    r = random.Random(seed)
    return [(x + r.uniform(-amp, amp), y + r.uniform(-amp, amp)) for x, y in pts]


def partial(pts, p):
    if p >= 1: return pts
    seg = [math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]
    tot = sum(seg) * p; out = [pts[0]]
    for i, s in enumerate(seg):
        if tot >= s: out.append(pts[i + 1]); tot -= s
        else:
            t = tot / s if s else 0
            out.append((pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t)); break
    return out


def draw_mark(layer, m, g, p, seed, scale=1.4):
    """scale = 교재 확대 배율 — 필기 굵기·글씨 크기가 교재 글씨를 따라간다"""
    d = ImageDraw.Draw(layer)
    x0, y0, x1, y1 = g; w = max(4, int(4.3 * scale))
    if m['type'] == 'underline':
        pts = wobble([(x0 + (x1 - x0) * t / 12, y1 + 4 + math.sin(t) * 1.2) for t in range(13)], seed)
        q = partial(pts, p); d.line(q, fill=PEN + (235,), width=w, joint='curve'); return q[-1]
    elif m['type'] == 'highlight':
        xe = x0 + (x1 - x0) * min(1, p)
        d.rectangle((x0, y0 + (y1 - y0) * 0.15, xe, y1), fill=HL + (110,)); return (xe, y1)
    elif m['type'] in ('box', 'circle'):
        if m['type'] == 'box':
            P = [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0 + 12, y0 - 4)]
            pts = []
            for i in range(4):
                for t in range(8):
                    a, b = P[i], P[i + 1]
                    pts.append((a[0] + (b[0] - a[0]) * t / 8, a[1] + (b[1] - a[1]) * t / 8))
            pts.append(P[4])
        else:
            cx, cy, rx, ry = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2 + 14, (y1 - y0) / 2 + 12
            pts = [(cx + rx * math.cos(-2.2 + 2 * math.pi * 1.08 * t / 40), cy + ry * math.sin(-2.2 + 2 * math.pi * 1.08 * t / 40)) for t in range(41)]
        q = partial(wobble(pts, seed), p); d.line(q, fill=PEN + (235,), width=w, joint='curve'); return q[-1]
    elif m['type'] in ('note', 'arrow'):
        txt = m.get('text', '').replace('−', '-')   # 긴 빼기표(−)는 두 글꼴 모두 없어서 네모로 나온다
        fs = m.get('size') or int(max(24, min(44, 29 * scale))); f = penfont(fs)
        at = m.get('at', 'right')
        tw = sum(d.textlength(SUP[c], font=penfont(int(fs * 0.6))) if c in SUP else d.textlength(c, font=f if has_glyph(f, c) else font(int(fs * 0.9), True)) for c in txt)
        if at == 'right': tx, ty = x1 + 40, (y0 + y1) / 2 - fs * 0.7
        elif at == 'below': tx, ty = x0, y1 + 14
        elif at == 'above': tx, ty = x0, y0 - fs * 1.5
        else: tx, ty = x0 - tw - 40, (y0 + y1) / 2 - fs * 0.7
        if tx + tw > CARD_BOX[2] - 20:          # 카드 밖으로 나가면 아래에 쓴다
            tx, ty = min(x0, CARD_BOX[2] - tw - 20), y1 + 10
        if m['type'] == 'arrow':
            ax0, ay = x1 + 6, (y0 + y1) / 2
            d.line(partial(wobble([(ax0, ay), (tx - 8, ty + fs * 0.7)], seed, 0.8), min(1, p * 3)), fill=PEN + (235,), width=4)
        # 글자를 왼쪽부터 조금씩 드러내서 손으로 쓰는 것처럼 (지금 쓰는 글자는 일부만 보인다)
        q = max(0, min(1, (p - 0.15) / 0.85)) * len(txt)
        x = tx; tip = (tx, ty + fs)
        for i, ch in enumerate(txt):
            if i >= q: break
            if ch in SUP:                        # ² ³ 는 작게 위로
                ff = penfont(int(fs * 0.6)); ch = SUP[ch]; yy = ty - fs * 0.12
            else:
                ff = f if has_glyph(f, ch) else font(int(fs * 0.9), True)
                yy = ty + (0 if ff is f else fs * 0.18)
            cw = d.textlength(ch, font=ff)
            frac = min(1, q - i)
            if frac >= 1:
                d.text((x, yy), ch, font=ff, fill=PEN + (255,))
            else:
                g1 = Image.new('RGBA', (int(cw) + 8, int(fs * 2)), (0, 0, 0, 0))
                ImageDraw.Draw(g1).text((0, 0), ch, font=ff, fill=PEN + (255,))
                g1 = g1.crop((0, 0, max(1, int((cw + 4) * frac)), g1.height))
                layer.alpha_composite(g1, (int(x), int(yy)))
            tip = (x + cw * frac, yy + fs * (0.55 + 0.35 * math.sin(frac * 7)))
            x += cw
        return tip if txt else None


_PENCIL = None
def pencil():
    """연필 그림 (끝이 왼쪽 아래를 향하게 기울임) 과 그림 안에서의 연필심 위치"""
    global _PENCIL
    if _PENCIL: return _PENCIL
    L_, T_ = 300, 34
    im = Image.new('RGBA', (L_ + 20, T_ + 20), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    oy = 10
    d.polygon([(10, oy + T_ / 2), (52, oy), (52, oy + T_)], fill=(232, 196, 150))           # 깎은 나무
    d.polygon([(10, oy + T_ / 2), (24, oy + T_ / 2 - 5), (24, oy + T_ / 2 + 5)], fill=(60, 50, 50))  # 연필심
    d.rectangle((52, oy, L_ - 40, oy + T_), fill=(247, 196, 40))                            # 노란 몸통
    d.rectangle((52, oy + T_ * 0.36, L_ - 40, oy + T_ * 0.64), fill=(236, 178, 20))
    d.rectangle((L_ - 40, oy - 1, L_ - 22, oy + T_ + 1), fill=(190, 190, 196))                # 쇠
    d.rounded_rectangle((L_ - 24, oy, L_ + 2, oy + T_), 8, fill=(240, 140, 150))              # 지우개
    ang = 38
    r = im.rotate(ang, resample=Image.BICUBIC, expand=True)
    sh = r.split()[-1].point(lambda v: v * 0.25).filter(ImageFilter.GaussianBlur(5))
    out = Image.new('RGBA', (r.width + 20, r.height + 20), (0, 0, 0, 0))
    out.paste((40, 30, 20, 255), (14, 16), sh); out.alpha_composite(r, (0, 0))
    # 연필심 (10, oy+T_/2) 이 회전 뒤 어디로 갔나
    cx, cy = im.width / 2, im.height / 2; a = math.radians(ang)
    px, py = 10 - cx, oy + T_ / 2 - cy
    tx = px * math.cos(a) + py * math.sin(a) + r.width / 2
    ty = -px * math.sin(a) + py * math.cos(a) + r.height / 2
    _PENCIL = (out, (tx, ty)); return _PENCIL


def ease(p):
    p = max(0.0, min(1.0, p)); return 1 - (1 - p) ** 2


# ───────────────────────── 만들기 ─────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('lesson'); ap.add_argument('--pdf', required=True); ap.add_argument('--cuts', required=True)
    ap.add_argument('--out', required=True); ap.add_argument('--model', default='eleven_multilingual_v2')
    ap.add_argument('--voice', default='mbwQpKqHamJOPuXJoCPc'); ap.add_argument('--cache', default=None)
    ap.add_argument('--stability', type=float, default=0.6)
    a = ap.parse_args()
    L = json.load(open(a.lesson, encoding='utf-8'))
    cuts = {c['file'].split('/')[-1][:-4]: c for c in json.load(open(os.path.join(a.cuts, '..', 'cuts.json'), encoding='utf-8'))[L['no'] - 1]['cuts']} \
        if os.path.exists(os.path.join(a.cuts, '..', 'cuts.json')) else {}
    doc = pymupdf.open(a.pdf)
    cache = a.cache or os.path.join(os.path.dirname(a.out), 'tts_cache')
    says = [s['say'] for s in L['scenes']]
    tmp = a.out + '.parts'; os.makedirs(tmp, exist_ok=True)
    segs = []; timeline = []; t_acc = 0.0
    for k, sc in enumerate(L['scenes']):
        mp3, al = synth_scene(says[k], a.voice, a.model, cache,
                              plain(says[k - 1]) if k else '', plain(says[k + 1]) if k + 1 < len(says) else '',
                              os.path.join(tmp, f's{k + 1:02d}.wav'))
        x = pcm(mp3); dur = len(x) / 16000 + GAP; n = int(math.ceil(dur * FPS))
        book = None
        if sc['show'].startswith('cut_'):
            part = cuts[sc['show']]['parts'][0]
            book = Book(os.path.join(a.cuts, sc['show'] + '.png'), part, sc.get('clip'))
            page = doc[part['page'] - 1]
        bases = {m: base_frame(L, sc, book, m) for m in (['closed'] if sc.get('pose') == 'cheer' else ['closed', 'half', 'open', 'blink'])}
        marks = []; last_cue = 0.0
        for i, m in enumerate(sc.get('marks', [])):
            t0 = cue_time(al, says[k], m['cue'], last_cue) + m.get('delay', 0); last_cue = t0 - m.get('delay', 0)
            dur_m = m.get('dur', 0.6 if m['type'] != 'note' else 0.4 + 0.07 * len(m.get('text', '')))
            marks.append((m, mark_geom(m, page, book) if book else (0, 0, 0, 0), t0, dur_m, 1000 * k + i))
        seq = mouth_track(x, n)
        if sc.get('pose') == 'cheer': seq = ['closed'] * n
        seg = os.path.join(tmp, f's{k + 1:02d}.mp4')
        ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
                               '-i', '-', '-i', mp3, '-af', f'apad=whole_dur={n / FPS:.4f}', '-t', f'{n / FPS:.4f}',
                               '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
                               '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', seg], stdin=subprocess.PIPE)
        # 빠르게: 다 그린 필기는 한 장(static)에 굳히고, 입 모양별 바탕+굳힌 필기를 캐시한다.
        # 그리는 중인 필기·연필만 매 프레임 새로 그린다. 바뀐 게 없으면 앞 프레임 바이트를 그대로 쓴다.
        scale = book.s if book else 1.4
        static = Image.new('RGBA', (W, H), (0, 0, 0, 0)); static_ids = set(); comp = {}
        prev_key, prev_bytes = None, None
        for f in range(n):
            t = f / FPS
            live, tip = [], None
            for j, (m, g, t0, dm, seed) in enumerate(marks):
                if t < t0: continue
                e = (t - t0) / dm
                if e >= 1.12:
                    if j not in static_ids:
                        draw_mark(static, m, g, 1.0, seed, scale); static_ids.add(j); comp.clear()
                else:
                    live.append((j, m, g, e, seed))
            key = (seq[f], len(static_ids), tuple((j, round(e, 3)) for j, _, _, e, _ in live))
            if key == prev_key:
                ff.stdin.write(prev_bytes); continue
            ck = (seq[f], len(static_ids))
            if ck not in comp:
                c0 = bases[seq[f]].convert('RGBA'); c0.alpha_composite(static); comp[ck] = c0
            fr = comp[ck]
            if live:
                fr = fr.copy(); layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
                for j, m, g, e, seed in live:
                    at_ = draw_mark(layer, m, g, ease(e), seed, scale)
                    if at_: tip = at_                    # 쓰는 동안(+조금 뒤까지) 연필이 펜 끝에
                fr.alpha_composite(layer)
                if tip:
                    pi, (ox, oy) = pencil()
                    if tip[0] - ox >= 0 and tip[1] - oy >= 0:
                        fr.alpha_composite(pi, (int(tip[0] - ox), int(tip[1] - oy)))
            prev_key, prev_bytes = key, fr.convert('RGB').tobytes()
            ff.stdin.write(prev_bytes)
        ff.stdin.close(); ff.wait(); segs.append(seg)
        ct = cuts.get(sc['show'], {})
        timeline.append(dict(scene=k + 1, start=round(t_acc, 3), end=round(t_acc + n / FPS, 3),
                             show=sc['show'], kind=ct.get('kind', sc['show']), book_head=ct.get('head'),
                             page=ct.get('parts', [{}])[0].get('page'), clip=sc.get('clip'),
                             step=sc['step'], bubble=sc['bubble'],
                             marks=[dict(at=round(t_acc + t0, 3), type=m['type'], cue=m['cue'], text=m.get('text'))
                                    for m, g, t0, dm, seed in marks]))
        t_acc += n / FPS
        print(f'장면 {k + 1}: {n / FPS:.1f}초, 필기 {len(marks)}개', flush=True)
    lst = os.path.join(tmp, 'all.txt')
    open(lst, 'w', encoding='utf-8').write(''.join(f"file '{s.replace(os.sep, '/')}'\n" for s in segs))
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', '-movflags', '+faststart', a.out], check=True)
    # 장면별 구간 — 학생 시청 기록(어느 구간을 다시 봤나·멈췄나)을 개념·토막·유형과 잇는 열쇠
    seg_info = dict(no=L['no'], title=L['title'], file=L.get('file'), chapter=L.get('chapter'),
                    sub_chapter=L.get('sub_chapter'), book=L.get('book'), pages=L.get('pages'),
                    duration=round(t_acc, 3), voice=a.voice, model=a.model, fps=FPS,
                    examples=L.get('example_codes') or L.get('examples'), scenes=timeline)
    json.dump(seg_info, open(os.path.splitext(a.out)[0] + '.구간.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    import shutil; shutil.rmtree(tmp, ignore_errors=True)       # 장면 조각·wav 는 다 쓰면 지운다
    print('ok', a.out, f'{t_acc / 60:.1f}분')


if __name__ == '__main__':
    main()
