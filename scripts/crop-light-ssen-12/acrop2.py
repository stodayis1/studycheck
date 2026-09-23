import json, os, numpy as np, collections
from PIL import Image
from sdet import spage
rows=json.load(open('snums.json',encoding='utf8'))
dec=json.load(open('sdec.json',encoding='utf8'))
sc=json.load(open('ssc.json',encoding='utf8'))
marks=json.load(open('smarks.json',encoding='utf8'))
byp={}
for i,r in enumerate(rows): byp.setdefault(r['pg'],[]).append((i,r))
def half(x,W): return 0 if x<W//2 else 1
OUT='out/a'; os.makedirs(OUT,exist_ok=True)
for f in os.listdir(OUT): os.remove(os.path.join(OUT,f))
cache={}; res={}
for m in sorted(marks,key=lambda m:(m['pg'],m['x'],m['y'])):
    if m['pg'] not in cache: cache.clear(); cache[m['pg']]=spage(m['pg'])
    im=cache[m['pg']]; H,W=im.shape[:2]
    h=half(m['x'],W)
    up=[(i,r) for i,r in byp.get(m['pg'],[]) if half(r['x0'],W)==h and r['y0']<=m['y']+16]
    if not up: continue
    i,r=max(up,key=lambda t:t[1]['y0'])
    if not dec[i].isdigit() or sc[i]<0.6: continue
    n=int(dec[i])
    if not (1<=n<=1085): continue
    x0=m['x']+38
    x1=(W-40) if h==1 else (W//2-30)
    a=im[max(0,m['y']-12):min(H,m['y']+42), x0:x1]
    g=a.mean(2); cols=np.where((g<170).any(0))[0]; rr=np.where((g<170).any(1))[0]
    if not len(cols) or not len(rr): continue
    a=a[max(0,rr[0]-5):rr[-1]+6, max(0,cols[0]-6):cols[-1]+7]
    if a.shape[1]<8: continue
    # 같은 문항에 답 표시가 여러 개면 마지막(최종답)을 쓴다
    res[n]=a
for n,a in res.items(): Image.fromarray(a.astype(np.uint8)).save(f"{OUT}/{n:04d}.png")
print('정답 조각',len(res))
