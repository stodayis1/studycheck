import json, numpy as np, collections
from det import page
from scan2 import glyphs_of
LAB={2:'1',12:'0',0:'0',8:'6',9:'7',17:'9',3:'2',6:'5',33:'0',7:'0',
     15:'4',14:'3',21:'8',5:'4',42:'2',11:'9',1:'0',4:'3',58:'8',10:'8',
     16:'7',24:'1',23:'6',18:'2',22:'8',19:'0',62:'5',43:'8',37:'0',20:'7'}
cents=np.load('cents.npy')
T=collections.defaultdict(list)
for cid,ch in LAB.items(): T[ch].append(cents[cid])
M={ch:(np.mean(v,0)/(np.linalg.norm(np.mean(v,0)) or 1)) for ch,v in T.items()}
cand=json.load(open('cand.json',encoding='utf8'))
cache={}; out=[]
for d in cand:
    if d['pg'] not in cache: cache.clear(); cache[d['pg']]=page(d['pg'])
    gl=glyphs_of(cache[d['pg']], d['x0'], d['x1'], d['y0'], d['y1'])
    if any(v is None for v in gl): continue
    s=''; sc=[]
    for v in gl:
        b=max(M,key=lambda c: float(M[c]@v)); s+=b; sc.append(float(M[b]@v))
    d['ocr']=s; d['score']=round(min(sc),3); out.append(d)
json.dump(out,open('cand2.json','w'))
good=[d for d in out if d['score']>=0.6 and 1<=int(d['ocr'])<=1400]
c=collections.Counter(int(d['ocr']) for d in good)
print('후보',len(out),'| 통과',len(good),'| 고유',len(c))
mx=max(c); miss=[n for n in range(1,mx+1) if n not in c]
print('최대',mx,'| 빠진',len(miss),miss[:20])
print('중복',[(k,v) for k,v in c.items() if v>1][:10])
