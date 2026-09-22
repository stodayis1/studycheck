# 확정된 번호가 실제 그림과 맞는지 다시 확인한다 (해독값 ≠ 배정값이면 의심)
import json, os, collections
import numpy as np
S=os.path.dirname(os.path.abspath(__file__)); P=lambda f: os.path.join(S,f)
rows0=json.load(open(P('qnums.json'),encoding='utf8')); G0=np.load(P('qglyphs.npy'))
ok=json.load(open(P('qnums_ok.json'),encoding='utf8'))
key={(r['pg'],r['x0'],r['y0']):r['no'] for r in ok}
T=collections.defaultdict(list)
for i,r in enumerate(rows0):
    n=key.get((r['pg'],r['x0'],r['y0']))
    if n is None: continue
    s=f"{n:04d}"
    for j,ch in enumerate(s): T[int(ch)].append(G0[i][j])
TK=sorted(T); TM=np.array([np.mean(T[k],0) for k in TK]); TM/=np.linalg.norm(TM,axis=1,keepdims=True)
bad=[]; good=0
for i,r in enumerate(rows0):
    n=key.get((r['pg'],r['x0'],r['y0']))
    if n is None: continue
    s=''; mn=1.0
    for v in G0[i]:
        v=np.asarray(v)
        if not v.any(): s+='?'; mn=0; continue
        sim=TM@v; k=int(np.argmax(sim)); s+=str(TK[k]); mn=min(mn,float(sim[k]))
    s='0'+s[1:] if len(s)==4 else s
    if s==f"{n:04d}": good+=1
    else: bad.append((n,s,round(mn,2)))
print('일치',good,'| 불일치',len(bad))
print(bad[:30])
json.dump([b[0] for b in bad],open(P('suspect.json'),'w'))
