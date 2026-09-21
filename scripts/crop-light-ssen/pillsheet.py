import json, sys, numpy as np
from PIL import Image, ImageDraw
from det import page
pl=json.load(open('pills.json',encoding='utf8'))
a,b=int(sys.argv[1]),int(sys.argv[2]); out=sys.argv[3]
sel=pl[a:b]
cache={}; tiles=[]
for d in sel:
    if d['pg'] not in cache: cache.clear(); cache[d['pg']]=page(d['pg'])
    g=cache[d['pg']]
    x0=max(0,d['x0']-95); x1=min(g.shape[1], (790 if d['half']==0 else 1610))
    im=Image.fromarray(g[max(0,d['y0']-16):d['y1']+16, x0:x1].astype(np.uint8)).convert('RGB')
    im=im.resize((int(im.width*0.62), int(im.height*0.62)))
    tiles.append((f"{pl.index(d)}",im))
CW=max(t.width for _,t in tiles)+42; CH=max(t.height for _,t in tiles)+6
cols=2; rows=(len(tiles)+cols-1)//cols
img=Image.new('RGB',(cols*CW, rows*CH),'white'); dr=ImageDraw.Draw(img)
for k,(lab,t) in enumerate(tiles):
    x=(k%cols)*CW; y=(k//cols)*CH
    dr.text((x+2,y+10),lab,fill='red'); img.paste(t,(x+40,y+2))
img.save(out); print(out,img.size,len(tiles))
