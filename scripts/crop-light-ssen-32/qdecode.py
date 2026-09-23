import numpy as np, json
from qlab import LAB
G=np.load('qglyphs.npy'); C=np.load('qcents.npy')
lab=np.array([LAB.get(i,'?') for i in range(len(C))])
dec=[]; sc=[]
for gl in G:
    s=''; m=1.0
    for v in gl:
        if not np.asarray(v).any(): s+='?'; m=0; continue
        sim=C@v; k=int(np.argmax(sim)); s+=lab[k]; m=min(m,float(sim[k]))
    dec.append(s); sc.append(m)
json.dump(dec,open('qdec.json','w')); json.dump(sc,open('qsc.json','w'))
good=sum(1 for d,x in zip(dec,sc) if d.isdigit() and x>=0.5)
print('해독',len(dec),'| 네 글자 확신',good)
