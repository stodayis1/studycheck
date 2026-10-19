"""증명 영상 — 모눈 노트에 증명을 한 줄씩 손으로 써 내려가는 영상 (1920x1080, 30fps)

  python scripts/lesson-video/proof_video.py <증명 대본.json> --out <out.mp4> --cuts <토막 폴더> [--cache <음성 캐시>]

대본 형식 (docs/대본/공통수학2/증명/*.json)
  { "id": "증명_01", "title": "...", "concept_no": 27, "chapter": "...", "sub_chapter": "...", "book_page": 166,
    "figure": {"image": "cut_04.png 경로(선택)", "crop": [x0,y0,x1,y1] (그림 픽셀)},     ← 그림이 필요한 증명만
    "steps": [ {"pose": "A|B|C|D|E", "bubble": "...", "say": "... (lesson_video 와 같은 표시 / // {강조 …})",
                "newpage": false,
                "write": [ {"cue": "말 안의 글자", "tex": "손으로 쓸 줄 — $수식$ 과 한글 섞어서",
                            "color": "ink|red|blue", "indent": 0, "box": false, "underline": false} ] } ] }
수지 자세: A 가리키기(입 움직임) · B 이것만 기억 · C 갸웃 · D 지시봉 · E 화이팅 — A 말고는 말소리에 맞춰 몸이 살짝 들썩인다.
"""
import argparse, json, math, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import matplotlib; matplotlib.use('Agg')
from matplotlib import font_manager as fm, pyplot as plt, rcParams

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lesson_video import (synth_scene, cue_time, plain, pcm, mouth_track, pencil, font, penfont, wrap,
                          W, H, FPS, BG, INK, SOFT, BRICK, CARD, LINE, PEN, HERE)

GAP = 0.4
COLORS = {'ink': (29, 43, 107), 'red': (215, 54, 44), 'blue': (47, 111, 176)}
NOTE = (40, 118, 1450, 1050)                 # 노트 한 장
PAPER = (253, 252, 247); GRID = (226, 233, 240); MARGIN = (240, 170, 170)
POSE_FILE = {'A': None, 'B': 'pose_B_remember.png', 'C': 'pose_C_wonder.png', 'D': 'pose_D_pointer.png', 'E': 'pose_E_cheer.png'}

_PEN = os.path.join(HERE, 'fonts', 'NanumPenScript-Regular.ttf')
fm.fontManager.addfont(_PEN); _PN = fm.FontProperties(fname=_PEN).get_name()
# 수식 안 대문자는 손글씨 글꼴에서 소문자처럼 보인다(P·p, X·x, I·l) → 대문자만 Comic Sans 로 (원장님 피드백 2026-10-19)
_CAPS = 'C:/Windows/Fonts/comic.ttf'
_CN = _PN
if os.path.exists(_CAPS):
    fm.fontManager.addfont(_CAPS); _CN = fm.FontProperties(fname=_CAPS).get_name()
rcParams.update({'mathtext.fontset': 'custom', 'mathtext.rm': _PN, 'mathtext.it': _PN, 'mathtext.bf': _PN,
                 'mathtext.sf': _CN, 'font.family': _PN})


def caps(tex):
    r"""$…$ 안의 대문자를 \mathsf{} 로 감싼다 (\geq 같은 명령어 이름은 그대로)"""
    import re
    def fix(m):
        body, out, i = m.group(1), [], 0
        while i < len(body):
            ch = body[i]
            if ch == BS:
                j = i + 1
                while j < len(body) and body[j].isalpha(): j += 1
                out.append(body[i:j]); i = j; continue
            out.append(BS + 'mathsf{' + ch + '}' if 'A' <= ch <= 'Z' else ch); i += 1
        return '$' + ''.join(out) + '$'
    return re.sub(r'[$]([^$]*)[$]', fix, tex)


BS = chr(92)
import logging; logging.getLogger('matplotlib.mathtext').setLevel(logging.ERROR)


def render_line(tex, color, size=46):
    """손글씨 글꼴로 한 줄(한글+수식)을 그려 RGBA 그림으로 (여백 없이)"""
    fig = plt.figure(figsize=(14, 2), dpi=100); fig.patch.set_alpha(0)
    fig.text(0.0, 0.5, caps(tex), fontsize=size, color=tuple(c / 255 for c in color), va='center')
    fig.canvas.draw()
    im = Image.frombuffer('RGBA', fig.canvas.get_width_height(), bytes(fig.canvas.buffer_rgba()))
    plt.close(fig)
    a = np.asarray(im)[..., 3]
    ys, xs = np.where(a > 8)
    return im.crop((max(0, xs.min() - 4), max(0, ys.min() - 4), xs.max() + 6, ys.max() + 6)) if len(xs) else im.crop((0, 0, 4, 4))


def paper():
    im = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(im)
    x0, y0, x1, y1 = NOTE
    sh = Image.new('L', (W, H), 0); ImageDraw.Draw(sh).rounded_rectangle(NOTE, 18, fill=70)
    im.paste((150, 120, 100), (0, 0), sh.filter(ImageFilter.GaussianBlur(14)).point(lambda v: v // 3))
    d.rounded_rectangle(NOTE, 18, fill=PAPER, outline=LINE, width=2)
    for x in range(x0 + 30, x1 - 10, 34): d.line([(x, y0 + 8), (x, y1 - 8)], fill=GRID, width=1)
    for y in range(y0 + 30, y1 - 10, 34): d.line([(x0 + 8, y), (x1 - 8, y)], fill=GRID, width=1)
    d.line([(x0 + 96, y0 + 6), (x0 + 96, y1 - 6)], fill=MARGIN, width=2)
    return im


def right_panel(im, P, step):
    d = ImageDraw.Draw(im)
    d.text((44, 30), f"증명  {P['title']}", font=font(40, True), fill=INK)
    tw = d.textlength(f"증명  {P['title']}", font=font(40, True))
    d.text((44 + tw + 22, 46), f"공통수학2 · {P['sub_chapter']}", font=font(22), fill=SOFT)
    R0, RW = 1484, 410
    bf = font(32, True); bl = wrap(d, step['bubble'], bf, RW - 50)[:4]
    by0 = 120; bh = 48 * len(bl) + 38
    d.rounded_rectangle((R0, by0, R0 + RW, by0 + bh), 26, fill=CARD, outline=LINE, width=3)
    d.polygon([(R0 + 250, by0 + bh - 2), (R0 + 300, by0 + bh - 2), (R0 + 290, by0 + bh + 34)], fill=CARD)
    d.line([(R0 + 250, by0 + bh), (R0 + 290, by0 + bh + 34), (R0 + 300, by0 + bh)], fill=LINE, width=3)
    for k, ln in enumerate(bl): d.text((R0 + 24, by0 + 18 + k * 48), ln, font=bf, fill=INK)
    return by0 + bh + 40


_SUJI = {}
def suji(pose, mouth, top):
    key = (pose, mouth, top)
    if key not in _SUJI:
        f = os.path.join(HERE, 'suji', (mouth + '.png') if pose == 'A' else POSE_FILE[pose])
        sj = Image.open(f).convert('RGBA'); sj = sj.crop(sj.getbbox())
        th = min(620, H - top); s = th / sj.height
        if pose == 'E': s *= 0.92
        _SUJI[key] = sj.resize((int(sj.width * s), int(sj.height * s)), Image.LANCZOS)
    return _SUJI[key]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('proof'); ap.add_argument('--out', required=True)
    ap.add_argument('--cache', default=None); ap.add_argument('--voice', default='mbwQpKqHamJOPuXJoCPc')
    ap.add_argument('--model', default='eleven_multilingual_v2')
    ap.add_argument('--cuts', default=None, help='교재 토막 폴더(concept_cuts.py 결과). figure.image 는 이 폴더 기준 상대 경로')
    a = ap.parse_args()
    P = json.load(open(a.proof, encoding='utf-8'))
    cache = a.cache or os.path.join(os.path.dirname(a.out), 'tts_cache')
    tmp = a.out + '.parts'; os.makedirs(tmp, exist_ok=True)
    steps = P['steps']; says = [s['say'] for s in steps]

    # 1) 음성: 단계마다 읽혀 하나로 잇는다 (단계 사이 GAP 초)
    sr = 16000; audio = []; offs = []; als = []; t = 0.0
    for k, st in enumerate(steps):
        wav, al = synth_scene(st['say'], a.voice, a.model, cache, plain(says[k - 1]) if k else '',
                              plain(says[k + 1]) if k + 1 < len(says) else '', os.path.join(tmp, f's{k + 1:02d}.wav'))
        x = pcm(wav); offs.append(t); als.append(al)
        audio.append(x); audio.append(np.zeros(int(GAP * sr), np.float32)); t += len(x) / sr + GAP
    total = t; n = int(math.ceil(total * FPS))
    y = np.concatenate(audio); full = os.path.join(tmp, 'all.wav')
    import wave
    with wave.open(full, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes())
    mouths = mouth_track(y, n)
    hop = sr / FPS
    loud = np.array([np.sqrt(np.mean(y[int(i * hop):int((i + 1) * hop)] ** 2)) if int(i * hop) < len(y) else 0 for i in range(n)])
    loud = np.convolve(loud / (np.percentile(loud[loud > 0], 90) if (loud > 0).any() else 1), np.ones(5) / 5, 'same')

    # 2) 쓸 줄들: 자리(쪽·좌표)와 시작 시각
    # 노트는 쪽을 넘기지 않고 위로 밀어 올린다(앞 줄이 계속 보이게). "newpage": true 일 때만 새 장.
    x0, y0, x1, y1 = NOTE
    VX0, VY0, VX1, VY1 = x0 + 4, y0 + 4, x1 - 4, y1 - 4        # 노트 안쪽 창
    VH = VY1 - VY0
    lines = []; page = 0; cy = 46                               # cy: 그 장 캔버스 안 y
    fig_im = None
    if P.get('figure'):
        fp = P['figure']['image']
        if not os.path.isabs(fp): fp = os.path.join(a.cuts or '.', fp)
        fg = Image.open(fp).convert('RGB')
        if P['figure'].get('crop'): fg = fg.crop(P['figure']['crop'])
        s = min(460 / fg.width, 400 / fg.height); fig_im = fg.resize((int(fg.width * s), int(fg.height * s)), Image.LANCZOS)
    for k, st in enumerate(steps):
        if st.get('newpage') and lines: page += 1; cy = 46
        last = offs[k]
        for wr in st.get('write', []):
            img = render_line(wr['tex'], COLORS[wr.get('color', 'ink')], wr.get('size', 60))
            beside_fig = fig_im is not None and page == 0 and cy < fig_im.height + 60
            maxw = (VX1 - VX0) - 130 - 40 - (fig_im.width + 30 if beside_fig else 0)
            if img.width > maxw:
                img = img.resize((maxw, int(img.height * maxw / img.width)), Image.LANCZOS)
            t0 = offs[k] + cue_time(als[k], st['say'], wr['cue'], last - offs[k]) if wr.get('cue') else last
            last = t0
            dur = max(0.8, min(3.6, img.width / 480))
            lines.append(dict(img=img, page=page, x=130 + 70 * wr.get('indent', 0), y=cy, t0=t0, dur=dur,
                              box=wr.get('box'), underline=wr.get('underline')))
            cy += img.height + wr.get('gap', 26)
    # 줄마다 그 줄이 보이도록 하는 밀어 올림 양, 앞 줄 쓰기 직전 0.5초 동안 부드럽게 옮긴다
    prev_t = {}
    for ln in lines:
        ln['scroll'] = max(0, ln['y'] + ln['img'].height + 80 - VH)
        ln['scroll_from'] = prev_t.get(ln['page'], 0); prev_t[ln['page']] = max(ln['scroll'], ln['scroll_from'])
        ln['scroll'] = prev_t[ln['page']]
    def view(tt):
        """지금 보이는 장과 밀어 올린 양"""
        started = [ln for ln in lines if ln['t0'] - 0.5 <= tt]
        if not started: return 0, 0
        ln = started[-1]; p = min(1.0, max(0.0, (tt - (ln['t0'] - 0.5)) / 0.5)); p = 1 - (1 - p) ** 2
        return ln['page'], int(ln['scroll_from'] + (ln['scroll'] - ln['scroll_from']) * p)
    step_at = lambda tt: max(i for i in range(len(steps)) if offs[i] <= tt + 1e-6)

    # 3) 프레임
    base_paper = paper()
    canvas_h = {pg: max([ln['y'] + ln['img'].height for ln in lines if ln['page'] == pg] + [0]) + VH + 40 for pg in range(page + 1)}
    sheets = {}
    def sheet(pg, upto):              # 그 장의 종이(모눈) + 다 쓴 줄들 — (장, 몇 줄까지) 로 캐시
        key = (pg, upto)
        if key not in sheets:
            cw, chh = VX1 - VX0, canvas_h[pg]
            L = Image.new('RGBA', (cw, chh), PAPER + (255,)); d = ImageDraw.Draw(L)
            for x in range(26, cw, 34): d.line([(x, 0), (x, chh)], fill=GRID, width=1)
            for yy in range(26, chh, 34): d.line([(0, yy), (cw, yy)], fill=GRID, width=1)
            d.line([(92, 0), (92, chh)], fill=MARGIN, width=2)
            if fig_im is not None and pg == 0:
                L.paste(fig_im, (cw - fig_im.width - 30, 30))
            for ln in lines[:upto]:
                if ln['page'] != pg: continue
                L.alpha_composite(ln['img'], (int(ln['x']), int(ln['y'])))
                bx = (ln['x'] - 14, ln['y'] - 10, ln['x'] + ln['img'].width + 14, ln['y'] + ln['img'].height + 10)
                if ln['box']: d.rounded_rectangle(bx, 14, outline=PEN + (235,), width=6)
                if ln['underline']: d.line([(bx[0] + 6, bx[3] + 2), (bx[2] - 6, bx[3] + 2)], fill=PEN + (235,), width=6)
            sheets[key] = L
        return sheets[key]

    ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
                           '-i', '-', '-i', full, '-t', f'{n / FPS:.4f}', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
                           '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-movflags', '+faststart', a.out],
                          stdin=subprocess.PIPE)
    prev_key = prev_bytes = None; chrome = {}
    for f in range(n):
        tt = f / FPS; k = step_at(tt); st = steps[k]
        done = [i for i, ln in enumerate(lines) if tt >= ln['t0'] + ln['dur'] + 0.15]
        upto = (max(done) + 1) if done else 0
        writing = [i for i, ln in enumerate(lines) if ln['t0'] <= tt < ln['t0'] + ln['dur'] + 0.15]
        cur_page, off = view(tt)
        pose = st.get('pose', 'A'); mouth = mouths[f] if pose == 'A' else 'closed'
        bob = 0 if pose == 'A' else int(min(1.0, loud[f]) * 3) * 3          # 말할 때 3단계로 들썩
        prog = tuple((i, round(min(1, (tt - lines[i]['t0']) / lines[i]['dur']), 3)) for i in writing)
        key = (k, cur_page, off, upto, pose, mouth, bob, prog)
        if key == prev_key:
            ff.stdin.write(prev_bytes); continue
        ck = (k, pose)
        if ck not in chrome:
            im = base_paper.copy(); top = right_panel(im, P, st); chrome[ck] = (im.convert('RGBA'), top)
        fr, top = chrome[ck]; fr = fr.copy()
        sh = sheet(cur_page, upto)
        win = sh.crop((0, off, VX1 - VX0, off + VH))
        tip = None
        for i in writing:
            ln = lines[i]
            if ln['page'] != cur_page: continue
            p = min(1.0, (tt - ln['t0']) / ln['dur'])
            wpx = max(1, int(ln['img'].width * p))
            win.alpha_composite(ln['img'].crop((0, 0, wpx, ln['img'].height)), (int(ln['x']), int(ln['y'] - off)))
            if p < 1: tip = (VX0 + ln['x'] + wpx, VY0 + ln['y'] - off + ln['img'].height * (0.55 + 0.3 * math.sin(tt * 18)))
        mask = Image.new('L', win.size, 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, win.width - 1, win.height - 1), 14, fill=255)
        fr.paste(win, (VX0, VY0), mask)
        sj = suji(pose, mouth, top)
        fr.alpha_composite(sj, (1484 + 205 - sj.width // 2, H - sj.height + 6 - bob))
        if tip:
            pi, (ox, oy) = pencil()
            if tip[0] - ox >= 0 and tip[1] - oy >= 0: fr.alpha_composite(pi, (int(tip[0] - ox), int(tip[1] - oy)))
        prev_key, prev_bytes = key, fr.convert('RGB').tobytes()
        ff.stdin.write(prev_bytes)
    ff.stdin.close(); ff.wait()

    # 4) 단계별 구간 (개념 영상의 .구간.json 과 같은 꼴)
    seg = dict(id=P['id'], kind='증명', title=P['title'], concept_no=P.get('concept_no'), chapter=P.get('chapter'),
               sub_chapter=P.get('sub_chapter'), book_page=P.get('book_page'), duration=round(total, 3),
               steps=[dict(step=i + 1, start=round(offs[i], 3), end=round(offs[i + 1] if i + 1 < len(offs) else total, 3),
                           pose=s.get('pose', 'A'), bubble=s['bubble'],
                           lines=[dict(at=round(l['t0'], 3), tex=w['tex']) for w, l in
                                  zip(s.get('write', []), [ln for ln in lines if offs[i] <= ln['t0'] < (offs[i + 1] if i + 1 < len(offs) else 1e9)])])
                      for i, s in enumerate(steps)])
    json.dump(seg, open(os.path.splitext(a.out)[0] + '.구간.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    import shutil; shutil.rmtree(tmp, ignore_errors=True)
    print('ok', a.out, f'{total / 60:.1f}분, 줄 {len(lines)}개, 장 {page + 1}')


if __name__ == '__main__':
    main()
