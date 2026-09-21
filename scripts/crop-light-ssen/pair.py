import json, numpy as np, collections
from PIL import Image
from sdet import spage
from sdet2 import inkmask
daps=json.load(open('daps.json',encoding='utf8'))
nums=json.load(open('snums.json',encoding='utf8'))
byp={}
for n in nums: byp.setdefault((n['pg'],n['half']),[]).append(n)
pairs=[]
for d in daps:
    cand=[n for n in byp.get((d['pg'],d['half']),[]) if n['y0']<=d['y']+20]
    if not cand:                      # 앞 쪽/앞 단에서 이어지는 항목
        pairs.append(dict(dap=d,num=None)); continue
    n=max(cand,key=lambda z:z['y0'])
    pairs.append(dict(dap=d,num=n))
print('답 표시',len(daps),'| 번호 붙음',sum(1 for p in pairs if p['num']))
json.dump(pairs,open('pairs.json','w'))
# 번호 이미지 글자 뽑기
GW,GH=14,20
def glyphs(mask,n):
    m=mask[n['y0']:n['y1'], n['x0']:n['x1']]
    w=m.shape[1]; col=m.sum(0); cuts=[0]
    for k in (1,2,3):
        cc=int(w*k/4); lo=max(1,cc-7); hi=min(w-1,cc+8)
        cuts.append(lo+int(np.argmin(col[lo:hi])))
    cuts.append(w); out=[]
    for i in range(4):
        p=m[:, cuts[i]:cuts[i+1]]
        ys=np.where(p.any(1))[0]; xs=np.where(p.any(0))[0]
        if not len(ys) or not len(xs): out.append(None); continue
        q=(p[ys[0]:ys[-1]+1, xs[0]:xs[-1]+1]*255).astype(np.uint8)
        v=np.asarray(Image.fromarray(q).resize((GW,GH),Image.BILINEAR),float).ravel()
        v-=v.mean(); v/=(np.linalg.norm(v) or 1); out.append(v)
    return out
G=[]; cur=None; mask=None
for p in pairs:
    if p['num'] is None: G.append(None); continue
    if p['num']['pg']!=cur: cur=p['num']['pg']; mask=inkmask(spage(cur))
    G.append(glyphs(mask,p['num']))
np.save('pairglyphs.npy', np.array([[(v if v is not None else np.zeros(GW*GH)) for v in (g or [None]*4)] for g in G]))
print('글자 추출 완료')
