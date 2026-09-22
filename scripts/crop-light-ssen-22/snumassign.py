import json, numpy as np, bisect, collections
from qlab import LAB
C=np.load('qcents.npy'); ids=sorted(LAB); M=C[ids]; lab=[LAB[i] for i in ids]
rows=json.load(open('snums_f.json',encoding='utf8')); G=np.load('sglyphs.npy')
dec=[];sc=[]
for gl in G:
    s='';mn=1.0
    for v in gl:
        if not np.asarray(v).any(): s+='?'; mn=0; continue
        sim=M@v; k=int(np.argmax(sim)); s+=lab[k]; mn=min(mn,float(sim[k]))
    dec.append(s); sc.append(mn)
def assign(dec,sc,thr):
    idx=[i for i in range(len(dec)) if dec[i].isdigit() and 1<=int(dec[i])<=1200 and sc[i]>=thr]
    vals=[int(dec[i]) for i in idx]
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
keep=assign(dec,sc,0.40)
print('1차 확정',len(keep),'/',len(rows))
# 자기학습: 확정된 것으로 본보기를 다시 만든다
for it in range(3):
    T=collections.defaultdict(list)
    for i,n in keep.items():
        s=f"{n:04d}"
        for j,ch in enumerate(s): T[int(ch)].append(G[i][j])
    TK=sorted(T); TM=np.array([np.mean(T[k],0) for k in TK])
    TM/=np.linalg.norm(TM,axis=1,keepdims=True)
    dec=[];sc=[]
    for gl in G:
        s='';mn=1.0
        for v in gl:
            v=np.asarray(v)
            if not v.any(): s+='?'; mn=0; continue
            sim=TM@v; k=int(np.argmax(sim)); s+=str(TK[k]); mn=min(mn,float(sim[k]))
        dec.append(s); sc.append(mn)
    keep=assign(dec,sc,0.45)
    print('자기학습',it+1,'확정',len(keep))
out=[dict(rows[i],no=keep[i]) for i in sorted(keep)]
json.dump(out,open('snums_ok.json','w'))
mx=max(keep.values()); have=set(keep.values())
print('최대',mx,'| 빠진',len([x for x in range(1,mx+1) if x not in have]))
