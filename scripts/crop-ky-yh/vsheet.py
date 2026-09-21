import json, sys
from PIL import Image, ImageDraw
K=json.load(open('kinds.json',encoding='utf8'))
names=sorted([n for n,(k,a) in K.items() if k=='number'])
a,b=int(sys.argv[1]),int(sys.argv[2]); sel=names[a:b]
W=150; COLS=6
tiles=[]
for n in sel:
    im=Image.open(f"out/a/{n}.png").convert('RGB')
    sc=W/im.width; im=im.resize((W,max(1,int(im.height*sc))))
    tiles.append((f"{n}={K[n][1]}",im))
colh=[0]*COLS; place=[]
for lab,im in tiles:
    c=colh.index(min(colh)); place.append((c,colh[c],lab,im)); colh[c]+=im.height+16
img=Image.new('RGB',(COLS*(W+8),max(colh)+8),(240,240,240)); d=ImageDraw.Draw(img)
for c,y,lab,im in place:
    x=c*(W+8); d.rectangle([x,y,x+W+6,y+im.height+14],fill='white')
    d.text((x+2,y+2),lab,fill='red'); img.paste(im,(x+3,y+13))
img.save(sys.argv[3]); print(sys.argv[3],img.size,len(sel))
