import json, sys
from PIL import Image, ImageDraw
M=json.load(open('meta_all.json'))
def sheet(nos,out,cols=8,sc=0.3):
    ims=[Image.open(f'out/all/{n:04d}.png') for n in nos]
    ims=[im.resize((int(im.width*sc),max(1,int(im.height*sc)))) for im in ims]
    W=ims[0].width+8; colh=[0]*cols; pl=[]
    for im in ims:
        c=colh.index(min(colh)); pl.append((c,colh[c])); colh[c]+=im.height+16
    S=Image.new('RGB',(W*cols,max(colh)),(170,170,170)); D=ImageDraw.Draw(S)
    for (c,y),im,n in zip(pl,ims,nos):
        S.paste(im,(c*W+4,y+12)); D.text((c*W+4,y),f'{n:04d}',fill=(0,0,200))
    S.save(out); return S.size
for ch in range(1,11):
    nos=[m['no'] for m in M if m['ch']==ch]
    half=(len(nos)+1)//2
    print(ch, sheet(nos[:half],f'sh_{ch:02d}a.png'), sheet(nos[half:],f'sh_{ch:02d}b.png'))
