import sys, os
from PIL import Image, ImageDraw
a,b=int(sys.argv[1]),int(sys.argv[2]); out=sys.argv[3]
W=330; COLS=5
tiles=[]
for n in range(a,b+1):
    p=f"out/q/{n:04d}.png"
    if not os.path.exists(p): continue
    im=Image.open(p).convert('RGB')
    im=im.resize((W,max(1,int(im.height*W/im.width))))
    if im.height>700: im=im.crop((0,0,W,700))
    tiles.append((f"{n:04d}",im))
colh=[0]*COLS; place=[]
for lab,im in tiles:
    c=colh.index(min(colh)); place.append((c,colh[c],lab,im)); colh[c]+=im.height+16
img=Image.new('RGB',(COLS*(W+6),max(colh)+8),(230,230,230)); d=ImageDraw.Draw(img)
for c,y,lab,im in place:
    x=c*(W+6); d.rectangle([x,y,x+W+4,y+im.height+14],fill='white')
    d.text((x+3,y+2),lab,fill='red'); img.paste(im,(x+2,y+13))
img.save(out); print(out,img.size,len(tiles))
