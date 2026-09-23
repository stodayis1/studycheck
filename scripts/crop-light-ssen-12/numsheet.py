import json, os, sys, numpy as np
from PIL import Image, ImageDraw
from sdet import spage
rows=json.load(open('snums.json',encoding='utf8'))
marks=json.load(open('smarks.json',encoding='utf8'))
W0=1732
for r in rows: r['half']=0 if r['x0']<W0//2 else 1
for m in marks: m['half']=0 if m['x']<W0//2 else 1
# 답 표시마다 '그 답의 항목 번호' 찾기 (같은 줄 왼쪽 → 없으면 위)
byp={}
for i,r in enumerate(rows): byp.setdefault((r['pg'],r['half']),[]).append((i,r))
pairs=[]
for m in marks:
    lst=byp.get((m['pg'],m['half']),[])
    same=[(i,r) for i,r in lst if abs(r['y0']-m['y'])<26 and r['x1']<m['x'] and m['x']-r['x1']<260]
    if same: i,r=max(same,key=lambda t:t[1]['x1'])
    else:
        rowmates=[(i,r) for i,r in lst if abs(r['y0']-m['y'])<26]
        if rowmates: continue
        up=[(i,r) for i,r in lst if r['y0']<=m['y']-20]
        if not up: continue
        i,r=max(up,key=lambda t:(t[1]['y0'],t[1]['x0']))
    pairs.append((m,i,r))
# 읽기 순서
pairs.sort(key=lambda t:(t[0]['pg'],t[0]['half'],t[0]['y'],t[0]['x']))
json.dump([{'mi':k,'ni':i,'pg':m['pg'],'x':m['x'],'y':m['y'],'half':m['half']} for k,(m,i,r) in enumerate(pairs)],
          open('pairs.json','w'))
print('짝지은 답 표시',len(pairs))
PER=66; COLS=6
a,b=int(sys.argv[1]),int(sys.argv[2]); out=sys.argv[3]
cache={}; tiles=[]
for k in range(a,min(b,len(pairs))):
    m,i,r=pairs[k]
    if r['pg'] not in cache: cache.clear(); cache[r['pg']]=spage(r['pg'])
    im=cache[r['pg']]
    t=im[max(0,r['y0']-5):r['y1']+5, max(0,r['x0']-5):r['x1']+5].astype(np.uint8)
    tiles.append((k, Image.fromarray(t).convert('RGB')))
CW=150; CH=48
img=Image.new('RGB',(COLS*CW, ((len(tiles)+COLS-1)//COLS)*CH),'white'); d=ImageDraw.Draw(img)
for j,(k,t) in enumerate(tiles):
    x=(j%COLS)*CW; y=(j//COLS)*CH
    d.text((x+2,y+16),str(k),fill='red'); img.paste(t,(x+44,y+6))
img.save(out); print(out, img.size, len(tiles))
