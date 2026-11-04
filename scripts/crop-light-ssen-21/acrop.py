import json, os, numpy as np
from PIL import Image
from adet import apage
rows=json.load(open('anums_ok.json',encoding='utf8'))
allr=json.load(open('anums.json',encoding='utf8'))
OUT='out/a'; os.makedirs(OUT,exist_ok=True)
for f in os.listdir(OUT): os.remove(os.path.join(OUT,f))
byp={}
for r in allr: byp.setdefault(r['pg'],[]).append(r)
cache={}; made=0
for r in rows:
    if r['pg'] not in cache: cache.clear(); cache[r['pg']]=apage(r['pg'])
    im=cache[r['pg']]; H,W=im.shape[:2]
    # 같은 줄 오른쪽의 다음 번호 전까지
    # 오른쪽 끝 — 같은 줄의 다음 번호까지. 줄의 **마지막 항목**은 그런 번호가 없어
    # 전에는 W-40(쪽 오른쪽 끝)까지 잘렸고, 그래서 **쪽 가운데를 넘어 옆 쪽 내용이
    # 통째로 딸려 들어왔다**(0274·0430). 한 쪽에 책 두 면이 들어 있으므로
    # 왼쪽 면이면 가운데를, 오른쪽 면이면 쪽 끝을 넘지 않는다.
    same=[o for o in byp[r['pg']] if abs(o['y0']-r['y0'])<20 and o['x0']>r['x1']+10]
    lim = W//2-12 if r['half']==0 else W-40
    x1=min([o['x0']-10 for o in same]+[lim])
    # ★ **번호부터** 자른다 (2026-11-04). 전에는 번호 오른쪽(r['x1']+8)부터 잘라
    #   그림만 보고는 그것이 몇 번 문항의 답인지 알 길이 없었다. 그래서 번호가 밀려도
    #   아무도 몰랐다(419문항). 번호가 그림 안에 있으면 짝이 **저절로 확인된다**.
    x0=max(0, r['x0']-5)
    if x1-x0<15: continue
    a=im[max(0,r['y0']-10):min(H,r['y1']+14), x0:x1]
    g=a.mean(2); cols=np.where((g<175).any(0))[0]; rr=np.where((g<175).any(1))[0]
    if not len(cols) or not len(rr): continue
    a=a[max(0,rr[0]-4):rr[-1]+5, max(0,cols[0]-5):cols[-1]+6]
    if a.shape[1]<6: continue
    Image.fromarray(a.astype(np.uint8)).save(f"{OUT}/{r['no']:04d}.png"); made+=1
print('정답 조각',made)
