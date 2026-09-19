import sys
from PIL import Image, ImageDraw
nos=sys.argv[2:]; out=sys.argv[1]
ims=[Image.open(f'out/all/{n}.png') for n in nos]
cols=3; W=680+20
colh=[0]*cols; place=[]
for im in ims:
    c=colh.index(min(colh)); place.append((c,colh[c])); colh[c]+=im.height+30
S=Image.new('RGB',(W*cols,max(colh)),(200,200,200))
for (c,y),im,n in zip(place,ims,nos):
    S.paste(im,(c*W+10,y+20)); ImageDraw.Draw(S).text((c*W+10,y+4),n,fill=(0,0,255))
    ImageDraw.Draw(S).line([(c*W+10,y+20+37),(c*W+60,y+20+37)],fill=(255,0,255),width=1)
S.save(out)
