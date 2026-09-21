import json, sys, os
from PIL import Image, ImageDraw
rows=json.load(open('qmeta.json',encoding='utf8'))
a,b=int(sys.argv[1]),int(sys.argv[2]); out=sys.argv[3]
sel=[r for r in rows if r['ch']==a][b*0:]
W=430; COLS=4; SC=W/680
tiles=[]
for r in sel:
    im=Image.open(f"out/q/{r['name']}.png").convert('RGB')
    im=im.resize((W,max(1,int(im.height*SC))))
    tiles.append((f"{r['name']} {'예제' if r['k']=='ex' else ''}",im))
colh=[0]*COLS; place=[]
for lab,im in tiles:
    c=colh.index(min(colh)); place.append((c,colh[c],lab,im)); colh[c]+=im.height+16
img=Image.new('RGB',(COLS*(W+6),max(colh)+8),(235,235,235)); d=ImageDraw.Draw(img)
for c,y,lab,im in place:
    x=c*(W+6)
    d.rectangle([x,y,x+W+4,y+im.height+14],fill='white')
    d.text((x+3,y+2),lab,fill='red'); img.paste(im,(x+2,y+13))
img.save(out); print(out,img.size,len(sel))
