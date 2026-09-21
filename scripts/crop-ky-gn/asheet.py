import json, sys
from PIL import Image, ImageDraw
rows=json.load(open('qmeta.json',encoding='utf8'))
ch=int(sys.argv[1]); out=sys.argv[2]
sel=[r for r in rows if r['ch']==ch and r['k']=='pr']
W=300; SC=W/680; COLS=5
tiles=[]
for r in sel:
    try: im=Image.open(f"out/a/{r['name']}.png").convert('RGB')
    except: continue
    im=im.resize((W,max(1,int(im.height*SC))))
    tiles.append((r['name'],im))
colh=[0]*COLS; place=[]
for lab,im in tiles:
    c=colh.index(min(colh)); place.append((c,colh[c],lab,im)); colh[c]+=im.height+16
img=Image.new('RGB',(COLS*(W+6),max(colh)+8),(235,235,235)); d=ImageDraw.Draw(img)
for c,y,lab,im in place:
    x=c*(W+6); d.rectangle([x,y,x+W+4,y+im.height+14],fill='white')
    d.text((x+3,y+2),lab,fill='red'); img.paste(im,(x+2,y+13))
img.save(out); print(out,img.size,len(tiles))
