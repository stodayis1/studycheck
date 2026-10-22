"""그림에 눈금을 그어 좌표를 읽기 쉽게 — 문제 그림 crop · 풀이 그림 figure · 교재 토막 필기 자리 정할 때

  python scripts/lesson-video/grid.py <그림.png> [--step 50] [--crop x0,y0,x1,y1] [--out <눈금그림.png>]

· 가는 선은 step 픽셀마다, 굵은 선과 숫자는 step×2 마다. 숫자는 원래 그림의 픽셀 좌표 그대로다.
· --crop 을 주면 그 부분만 잘라 보여 주되 숫자는 원래 좌표로 적는다 — 잘라 본 뒤 숫자를 그대로 대본에 쓴다.
"""
import argparse, os
from PIL import Image, ImageDraw, ImageFont


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('image'); ap.add_argument('--step', type=int, default=50)
    ap.add_argument('--crop', default=None); ap.add_argument('--out', default=None)
    a = ap.parse_args()
    im = Image.open(a.image).convert('RGB')
    ox, oy = 0, 0
    if a.crop:
        x0, y0, x1, y1 = map(int, a.crop.split(',')); im = im.crop((x0, y0, x1, y1)); ox, oy = x0, y0
    pad = 46
    out = Image.new('RGB', (im.width + pad, im.height + pad), (255, 255, 255)); out.paste(im, (pad, pad))
    d = ImageDraw.Draw(out, 'RGBA')
    f = ImageFont.truetype('C:/Windows/Fonts/malgun.ttf', 15) if os.path.exists('C:/Windows/Fonts/malgun.ttf') else ImageFont.load_default()
    s = a.step
    for gx in range((ox // s) * s, ox + im.width + 1, s):
        x = pad + gx - ox
        if x < pad: continue
        major = gx % (2 * s) == 0
        d.line([(x, pad), (x, out.height)], fill=(220, 40, 40, 150 if major else 60), width=1)
        if major: d.text((x + 2, 4), str(gx), font=f, fill=(200, 30, 30))
    for gy in range((oy // s) * s, oy + im.height + 1, s):
        y = pad + gy - oy
        if y < pad: continue
        major = gy % (2 * s) == 0
        d.line([(pad, y), (out.width, y)], fill=(30, 90, 220, 150 if major else 60), width=1)
        if major: d.text((2, y + 2), str(gy), font=f, fill=(30, 80, 200))
    dst = a.out or os.path.splitext(a.image)[0] + '_격자.png'
    out.save(dst); print(dst)


if __name__ == '__main__':
    main()
