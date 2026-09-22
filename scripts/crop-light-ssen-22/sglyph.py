import json, numpy as np, collections
from PIL import Image
from scipy import ndimage
from sdet import spage, colmask
GW,GH=14,20
rows=[d for d in json.load(open('snums.json',encoding='utf8'))
      if 62<=d['x1']-d['x0']<=74 and (140<=d['x0']<=205 or 870<=d['x0']<=940)]
rows.sort(key=lambda d:(d['pg'],d['half'],d['y0']))
def split4(m,b):
    sub=m[b['y0']:b['y1'], b['x0']:b['x1']]
    lab,_=ndimage.label(sub)
    comps=sorted([[sl[1].start,sl[1].stop] for sl in ndimage.find_objects(lab)
                  if sl[1].stop-sl[1].start>=3 and sl[0].stop-sl[0].start>=9])
    while len(comps)>4:                     # 붙은 조각 합치기
        i=min(range(len(comps)-1), key=lambda k: comps[k+1][0]-comps[k][1])
        comps[i:i+2]=[[comps[i][0],comps[i+1][1]]]
    while len(comps)<4 and comps:           # 붙어버린 덩어리 쪼개기
        i=max(range(len(comps)), key=lambda k: comps[k][1]-comps[k][0])
        a,z=comps[i]
        if z-a<18: break
        comps[i:i+1]=[[a,(a+z)//2],[(a+z)//2,z]]; comps.sort()
    out=[]
    for a,z in comps[:4]:
        p=sub[:,a:z]; ys=np.where(p.any(1))[0]; xs=np.where(p.any(0))[0]
        if not len(ys): out.append(np.zeros(GW*GH)); continue
        q=(p[ys[0]:ys[-1]+1, xs[0]:xs[-1]+1]*255).astype(np.uint8)
        h0,w0=q.shape; nw=max(1,min(GW,int(round(w0*GH/h0))))
        c=Image.new('L',(GW,GH),0); c.paste(Image.fromarray(q).resize((nw,GH),Image.BILINEAR),((GW-nw)//2,0))
        v=np.asarray(c,float).ravel(); v-=v.mean(); v/=(np.linalg.norm(v) or 1); out.append(v)
    while len(out)<4: out.append(np.zeros(GW*GH))
    return out
byp=collections.defaultdict(list)
for i,r in enumerate(rows): byp[r['pg']].append(i)
G=[None]*len(rows)
for pg,idxs in sorted(byp.items()):
    m=colmask(spage(pg))
    for i in idxs: G[i]=split4(m,rows[i])
np.save('sglyphs.npy', np.array(G)); json.dump(rows,open('snums_f.json','w'))
print('글자 뽑기', len(rows))
