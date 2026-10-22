"""세로 홍보 쇼츠(1080×1920) — 원장님 목소리 + 수지 캐릭터 + 큰 제목 + 자막 + 장면별 그림

  python scripts/lesson-video/promo_short.py docs/대본/홍보/윤쌤_홍보쇼츠.json --videos "<강의영상 폴더>" --out "<쇼츠.mp4>" [--cache <음성 캐시>]

장면 종류(kind): hello 인사 카드 · flow 학원→집 카드 · clips 강의 영상 맛보기 · call 이름 부르기+대답 버튼 ·
               check 확인 목록 · end 마무리. 바탕은 공통수학 연두 파스텔(썸네일과 같은 계열), 글씨는 수지쌤 벽돌·남색.
"""
import argparse, glob, json, math, os, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lesson_video import synth_scene, plain, pcm, mouth_track, cue_time, font, wrap, HERE, FPS
import suji_pose

W, H = 1080, 1920
BG, GRID = (226, 246, 233), (210, 236, 219)
INK, GREEN, BRICK, CARD, LINE, SOFT = (24, 40, 30), (22, 72, 40), (176, 74, 40), (255, 255, 255), (214, 230, 219), (92, 110, 98)
HEAD = 'C:/Windows/Fonts/BlackHanSans-Regular.ttf'
GAP = 0.35
CLIPS = {'concept': '07_개념_*.mp4', 'proof': '01_증명1_*.mp4', 'solution': '풀이영상/01_풀이01_*.mp4'}


def hfont(sz): return ImageFont.truetype(HEAD, sz) if os.path.exists(HEAD) else font(sz, True)
def ease(p): p = max(0.0, min(1.0, p)); return 1 - (1 - p) ** 3


def background(badge):
    im = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(im)
    for x in range(0, W, 54): d.line([(x, 0), (x, H)], fill=GRID, width=2)
    for y in range(0, H, 54): d.line([(0, y), (W, y)], fill=GRID, width=2)
    f = font(34, True); tw = d.textlength(badge, font=f)
    d.rounded_rectangle(((W - tw) / 2 - 30, 64, (W + tw) / 2 + 30, 124), 30, fill=GREEN)
    d.text((W / 2, 94), badge, font=f, fill=CARD, anchor='mm')
    return im


def card(im, box, r=34, fill=CARD):
    sh = Image.new('L', (W, H), 0); ImageDraw.Draw(sh).rounded_rectangle((box[0], box[1] + 10, box[2], box[3] + 10), r, fill=70)
    im.paste((120, 150, 130), (0, 0), sh.filter(ImageFilter.GaussianBlur(14)))
    ImageDraw.Draw(im).rounded_rectangle(box, r, fill=fill, outline=LINE, width=3)


def fade(base, layer, a):
    """layer(RGBA)를 투명도 a 로 얹는다"""
    if a <= 0: return
    if a < 1:
        al = layer.split()[-1].point(lambda v: int(v * a)); layer = layer.copy(); layer.putalpha(al)
    base.alpha_composite(layer)


def head(d, text):
    f = hfont(96); lines = text.split('\n'); y = 190
    for ln in lines:
        d.text((W / 2, y), ln, font=f, fill=INK, anchor='mt'); y += 116


def scene_static(sc, badge):
    im = background(badge).convert('RGBA'); d = ImageDraw.Draw(im); head(d, sc['head'])
    return im


def vis_layer():
    return Image.new('RGBA', (W, H), (0, 0, 0, 0))


def draw_visual(sc, p, t, frames):
    """장면별 그림(가운데 칸 y 480~1290). p = 장면 진행 0~1, t = 장면 안 초"""
    L = vis_layer(); d = ImageDraw.Draw(L)
    k = sc['kind']
    if k == 'hello':
        a = ease(t / 0.5)
        box = (110, 560 + int(30 * (1 - a)), 970, 1060 + int(30 * (1 - a)))
        c = vis_layer(); card(c, box); dc = ImageDraw.Draw(c)
        dc.text((W / 2, box[1] + 150), '수학의지혜', font=hfont(130), fill=BRICK, anchor='mm')
        dc.text((W / 2, box[1] + 300), 'AI 선생님 윤쌤', font=font(62, True), fill=GREEN, anchor='mm')
        dc.text((W / 2, box[1] + 400), '이름을 불러 주는 복습 선생님', font=font(44), fill=SOFT, anchor='mm')
        fade(L, c, a)
    elif k == 'flow':
        for i, (tag, txt) in enumerate(sc['cards']):
            a = ease((p - 0.05 - 0.4 * i) / 0.12)
            y0 = 540 + i * 380
            c = vis_layer(); card(c, (120, y0, 960, y0 + 250)); dc = ImageDraw.Draw(c)
            dc.rounded_rectangle((160, y0 + 40, 160 + dc.textlength(tag, font=font(40, True)) + 40, y0 + 100), 24, fill=GREEN if i else SOFT)
            dc.text((180, y0 + 70), tag, font=font(40, True), fill=CARD, anchor='lm')
            dc.text((180, y0 + 175), txt, font=hfont(76), fill=INK if i == 0 else BRICK, anchor='lm')
            fade(L, c, a)
        a = ease((p - 0.3) / 0.12)
        if a > 0:
            dd = ImageDraw.Draw(L); x = W / 2; y0, y1 = 805, 905
            dd.line([(x, y0), (x, y0 + (y1 - y0) * a)], fill=BRICK, width=12)
            if a > 0.9: dd.polygon([(x - 34, y1 - 20), (x + 34, y1 - 20), (x, y1 + 26)], fill=BRICK)
    elif k == 'clips':
        n = len(sc['clips']); i = min(n - 1, int(p * n)); lab = sc['clips'][i][0]
        fr = frames[i][min(len(frames[i]) - 1, int((p * n - i) * len(frames[i])))]
        c = vis_layer(); card(c, (50, 560, 1030, 1150), r=28)
        c.paste(fr, (70, 580)); dc = ImageDraw.Draw(c)
        tw = dc.textlength(lab, font=font(44, True))
        dc.rounded_rectangle((W / 2 - tw / 2 - 34, 480, W / 2 + tw / 2 + 34, 552), 34, fill=BRICK)
        dc.text((W / 2, 516), lab, font=font(44, True), fill=CARD, anchor='mm')
        L.alpha_composite(c)
    elif k == 'call':
        c = vis_layer(); card(c, (70, 520, 1010, 1180), r=40); c.paste(frames[0][0], (90, 540))
        L.alpha_composite(c)
        a = ease((p - 0.08) / 0.12)
        if a > 0:                                           # 이름 부르는 말풍선
            b = vis_layer(); db = ImageDraw.Draw(b); f = font(46, True); tw = db.textlength(sc['bubble'], font=f)
            db.rounded_rectangle((190, 920, 190 + tw + 60, 1010), 30, fill=(255, 255, 255, 245), outline=LINE, width=2)
            db.text((220, 965), sc['bubble'], font=f, fill=INK, anchor='lm')
            av = Image.open(suji_pose.image('point', 'closed')).convert('RGBA'); av = av.crop((330, 30, 960, 660)).resize((96, 96))
            m = Image.new('L', (96, 96), 0); ImageDraw.Draw(m).ellipse((0, 0, 95, 95), fill=255)
            ring = Image.new('RGBA', (106, 106), (0, 0, 0, 0)); ImageDraw.Draw(ring).ellipse((0, 0, 105, 105), fill=CARD)
            b.alpha_composite(ring, (82, 910)); b.paste(av, (87, 915), m)
            fade(L, b, a)
        a2 = ease((p - 0.35) / 0.1)
        if a2 > 0:                                          # 대답 버튼 — 75% 쯤 눌린다
            pressed = p > 0.72
            bt = vis_layer(); dbt = ImageDraw.Draw(bt); f = font(50, True); txt = sc['button'] + ('  ✓' if pressed else '')
            tw = dbt.textlength(txt, font=f)
            dbt.rounded_rectangle((W / 2 - tw / 2 - 60, 1060, W / 2 + tw / 2 + 60, 1150), 26, fill=(GREEN if pressed else BRICK))
            dbt.text((W / 2, 1105), txt, font=f, fill=CARD, anchor='mm')
            if 0.66 < p < 0.8:                              # 손가락으로 누른 동그라미 물결
                r = 30 + 160 * (p - 0.66) / 0.14
                dbt.ellipse((W / 2 - r, 1105 - r, W / 2 + r, 1105 + r), outline=(255, 255, 255, int(220 * (1 - (p - 0.66) / 0.14))), width=8)
            fade(L, bt, a2)
    elif k == 'check':
        for i, (lab, val) in enumerate(sc['items']):
            a = ease((p - 0.08 - 0.22 * i) / 0.1)
            y0 = 560 + i * 220
            c = vis_layer(); card(c, (90, y0, 990, y0 + 180), r=30); dc = ImageDraw.Draw(c)
            dc.rounded_rectangle((130, y0 + 50, 210, y0 + 130), 18, fill=GREEN)
            if a > 0.6:                                     # 체크 표시를 손으로 긋듯
                q = min(1, (a - 0.6) / 0.4); pts = [(148, y0 + 92), (165, y0 + 112), (194, y0 + 68)]
                seg = pts[:2] if q < 0.5 else pts
                dc.line(seg, fill=CARD, width=12, joint='curve')
            dc.text((240, y0 + 90), lab, font=font(52, True), fill=INK, anchor='lm')
            dc.text((950, y0 + 90), val, font=hfont(64), fill=BRICK, anchor='rm')
            fade(L, c, a)
    elif k == 'end':
        a = ease(t / 0.6)
        c = vis_layer(); card(c, (110, 600, 970, 1080)); dc = ImageDraw.Draw(c)
        dc.text((W / 2, 760), '수학의지혜', font=hfont(140), fill=BRICK, anchor='mm')
        dc.text((W / 2, 900), 'AI 선생님 윤쌤과 함께', font=font(56, True), fill=GREEN, anchor='mm')
        dc.text((W / 2, 990), '스터디체크', font=font(44), fill=SOFT, anchor='mm')
        fade(L, c, a)
    return L


def subtitle(d, text):
    # 수지 왼쪽 칸에 — 수지보다 나중에 그려서 글자가 가리지 않게
    f = font(44, True); lines = wrap(d, text, f, 500)[:5]
    h = 62 * len(lines) + 46; y0 = 1880 - h
    d.rounded_rectangle((30, y0, 590, y0 + h), 30, fill=(255, 255, 255, 240), outline=LINE, width=3)
    for i, ln in enumerate(lines): d.text((60, y0 + 26 + i * 62), ln, font=f, fill=INK)


_SJ = {}
def suji(pose, mouth):
    k = (pose, mouth)
    if k not in _SJ:
        sj = Image.open(suji_pose.image(pose, mouth)).convert('RGBA'); sj = sj.crop(sj.getbbox())
        th = 640; _SJ[k] = sj.resize((int(sj.width * th / sj.height), th), Image.LANCZOS)
    return _SJ[k]


def grab(videos, kind, start, dur, tmp):
    f = glob.glob(os.path.join(videos, CLIPS[kind]))[0]
    out = os.path.join(tmp, kind); os.makedirs(out, exist_ok=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(start), '-t', f'{dur:.2f}', '-i', f, '-vf', 'scale=940:-1,fps=30',
                    os.path.join(out, '%04d.png')], check=True)
    return [Image.open(p).convert('RGB') for p in sorted(glob.glob(os.path.join(out, '*.png')))]


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('script'); ap.add_argument('--videos', required=True)
    ap.add_argument('--out', required=True); ap.add_argument('--cache', default=None)
    ap.add_argument('--voice', default='mbwQpKqHamJOPuXJoCPc'); ap.add_argument('--model', default='eleven_multilingual_v2')
    a = ap.parse_args()
    P = json.load(open(a.script, encoding='utf-8')); S = P['scenes']
    cache = a.cache or os.path.join(os.path.dirname(a.out), 'tts_cache')
    tmp = tempfile.mkdtemp(); sr = 16000
    says = [s['say'] for s in S]; audio, offs, lens, als = [], [], [], []; t = 0.0
    for k, sc in enumerate(S):
        wav, al = synth_scene(sc['say'], a.voice, a.model, cache, plain(says[k - 1]) if k else '',
                              plain(says[k + 1]) if k + 1 < len(S) else '', os.path.join(tmp, f'{k}.wav'))
        x = pcm(wav); offs.append(t); lens.append(len(x) / sr + GAP); als.append(al)
        audio += [x, np.zeros(int(GAP * sr), np.float32)]; t += len(x) / sr + GAP
    total = t + 0.6; n = int(math.ceil(total * FPS))
    y = np.concatenate(audio + [np.zeros(int(0.6 * sr), np.float32)]); full = os.path.join(tmp, 'all.wav')
    import wave
    with wave.open(full, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes())
    mouths = mouth_track(y, n)
    # 자막: 장면 대본을 // 마다 끊어, 그 말이 시작하는 시각부터 띄운다
    subs = []
    for k, sc in enumerate(S):
        last = 0.0
        for ph in [x.strip() for x in sc['say'].split('//') if x.strip()]:
            tt = cue_time(als[k], ph, plain(ph)[:6], last); last = tt; subs.append((offs[k] + tt, plain(ph)))
    frames = {}
    for k, sc in enumerate(S):
        if sc['kind'] == 'clips':
            per = lens[k] / len(sc['clips'])
            frames[k] = [grab(a.videos, kind, st, per + 0.2, tmp) for _, kind, st in sc['clips']]
        if sc['kind'] == 'call':
            frames[k] = [grab(a.videos, 'solution', 18, 0.1, tmp)[:1]]
    statics = [scene_static(sc, P['badge']) for sc in S]
    ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-i', full, '-t', f'{n / FPS:.3f}', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
                           '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-movflags', '+faststart', a.out], stdin=subprocess.PIPE)
    for f in range(n):
        tt = f / FPS; k = max(i for i in range(len(S)) if offs[i] <= tt + 1e-6); sc = S[k]
        ts = tt - offs[k]; p = min(1.0, ts / lens[k])
        fr = statics[k].copy()
        fr.alpha_composite(draw_visual(sc, p, ts, frames.get(k)))
        pose = sc.get('pose', 'point'); talk = suji_pose.talks(pose)
        sj = suji(pose, mouths[f] if talk else 'closed')
        bob = 0 if talk else int(abs(math.sin(tt * 6)) * 8)
        fr.alpha_composite(sj, (W - sj.width + 80, H - sj.height + 10 - bob))
        sub = [s for s in subs if s[0] <= tt + 0.05]
        if sub: subtitle(ImageDraw.Draw(fr), sub[-1][1])
        ff.stdin.write(fr.convert('RGB').tobytes())
    ff.stdin.close(); ff.wait()
    print('ok', a.out, f'{total:.1f}초')


if __name__ == '__main__':
    main()
