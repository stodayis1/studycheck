import json, bisect, collections
rows=json.load(open('qnums.json',encoding='utf8'))
dec=json.load(open('qdec.json',encoding='utf8'))
sc=json.load(open('qsc.json',encoding='utf8'))
N=len(rows)
# 같은 줄 묶기(25px) 후 줄→가로 순서로 다시 정렬
ordr=sorted(range(N), key=lambda i:(rows[i]['pg'], rows[i]['half'], rows[i]['y0'], rows[i]['x0']))
rowid={}; base=None; cur=(-1,-1); r=-1
for i in ordr:
    key=(rows[i]['pg'], rows[i]['half'])
    if key!=cur or base is None or rows[i]['y0']-base>25:
        r+=1; base=rows[i]['y0']; cur=key
    rowid[i]=r
ordr=sorted(range(N), key=lambda i:(rowid[i], rows[i]['x0']))
rows=[rows[i] for i in ordr]; dec=[dec[i] for i in ordr]; sc=[sc[i] for i in ordr]
idx=[i for i in range(N) if dec[i].isdigit() and 1<=int(dec[i])<=1200 and sc[i]>=0.40]
vals=[int(dec[i]) for i in idx]
# 가장 긴 증가 수열 (O(n log n))
tails=[]; tails_i=[]; prev=[-1]*len(vals)
for k,v in enumerate(vals):
    p=bisect.bisect_left(tails, v)
    if p>0: prev[k]=tails_i[p-1]
    if p==len(tails): tails.append(v); tails_i.append(k)
    else: tails[p]=v; tails_i[p]=k
k=tails_i[-1]; chain=[]
while k>=0: chain.append(k); k=prev[k]
chain.reverse()
keep={idx[k]: vals[k] for k in chain}
print('LIS 길이',len(chain),'| 범위',vals[chain[0]],'~',vals[chain[-1]])
# 사이 채우기
ch=[idx[k] for k in chain]
for a,b in zip(ch,ch[1:]):
    gi=[i for i in range(a+1,b)]
    gn=list(range(keep[a]+1, keep[b]))
    if len(gi)==len(gn):
        for i,v in zip(gi,gn): keep[i]=v
mx=max(keep.values()); have=set(keep.values())
miss=[n for n in range(1,mx+1) if n not in have]
print('번호 확정',len(keep),'| 최대',mx,'| 빠진',len(miss),miss[:12])
out=[]
for i in sorted(keep): 
    r=dict(rows[i]); r['no']=keep[i]; out.append(r)
json.dump(out,open('qnums_ok.json','w'))

def ham(a,b): return sum(1 for x,y in zip(a,b) if x!=y)
# 빠진 번호 메우기 (1) 한 글자만 다른 후보가 앞뒤 사이에 있으면 그것
pos={i:v for i,v in keep.items()}
order=sorted(range(N))
byval={v:i for i,v in keep.items()}
added=0
for n in list(miss):
    a=byval.get(n-1); b=byval.get(n+1)
    if a is None or b is None or not (a<b): continue
    cands=[i for i in range(a+1,b) if i not in keep]
    tgt=f"{n:04d}"
    close=[i for i in cands if len(dec[i])==4 and ham(dec[i],tgt)<=1]
    pick=close[0] if len(close)==1 else (cands[0] if len(cands)==1 else None)
    if pick is not None:
        keep[pick]=n; byval[n]=pick; added+=1
print('메운 번호',added,'| 최종',len(keep))
have=set(keep.values()); mx=max(have)
print('최대',mx,'| 아직 빠진',len([x for x in range(1,mx+1) if x not in have]))
out=[]
for i in sorted(keep):
    r=dict(rows[i]); r['no']=keep[i]; out.append(r)
json.dump(out,open('qnums_ok.json','w'))
