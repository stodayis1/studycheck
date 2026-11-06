"""도형 그림판 — 풀이 영상에서 문제 그림을 크게 띄우고, 말에 맞춰 연필로 짚고 보조선을 긋는다 (원장님 2026-11-06)

원장님: 꼭짓점을 말할 땐 그 꼭짓점을, 모서리·직선을 말할 땐 그 선을 짚어야 한다. 보조선은 그림에 직접 긋는다.

대본 머리에  "board": {"image": "0535.png", "crop": [x0,y0,x1,y1]}   ← 문제 그림에서 도형 부분
단계마다     "marks": [ {"cue": "말 안의 글자", "type": "...", "pts": [[x,y], ...], "color": "red", "label": "A", "keep": false} ]
  pts 는 board.image 원본 그림의 픽셀 좌표 (crop 을 빼지 않은 값). 좌표는 board_grid.py 로 눈금을 그려 읽는다.
  type
    point  꼭짓점·점 짚기 — pts[0] 에 점과 동그라미
    seg    선분·모서리 짚기 — pts[0]→pts[1] 을 형광펜처럼 굵게
    path   여러 모서리를 이어서 — pts 를 차례로
    line   직선 — pts[0], pts[1] 을 지나 양쪽으로 늘여서
    ray    반직선 — pts[0] 에서 pts[1] 쪽으로 늘여서
    aux    보조선 — pts[0]→pts[1] 점선 (기본 파랑, 끝까지 남는다)
    angle  각 — 꼭짓점 pts[1], 두 변 쪽 pts[0]·pts[2] 사이 호와 연한 부채꼴 (r: 반지름 — 원본 그림 픽셀, 없으면 화면에서 44)
    poly   도형 칠하기 — pts 다각형을 연하게 칠하고 테두리
    circle 원 — 중심 pts[0], 원 위의 점 pts[1]
    label  글자 쓰기 — pts[0] 자리에 label (예: "35°", "x", "D")
  color   red(기본) · blue · green · ink · orange
  keep    true 면 그 단계가 끝나도 남는다 (aux 는 기본 true, 나머지는 그 단계 끝에서 지운다)
  cue 가 없으면 그 단계 시작 0.3초 뒤. 그려지는 동안 연필이 따라간다.
"""
import math
from PIL import Image, ImageDraw, ImageFont

MARK_COLORS = {'red': (226, 52, 44), 'blue': (38, 110, 214), 'green': (20, 150, 80), 'ink': (29, 43, 107), 'orange': (240, 130, 20)}
DUR = {'point': 0.5, 'seg': 0.7, 'path': 1.1, 'line': 0.8, 'ray': 0.8, 'aux': 0.9, 'angle': 0.6, 'poly': 0.9, 'circle': 0.9, 'label': 0.5}
TYPES = set(DUR)
_FONT = 'C:/Windows/Fonts/malgunbd.ttf'


class Board:
    """board 그림 + 좌표 변환. fit=(최대 폭, 최대 높이)"""

    def __init__(self, img, crop, fit, pad=18):
        self.ox, self.oy = (crop[0], crop[1]) if crop else (0, 0)
        img = img.convert('RGB')
        if crop: img = img.crop(crop)
        # 둘레에 흰 여백 — 꼭짓점이 그림 끝에 붙어 있으면 동그라미·번호가 잘린다 (60번 사각뿔 꼭대기)
        im2 = Image.new('RGB', (img.width + 2 * pad, img.height + 2 * pad), (255, 255, 255)); im2.paste(img, (pad, pad))
        img = im2; self.ox -= pad; self.oy -= pad
        self.s = min(fit[0] / img.width, fit[1] / img.height)
        self.img = img.convert('RGB').resize((int(img.width * self.s), int(img.height * self.s)), Image.LANCZOS)
        self.size = self.img.size

    def xy(self, p):
        return ((p[0] - self.ox) * self.s, (p[1] - self.oy) * self.s)


def mark_dur(m):
    return DUR.get(m.get('type'), 0.6)


def _sub(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def _extend(a, b, both, W, H):
    """a→b 를 그림 밖까지 늘인 두 끝"""
    dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy) or 1
    big = (W + H) * 2
    e2 = (b[0] + dx / L * big, b[1] + dy / L * big)
    e1 = (a[0] - dx / L * big, a[1] - dy / L * big) if both else a
    return e1, e2


def _polyline_part(pts, t):
    """pts 를 잇는 꺾은선의 앞 t(0~1) 만큼과 끝점"""
    segs = [(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]
    lens = [math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in segs]; tot = sum(lens) or 1
    want = tot * t; out = [pts[0]]
    for (a, b), L in zip(segs, lens):
        if want >= L: out.append(b); want -= L; continue
        out.append(_sub(a, b, want / (L or 1))); break
    return out, out[-1]


def _dashed(d, a, b, col, w, dash=16, gap=11):
    L = math.hypot(b[0] - a[0], b[1] - a[1]); n = int(L // (dash + gap)) + 1
    for i in range(n):
        s0 = i * (dash + gap) / (L or 1); s1 = min(1, (i * (dash + gap) + dash) / (L or 1))
        if s0 >= 1: break
        d.line([_sub(a, b, s0), _sub(a, b, s1)], fill=col, width=w)


def draw_mark(layer, B, m, t=1.0, scale=1.0):
    """layer(RGBA, 그림판 크기)에 표시 하나를 진행도 t 만큼 그린다. 연필 끝 자리를 돌려준다"""
    d = ImageDraw.Draw(layer, 'RGBA')
    typ = m.get('type'); col = MARK_COLORS.get(m.get('color', 'blue' if typ == 'aux' else 'red'), MARK_COLORS['red'])
    P = [B.xy(p) for p in m.get('pts', [])]
    W, H = layer.size; w = max(3, int(7 * scale)); tip = P[-1] if P else None
    if typ == 'point':
        c = P[0]; r = 9 * scale; R = (14 + 14 * min(1, t)) * scale
        d.ellipse((c[0] - r, c[1] - r, c[0] + r, c[1] + r), fill=col + (255,))
        d.ellipse((c[0] - R, c[1] - R, c[0] + R, c[1] + R), outline=col + (230,), width=max(3, int(5 * scale)))
        tip = c
    elif typ in ('seg', 'path'):
        pts, tip = _polyline_part(P, t)
        d.line(pts, fill=col + (150,), width=int(w * 2.2), joint='curve')
        d.line(pts, fill=col + (255,), width=max(2, w // 2), joint='curve')
    elif typ in ('line', 'ray'):
        e1, e2 = _extend(P[0], P[1], typ == 'line', W, H)
        if typ == 'line':      # 가운데서 양쪽으로
            mid = _sub(P[0], P[1], 0.5); a, b = _sub(mid, e1, t), _sub(mid, e2, t)
        else: a, b = P[0], _sub(P[0], e2, t)
        d.line([a, b], fill=col + (150,), width=int(w * 2.2)); d.line([a, b], fill=col + (255,), width=max(2, w // 2)); tip = b
    elif typ == 'aux':
        b = _sub(P[0], P[1], t); _dashed(d, P[0], b, col + (255,), max(3, int(6 * scale))); tip = b
    elif typ == 'angle':
        v = P[1]; r = m.get('r', 44) * B.s * scale if m.get('r') else 44 * scale
        a1 = math.degrees(math.atan2(P[0][1] - v[1], P[0][0] - v[0])); a2 = math.degrees(math.atan2(P[2][1] - v[1], P[2][0] - v[0]))
        span = (a2 - a1) % 360
        if span > 180: a1, a2, span = a2, a1, 360 - span
        end = a1 + span * t; box = (v[0] - r, v[1] - r, v[0] + r, v[1] + r)
        d.pieslice(box, a1, end, fill=col + (70,))
        d.arc(box, a1, end, fill=col + (255,), width=max(3, int(5 * scale)))
        tip = (v[0] + r * math.cos(math.radians(end)), v[1] + r * math.sin(math.radians(end)))
    elif typ == 'poly':
        d.polygon(P, fill=col + (int(60 * t),))
        pts, tip = _polyline_part(P + [P[0]], t)
        d.line(pts, fill=col + (255,), width=max(3, int(5 * scale)), joint='curve')
    elif typ == 'circle':
        c = P[0]; r = math.hypot(P[1][0] - c[0], P[1][1] - c[1])
        d.arc((c[0] - r, c[1] - r, c[0] + r, c[1] + r), -90, -90 + 360 * t, fill=col + (255,), width=max(3, int(5 * scale)))
        a = math.radians(-90 + 360 * t); tip = (c[0] + r * math.cos(a), c[1] + r * math.sin(a))
    elif typ == 'label':
        f = ImageFont.truetype(_FONT, int(m.get('size', 34) * scale))
        txt = m.get('label', ''); a = int(255 * min(1, t * 1.5))
        x, y = P[0]
        for ox, oy in ((-2, 0), (2, 0), (0, -2), (0, 2)):           # 흰 테두리 — 그림 선 위에서도 읽히게
            d.text((x + ox, y + oy), txt, font=f, fill=(255, 255, 255, a), anchor='mm')
        d.text((x, y), txt, font=f, fill=col + (a,), anchor='mm'); tip = (x + 20 * scale, y)
    return tip


def check_mark(m, B=None):
    """대본 검사용 — 고칠 것 목록"""
    errs = []; typ = m.get('type'); pts = m.get('pts') or []
    need = {'point': 1, 'label': 1, 'seg': 2, 'line': 2, 'ray': 2, 'aux': 2, 'circle': 2, 'angle': 3, 'path': 2, 'poly': 3}
    if typ not in TYPES: return [f'marks type 모름: {typ}']
    if len(pts) < need[typ] or (typ in ('point', 'label', 'seg', 'line', 'ray', 'aux', 'circle', 'angle') and len(pts) != need[typ]):
        errs.append(f'marks {typ}: 점 {len(pts)}개 (필요 {need[typ]})')
    if typ == 'label' and not m.get('label'): errs.append('marks label: label 글자가 없음')
    if m.get('color') and m['color'] not in MARK_COLORS: errs.append(f"marks 색 모름: {m['color']}")
    if B is not None:
        for p in pts:
            x, y = B.xy(p)
            if not (-2 <= x <= B.size[0] + 2 and -2 <= y <= B.size[1] + 2): errs.append(f'marks {typ}: 점 {p} 가 그림판(crop) 밖')
    return errs
