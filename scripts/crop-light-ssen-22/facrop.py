import json, os, numpy as np
from PIL import Image
from fdet import fpage
rows=[r for r in json.load(open('fnums_ok.json',encoding='utf8')) if r['no']<=457]
allr=json.load(open('fnums.json',encoding='utf8'))
OUT='out/a'; os.makedirs(OUT,exist_ok=True)
for f in os.listdir(OUT): os.remove(os.path.join(OUT,f))
byp={}
for r in allr: byp.setdefault(r['pg'],[]).append(r)
cache={}; made=0
for r in rows:
    if r['pg'] not in cache: cache.clear(); cache[r['pg']]=fpage(r['pg'])
    im=cache[r['pg']]; H,W=im.shape[:2]
    same=[o for o in byp[r['pg']] if abs(o['y0']-r['y0'])<14 and o['x0']>r['x1']+8]
    # 같은 단(왼쪽/오른쪽) 안에서만 다음 번호를 찾는다
    lim = 830 if r["half"]==0 else 1570
    same=[o for o in same if o['x0']<=lim+60]
    x1=min([o['x0']-10 for o in same]+[lim])
    x0=r['x1']+6
    if x1-x0<14: continue
    a=im[max(0,r['y0']-14):min(H,r['y1']+16), x0:x1]
    g=a.mean(2); cols=np.where((g<185).any(0))[0]; rr=np.where((g<185).any(1))[0]
    if not len(cols) or not len(rr): continue
    a=a[max(0,rr[0]-4):rr[-1]+5, max(0,cols[0]-5):cols[-1]+6]
    if a.shape[1]<6 or a.shape[0]<6: continue
    Image.fromarray(a.astype(np.uint8)).save(f"{OUT}/{r['no']:04d}.png"); made+=1
print('정답 조각',made,'/',len(rows))
