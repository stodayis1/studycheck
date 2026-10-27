# -*- coding: utf-8 -*-
"""잘라 둔 정답 그림을 **기계로** 읽는다 (사람 판독과 맞대기 위한 한 겹).

  python scripts/answers/ocr_answers.py <정답그림폴더> [--zoom 4] [--left 40]

  --badge  : 맨 앞의 **색 배지**(RPM 의 청록색 「답」)를 색으로 찾아 떼고 읽는다.
             픽셀 수를 짐작하는 --left 보다 안전하다 — 짐작하면 30 은 배지가 남아 1 로 읽히고
             42 는 숫자 앞자리를 깎는다(2026-10-27 RPM 에서 둘 다 겪었다).
  --left N : 왼쪽 N 픽셀을 떼고 읽는다. RPM 처럼 정답 그림 맨 앞에 「답」 배지가 붙어 있으면
             tesseract 가 그 배지를 글자로 읽어 **전부 쓰레기**가 된다(2026-10-27 RPM 중1-1 에서 0/45).
             RPM 은 `--left 30` 이면 깨끗하게 읽힌다. 더 떼면(42) 짧은 답이 같이 날아간다.

왜 있나
  그림을 눈으로만 읽으면 1,300개를 같은 품질로 끝까지 보기 어렵다.
  기계 판독을 따로 두고 **사람 판독·원본 표·DB 값**과 세 겹으로 맞댄다.
  (scripts/answers/README.md 의 「숫자는 tesseract 로 한 번 더」)

읽는 요령
  · 그림이 작아 그대로는 안 읽힌다 → 4배로 키우고 **흑백 이진화** 한다
  · 숫자 답이 대부분이라 psm 7(한 줄)·8(한 낱말)·13(그대로) 을 다 돌려 **가장 그럴듯한 것**을 고른다
  · 동그라미 숫자(①~⑤)는 tesseract 가 못 읽는다 → 그건 사람 판독에 맡기고 여기선 빈칸으로 둔다
"""
import io
import json
import os
import re
import subprocess
import sys

import numpy as np
from PIL import Image

TESS = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

d = sys.argv[1]
zi = sys.argv.index('--zoom') if '--zoom' in sys.argv else -1
ZOOM = int(sys.argv[zi + 1]) if zi > 0 else 4
li = sys.argv.index('--left') if '--left' in sys.argv else -1
LEFT = int(sys.argv[li + 1]) if li > 0 else 0
BADGE = '--badge' in sys.argv


def badge_end(path):
    """맨 앞 색 배지가 끝나는 x — 왼쪽 35% 안에서만 찾는다(뒤쪽의 같은 색 선에 끌리지 않게)."""
    rgb = np.array(Image.open(path).convert('RGB'))
    w = rgb.shape[1]
    lim = max(10, int(w * 0.35))
    R, G, B = (rgb[:, :lim, i].astype(int) for i in range(3))
    teal = (G > 120) & (B > 120) & (R < G - 40) & (R < B - 40)
    xs = np.where(teal.any(axis=0))[0]
    return int(xs.max()) + 5 if xs.size else 0

rows = json.load(io.open(os.path.join(d, 'list.json'), encoding='utf8'))
info = {str(r['id']): r for r in rows}

work = os.path.join(d, '_ocr')
os.makedirs(work, exist_ok=True)


def prep(path, out):
    """키우고 흑백 이진화 — 작은 글씨는 이 과정 없이는 거의 안 읽힌다"""
    im = Image.open(path).convert('L')
    a = np.array(im)
    cut = badge_end(path) if BADGE else LEFT
    if cut and a.shape[1] > cut + 20:
        a = a[:, cut:]             # 「답」 배지를 떼고 읽는다
    if a.size == 0:
        return False
    # 테두리 여백을 조금 둬야 글자가 가장자리에 붙지 않는다
    a = np.pad(a, 12, constant_values=255)
    im = Image.fromarray(a).resize((a.shape[1] * ZOOM, a.shape[0] * ZOOM), Image.LANCZOS)
    a = np.array(im)
    thr = max(140, int(a.mean()) - 40)
    Image.fromarray(((a > thr) * 255).astype(np.uint8)).save(out)
    return True


def run(path, psm):
    try:
        p = subprocess.run([TESS, path, 'stdout', '--psm', str(psm)],
                           capture_output=True, timeout=25)
        return p.stdout.decode('utf8', 'ignore').strip()
    except Exception:
        return ''


NUM = re.compile(r'^-?\d+$')


def pick(cands):
    """숫자로 읽힌 것을 가장 믿는다 — 그 다음은 짧고 글자가 적은 것"""
    cl = []
    for c in cands:
        c = c.replace('\n', ' ').strip()
        c = re.sub(r'[|_~^`\'"]', '', c).strip()
        c = c.replace('—', '-').replace('−', '-').replace('–', '-')
        c = re.sub(r'\s+', ' ', c)
        if c:
            cl.append(c)
    if not cl:
        return ''
    nums = [c for c in cl if NUM.match(c.replace(' ', ''))]
    if nums:
        return max(set(nums), key=nums.count).replace(' ', '')
    return min(cl, key=len)


out = {}
n = 0
for fn in sorted(os.listdir(d)):
    if not fn.endswith('.png'):
        continue
    pid = fn[:-4]
    if pid not in info:
        continue
    src = os.path.join(d, fn)
    tmp = os.path.join(work, pid + '.png')
    if not prep(src, tmp):
        continue
    got = pick([run(tmp, p) for p in (7, 8, 13)])
    out[info[pid]['local_no']] = got
    n += 1
    if n % 100 == 0:
        print('  ', n, flush=True)

json.dump(out, io.open(os.path.join(d, 'ocr.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=0)
pure = sum(1 for v in out.values() if NUM.match(v))
print(f'읽은 그림 {n} · 그 중 순수한 숫자로 읽힌 것 {pure}')
