import json, bisect, collections, numpy as np
rows=json.load(open('fnums.json',encoding='utf8'))
d=json.load(open('fdec.json',encoding='utf8')); dec=d['dec']; conf=d['conf']
N=len(rows)
# 줄 묶기 후 줄→가로 순서
ordr=sorted(range(N), key=lambda i:(rows[i]['pg'],rows[i]['half'],rows[i]['y0'],rows[i]['x0']))
rid={}; base=None; cur=(-1,-1); r=-1
for i in ordr:
    k=(rows[i]['pg'],rows[i]['half'])
    if k!=cur or base is None or rows[i]['y0']-base>16: r+=1; base=rows[i]['y0']; cur=k
    rid[i]=r
ordr=sorted(range(N), key=lambda i:(rid[i],rows[i]['x0']))
rows=[rows[i] for i in ordr]; dec=[dec[i] for i in ordr]; conf=[conf[i] for i in ordr]
idx=[i for i in range(N) if 1<=dec[i]<=1200 and conf[i]>=0.62]
vals=[dec[i] for i in idx]
tails=[]; ti=[]; prev=[-1]*len(vals)
for k,v in enumerate(vals):
    p=bisect.bisect_left(tails,v)
    if p>0: prev[k]=ti[p-1]
    if p==len(tails): tails.append(v); ti.append(k)
    else: tails[p]=v; ti[p]=k
k=ti[-1]; chain=[]
while k>=0: chain.append(k); k=prev[k]
chain.reverse()
keep={idx[k]:vals[k] for k in chain}
print('LIS',len(chain),'범위',vals[chain[0]],'~',vals[chain[-1]])
ch=[idx[k] for k in chain]
for a,b in zip(ch,ch[1:]):
    gi=list(range(a+1,b)); gn=list(range(keep[a]+1,keep[b]))
    if len(gi)==len(gn):
        for i,v in zip(gi,gn): keep[i]=v
mx=max(keep.values())
print('확정',len(keep),'| 최대',mx,'| 빠진',mx-len(keep))
out=[dict(rows[i],no=keep[i]) for i in sorted(keep)]
json.dump(out,open('fnums_ok.json','w'))
print(collections.Counter(r['sec'] for r in out))
