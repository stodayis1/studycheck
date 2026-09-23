import json, os, numpy as np, bisect, collections
S=os.path.dirname(os.path.abspath(__file__)); P=lambda f: os.path.join(S,f)
from qlab import LAB
C=np.load(P('qcents.npy')); ids=sorted(LAB); M=C[ids]; lab=[LAB[i] for i in ids]
rows=json.load(open(P('anums.json'),encoding='utf8')); G=np.load(P('aglyphs.npy'))
N=len(rows)
ordr=sorted(range(N), key=lambda i:(rows[i]['pg'],rows[i]['half'],rows[i]['y0'],rows[i]['x0']))
rid={}; base=None; cur=(-1,-1); r=-1
for i in ordr:
    k=(rows[i]['pg'],rows[i]['half'])
    if k!=cur or base is None or rows[i]['y0']-base>18: r+=1; base=rows[i]['y0']; cur=k
    rid[i]=r
ordr=sorted(range(N), key=lambda i:(rid[i], rows[i]['x0']))
rows=[rows[i] for i in ordr]; G=G[ordr]
def fix(s): return s   # 이 책은 1000번대가 있어 첫 자리를 고정하지 않는다
def lis(dec,sc,thr):
    idx=[i for i in range(len(dec)) if dec[i].isdigit() and 1<=int(dec[i])<=1222 and sc[i]>=thr]
    vals=[int(dec[i]) for i in idx]
    if not vals: return {}
    tails=[];ti=[];prev=[-1]*len(vals)
    for k,v in enumerate(vals):
        p=bisect.bisect_left(tails,v)
        if p>0: prev[k]=ti[p-1]
        if p==len(tails): tails.append(v); ti.append(k)
        else: tails[p]=v; ti[p]=k
    k=ti[-1]; ch=[]
    while k>=0: ch.append(k); k=prev[k]
    ch.reverse()
    keep={idx[k]:vals[k] for k in ch}
    c=[idx[k] for k in ch]
    for a,b in zip(c,c[1:]):
        gi=list(range(a+1,b)); gn=list(range(keep[a]+1,keep[b]))
        if len(gi)==len(gn):
            for i,v in zip(gi,gn): keep[i]=v
    return keep
dec=[];sc=[]
for gl in G:
    s='';mn=1.0
    for v in gl:
        v=np.asarray(v)
        if not v.any(): s+='?'; mn=0; continue
        sim=M@v; k=int(np.argmax(sim)); s+=lab[k]; mn=min(mn,float(sim[k]))
    dec.append(fix(s)); sc.append(mn)
keep=lis(dec,sc,0.38); print('1차',len(keep))
for it in range(6):
    T=collections.defaultdict(list)
    for i,n in keep.items():
        s=f"{n:04d}"
        for j,ch in enumerate(s): T[int(ch)].append(G[i][j])
    if len(T)<10: break
    TK=sorted(T); TM=np.array([np.mean(T[k],0) for k in TK]); TM/=np.linalg.norm(TM,axis=1,keepdims=True)
    dec=[];sc=[]
    for gl in G:
        s='';mn=1.0
        for v in gl:
            v=np.asarray(v)
            if not v.any(): s+='?'; mn=0; continue
            sim=TM@v; k=int(np.argmax(sim)); s+=str(TK[k]); mn=min(mn,float(sim[k]))
        dec.append(fix(s)); sc.append(mn)
    keep=lis(dec,sc,0.38)
def ham(a,b): return sum(1 for x,y in zip(a,b) if x!=y)
for _ in range(4):
    byval={v:i for i,v in keep.items()}; added=0
    for n in [x for x in range(1,max(keep.values())+1) if x not in byval]:
        a=byval.get(n-1); b=byval.get(n+1)
        if a is None or b is None or not (a<b): continue
        free=[i for i in range(a+1,b) if i not in keep]
        tgt=f"{n:04d}"
        close=[i for i in free if len(dec[i])==4 and ham(dec[i],tgt)<=1]
        pick=close[0] if len(close)==1 else (free[0] if len(free)==1 else None)
        if pick is not None: keep[pick]=n; byval[n]=pick; added+=1
    if not added: break
mx=max(keep.values())
print('확정',len(keep),'| 최대',mx,'| 빠진',len([x for x in range(1,mx+1) if x not in keep.values()]))
json.dump([dict(rows[i],no=keep[i]) for i in sorted(keep)],open(P('anums_ok.json'),'w'))
