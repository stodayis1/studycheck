import json, os, numpy as np
from PIL import Image
from adet import apage
nums=json.load(open('anum_ok.json',encoding='utf8'))
OUT='out/a'; os.makedirs(OUT,exist_ok=True)
for f in os.listdir(OUT): os.remove(os.path.join(OUT,f))
cache={}; made=0
for d in nums:
    if d['pg'] not in cache: cache.clear(); cache[d['pg']]=apage(d['pg'])
    im=cache[d['pg']]; H,W=im.shape[:2]
    same=[e for e in nums if e['pg']==d['pg'] and e['row']==d['row'] and e['half']==d['half'] and e['x0']>d['x0']+20]
    right=(min(e['x0'] for e in same)-10) if same else (W//2-40 if d['half']==0 else W-50)
    a=im[max(0,d['y0']-12):min(H,d['y1']+16), d['x1']+5:right]
    if a.size==0 or a.shape[1]<12: continue
    g=a.mean(2); ys=np.where((g<170).any(1))[0]
    if len(ys): a=a[max(0,ys[0]-5):ys[-1]+6]
    Image.fromarray(a.astype(np.uint8)).save(f"{OUT}/{d['no']:04d}.png"); made+=1
print('정답 조각',made)
