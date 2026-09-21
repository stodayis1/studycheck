import json, sys
from PIL import Image, ImageDraw
rows=[r for r in json.load(open(r'C:\Users\USER\studycheck\scripts\problems_ky_gn_cm1.json',encoding='utf8')) if r['k']=='number']
rows.sort(key=lambda r:r['l'])
a,b=int(sys.argv[1]),int(sys.argv[2]); sel=rows[a:b]
W=300; SC=W/680; COLS=3
tiles=[]
for r in sel:
    im=Image.open(f"out/a/{r['l']}.png").convert('RGB'); im=im.resize((W,max(1,int(im.height*SC))))
    tiles.append((f"{r['l']} = {r['a']}",im))
colh=[0]*COLS; place=[]
for lab,im in tiles:
    c=colh.index(min(colh)); place.append((c,colh[c],lab,im)); colh[c]+=im.height+18
img=Image.new('RGB',(COLS*(W+8),max(colh)+8),(240,240,240)); d=ImageDraw.Draw(img)
for c,y,lab,im in place:
    x=c*(W+8); d.rectangle([x,y,x+W+6,y+im.height+16],fill='white')
    d.text((x+3,y+3),lab,fill='red'); img.paste(im,(x+3,y+15))
img.save(sys.argv[3]); print(sys.argv[3],img.size,len(sel))
