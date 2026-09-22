import json, bisect
rows=json.load(open('snums.json',encoding='utf8'))
dec=json.load(open('sdec.json',encoding='utf8')); sc=json.load(open('ssc.json',encoding='utf8'))
marks=json.load(open('smarks.json',encoding='utf8'))
W0=1732
for r in rows: r['half']=0 if r['x0']<W0//2 else 1
for m in marks: m['half']=0 if m['x']<W0//2 else 1
order=sorted(range(len(rows)), key=lambda i:(rows[i]['pg'],rows[i]['half'],rows[i]['y0'],rows[i]['x0']))
rows=[rows[i] for i in order]; dec=[dec[i] for i in order]; sc=[sc[i] for i in order]
idx=[i for i in range(len(rows)) if dec[i].isdigit() and 1<=int(dec[i])<=1085 and sc[i]>=0.72]
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
# 사이 채우기는 하지 않는다 — 간단정답 줄은 2열이라 순서로 메우면 밀린다
print('항목 번호 확정',len(keep))
byp={}
for i,r in enumerate(rows):
    if i in keep: byp.setdefault((r['pg'],r['half']),[]).append((i,r))
ans={}
for m in marks:
    lst=byp.get((m['pg'],m['half']),[])
    # 1) 같은 줄 왼쪽에 있는 번호 (간단정답 줄)
    same=[(i,r) for i,r in lst if abs(r['y0']-m['y'])<26 and r['x1']<m['x'] and m['x']-r['x1']<260]
    if same:
        i,r=max(same,key=lambda t:t[1]['x1'])
    else:
        # 같은 줄에 번호가 있는데 내 왼쪽이 아니면(= 다른 항목의 답) 건너뛴다
        rowmates=[(i,r) for i,r in lst if abs(r['y0']-m['y'])<26]
        if rowmates: continue
        up=[(i,r) for i,r in lst if r['y0']<=m['y']-20]
        if not up: continue
        i,r=max(up,key=lambda t:(t[1]['y0'],t[1]['x0']))
    v=keep[i]
    # 한 항목에 표시가 여러 개면 마지막(최종답)
    if v not in ans or (m['y'],m['x'])>(ans[v]['y'],ans[v]['x']): ans[v]=m
# 기준점 사이를 '답 표시 순서'로 메운다
W0=1732
mk=sorted(marks,key=lambda m:(m['pg'],m['half'],m['y'],m['x']))
base=None; r=-1; cur=None
for m in mk:
    key=(m['pg'],m['half'])
    if key!=cur or base is None or m['y']-base>26: r+=1; base=m['y']; cur=key
    m['row']=r
mk.sort(key=lambda m:(m['row'],m['x']))
pos={id(m):k for k,m in enumerate(mk)}
anch=sorted(((pos[id(m)],v) for v,m in ans.items()))
filled=0
for (k1,v1),(k2,v2) in zip(anch,anch[1:]):
    if k2-k1==v2-v1 and k2-k1>1:
        pass   # 메우기 끄기 (정확도 우선)
print('기준점',len(anch),'| 사이 메움',filled)
print('정답 찾은 문항',len(ans))
json.dump({str(v):m for v,m in ans.items()},open('ansmap.json','w'))
