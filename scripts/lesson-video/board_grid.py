"""그림판 좌표 읽기 — 문제 그림에 픽셀 눈금을 그려 꼭짓점·선 끝의 좌표를 읽게 한다 (board.py 의 marks pts 용)

  python scripts/lesson-video/board_grid.py <그림.png> <나갈.png> [--crop x0,y0,x1,y1] [--step 20]

· 눈금 숫자는 원본 그림 픽셀 좌표다(crop 을 해도 원본 기준) — marks pts 에 그대로 쓴다
· 그림을 3배로 키워 그리므로 작은 그림도 읽힌다. 다 쓴 뒤에는 proof_validate --sheet 의 <id>_그림판.png 로 자리를 확인한다
"""
import argparse
from PIL import Image, ImageDraw, ImageFont

ap = argparse.ArgumentParser(); ap.add_argument('img'); ap.add_argument('out')
ap.add_argument('--crop'); ap.add_argument('--step', type=int, default=20)
a = ap.parse_args()
im = Image.open(a.img).convert('RGB')
ox = oy = 0
if a.crop:
    c = [int(v) for v in a.crop.split(',')]; im = im.crop(c); ox, oy = c[0], c[1]
Z = 3; M = 60
big = im.resize((im.width * Z, im.height * Z), Image.LANCZOS)
out = Image.new('RGB', (big.width + M, big.height + M), (255, 255, 255)); out.paste(big, (M, M))
d = ImageDraw.Draw(out, 'RGBA'); f = ImageFont.truetype('C:/Windows/Fonts/malgun.ttf', 16)
st = a.step
for x in range((ox // st + 1) * st, ox + im.width, st):
    X = M + (x - ox) * Z; major = x % (st * 5) == 0
    d.line([(X, M), (X, out.height)], fill=(255, 0, 0, 110 if major else 45), width=1)
    if major or st >= 20: d.text((X, M - 22), str(x), font=f, fill=(200, 0, 0), anchor='mm')
for y in range((oy // st + 1) * st, oy + im.height, st):
    Y = M + (y - oy) * Z; major = y % (st * 5) == 0
    d.line([(M, Y), (out.width, Y)], fill=(0, 0, 255, 110 if major else 45), width=1)
    if major or st >= 20: d.text((M - 28, Y), str(y), font=f, fill=(0, 0, 200), anchor='mm')
out.save(a.out)
print(a.out, f'원본 {ox},{oy} ~ {ox + im.width},{oy + im.height}')
