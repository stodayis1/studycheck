# manual_boxes.json 의 상자대로 자른다(상자 안에서 잉크만 남기고, 여러 상자는 위아래로 붙임).
# 사용: manual_crop.py <scratchpad> <권 키 recut12|recut22> <출력 폴더> <옛 그림 폴더>
import sys, os, json
import numpy as np
from PIL import Image, ImageDraw, ImageFont
L, key, OUT, OLD = sys.argv[1:5]
boxes = json.load(open(os.path.join(L, 'manual_boxes.json'), encoding='utf-8'))[key]
os.makedirs(OUT, exist_ok=True)
res = []
for n, bl in boxes.items():
    parts = []
    for f, x0, y0, x1, y1 in bl:
        a = np.asarray(Image.open(os.path.join(L, key, f)).convert('RGB'))
        sub = a[y0:y1, x0:x1]; ink = sub.mean(2) < 215
        r, c = np.where(ink.any(1))[0], np.where(ink.any(0))[0]
        parts.append(sub[max(0, r[0] - 4): r[-1] + 5, max(0, c[0] - 4): c[-1] + 5])
    Wm = max(p.shape[1] for p in parts)
    arr = np.concatenate([np.pad(p, ((0, 4), (0, Wm - p.shape[1]), (0, 0)), constant_values=255) for p in parts])[:-4]
    im = Image.fromarray(arr.astype(np.uint8)); im.save(os.path.join(OUT, n + '.png')); res.append((n, im))
font = ImageFont.truetype(r'C:\Windows\Fonts\arial.ttf', 22)
rh = [max(60, Image.open(os.path.join(OLD, n + '.png')).height, im.height) + 14 for n, im in res]
s = Image.new('RGB', (1300, sum(rh)), 'white'); d = ImageDraw.Draw(s); y = 0
for (n, im), h in zip(res, rh):
    d.text((4, y + 8), n, fill=(220, 0, 0), font=font)
    o = Image.open(os.path.join(OLD, n + '.png')).convert('RGB'); s.paste(o.crop((0, 0, min(o.width, 480), o.height)), (80, y + 4))
    s.paste(im.crop((0, 0, min(im.width, 720), im.height)), (570, y + 4))
    d.line([(560, y), (560, y + h)], fill=(0, 160, 0), width=2); y += h; d.line([(0, y - 2), (1300, y - 2)], fill=(200, 200, 255))
s.save(os.path.join(OUT, '_sheet_manual.png')); print('손으로', len(res))
