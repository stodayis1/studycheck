import json, bisect, collections
rows=json.load(open('anums.json',encoding='utf8'))
dec=json.load(open('adec.json',encoding='utf8')); sc=json.load(open('asc.json',encoding='utf8'))
N=len(rows)
# 같은 줄 묶기 후 줄→가로 순서
ordr=sorted(range(N), key=lambda i:(rows[i]['pg'],rows[i]['half'],rows[i]['y0'],rows[i]['x0']))
rid={}; base=None; cur=(-1,-1); r=-1
for i in ordr:
    key=(rows[i]['pg'],rows[i]['half'])
    if key!=cur or base is None or rows[i]['y0']-base>20: r+=1; base=rows[i]['y0']; cur=key
    rid[i]=r
ordr=sorted(range(N), key=lambda i:(rid[i], rows[i]['x0']))
rows=[rows[i] for i in ordr]; dec=[dec[i] for i in ordr]; sc=[sc[i] for i in ordr]
idx=[i for i in range(N) if dec[i].isdigit() and 1<=int(dec[i])<=1200 and sc[i]>=0.35]
vals=[int(dec[i]) for i in idx]
tails=[];ti=[];prev=[-1]*len(vals)
for k,v in enumerate(vals):
    p=bisect.bisect_left(tails,v)
    if p>0: prev[k]=ti[p-1]
    if p==len(tails): tails.append(v); ti.append(k)
    else: tails[p]=v; ti[p]=k
k=ti[-1]; chain=[]
while k>=0: chain.append(k); k=prev[k]
chain.reverse()
keep={idx[k]: vals[k] for k in chain}
ch=[idx[k] for k in chain]
for a,b in zip(ch,ch[1:]):
    gi=list(range(a+1,b)); gn=list(range(keep[a]+1,keep[b]))
    if len(gi)==len(gn):
        for i,v in zip(gi,gn): keep[i]=v
mx=max(keep.values())
print('정답 번호 확정',len(keep),'| 최대',mx,'| 빠진',len([n for n in range(1,mx+1) if n not in set(keep.values())]))
out=[]
for i in sorted(keep):
    r=dict(rows[i]); r['no']=keep[i]; out.append(r)
json.dump(out,open('anums_ok.json','w'))
