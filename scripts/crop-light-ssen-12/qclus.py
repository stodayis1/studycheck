import numpy as np, json
from PIL import Image, ImageDraw
G=np.load('qglyphs.npy')
GW,GH=14,20
cents=[]; asg=[]
for gl in G:
    ids=[]
    for v in gl:
        if not v.any(): ids.append(-1); continue
        best,bd=-1,9
        for k,c in enumerate(cents):
            d=1-float(c@v)
            if d<bd: bd,best=d,k
        if bd>0.10: cents.append(v); best=len(cents)-1
        ids.append(best)
    asg.append(ids)
cnt=[0]*len(cents)
for ids in asg:
    for i in ids:
        if i>=0: cnt[i]+=1
order=sorted(range(len(cents)),key=lambda i:-cnt[i])[:40]
cols=10; cw,ch=58,80
img=Image.new('RGB',(cols*cw,((len(order)+cols-1)//cols)*ch),'white'); d=ImageDraw.Draw(img)
for k,i in enumerate(order):
    x=(k%cols)*cw; y=(k//cols)*ch
    d.text((x+2,y+2),f"{i}:{cnt[i]}",fill='red')
    a=cents[i].reshape(GH,GW); a=(a-a.min())/(a.max()-a.min()+1e-9)
    img.paste(Image.fromarray((255-a*255).astype(np.uint8)).resize((38,56)),(x+8,y+18))
img.save('qdigits.png')
np.save('qcents.npy',np.array(cents)); json.dump(asg,open('qasg.json','w'))
print('클러스터',len(cents),'| 상위 40개 그림 저장')
