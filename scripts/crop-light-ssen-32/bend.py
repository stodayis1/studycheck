# 묶음 지시문 '[0128~0129]'에서 뒤 번호(범위 끝)만 읽는다. 앞 번호는 '[' 가 붙어 잘 안 읽힌다
import json, numpy as np, collections
from qlab import LAB
C=np.load('qcents.npy'); ids=sorted(LAB); M=C[ids]; lab=[LAB[i] for i in ids]
brk=json.load(open('qbrk.json',encoding='utf8'))
rows=json.load(open('qnums_ok.json',encoding='utf8'))
byp=collections.defaultdict(list)
for r in rows: byp[r['pg']].append(r['no'])
out=[]; ok=0
for b in brk:
    s=''; m=1
    for v in b['gl_b']:
        v=np.asarray(v,float)
        if not v.any(): s=''; break
        sim=M@v; k=int(np.argmax(sim)); s+=lab[k]; m=min(m,float(sim[k]))
    e=int(s) if s.isdigit() else None
    ns=byp.get(b['pg'],[])
    if e is not None and ns and not (min(ns)-3<=e<=max(ns)+3): e=None
    if e is not None and m<0.32: e=None
    if e is not None: ok+=1
    out.append(dict(pg=b['pg'],x0=b['x0'],y0=b['y0'],y1=b['y1'],end=e))
json.dump(out,open('qbrk_end.json','w'))
print('범위 끝 읽음',ok,'/',len(brk))
