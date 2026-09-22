import json, numpy as np, collections
rows=json.load(open('qnums.json',encoding='utf8'))
asg=json.load(open('qasg.json',encoding='utf8'))
ok=json.load(open('qnums_ok.json',encoding='utf8'))
key={(r['pg'],r['x0'],r['y0']):r['no'] for r in ok}
vote=collections.defaultdict(collections.Counter)
for i,r in enumerate(rows):
    n=key.get((r['pg'],r['x0'],r['y0']))
    if n is None: continue
    s=f"{n:04d}"
    for j,c in enumerate(asg[i]):
        if c>=0: vote[c][s[j]]+=1
LAB={}
for c,v in vote.items():
    (d,n1),*rest=v.most_common()
    tot=sum(v.values())
    if n1/tot>=0.75 and n1>=2: LAB[c]=d
print('이름표 붙은 클러스터',len(LAB),'/',len(set(x for a in asg for x in a if x>=0)))
open('qlab.py','w',encoding='utf8').write('LAB='+repr(LAB)+'\n')
C=np.load('qcents.npy')
dec=[];sc=[]
for ids,gl in zip(asg,np.load('qglyphs.npy')):
    s='';m=1.0
    for j,c in enumerate(ids):
        if c<0 or c not in LAB: s+='?'; m=0; continue
        s+=LAB[c]; m=min(m,float(C[c]@gl[j]))
    dec.append(s); sc.append(m)
json.dump(dec,open('qdec.json','w')); json.dump(sc,open('qsc.json','w'))
print('네 글자 확신',sum(1 for d,x in zip(dec,sc) if d.isdigit() and x>=0.4))
