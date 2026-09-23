import json, sys, numpy as np
from PIL import Image, ImageDraw
from qdet import page
pl=json.load(open('pills_body.json',encoding='utf8'))
a,b=int(sys.argv[1]),int(sys.argv[2]); out=sys.argv[3]
sel=pl[a:min(b,len(pl))]
cache={}; tiles=[]
for k,d in enumerate(sel, start=a):
    if d['pg'] not in cache: cache.clear(); cache[d['pg']]=page(d['pg'])
    g=cache[d['pg']]
    x0=max(0,d['x0']-10); x1=min(g.shape[1], (820 if d['half']==0 else 1620))
    im=Image.fromarray(g[max(0,d['y0']-12):d['y1']+12, x0:x1].astype(np.uint8)).convert('RGB')
    im=im.resize((int(im.width*0.55), int(im.height*0.55)))
    tiles.append((k,im))
CW=max(t.width for _,t in tiles)+44; CH=max(t.height for _,t in tiles)+4
cols=2; rows=(len(tiles)+cols-1)//cols
img=Image.new('RGB',(cols*CW, rows*CH),'white'); d=ImageDraw.Draw(img)
for j,(k,t) in enumerate(tiles):
    x=(j%cols)*CW; y=(j//cols)*CH
    d.text((x+2,y+8),str(k),fill='red'); img.paste(t,(x+42,y+2))
img.save(out); print(out,img.size,len(tiles))
