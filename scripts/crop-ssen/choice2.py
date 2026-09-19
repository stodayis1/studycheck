import json, numpy as np
from PIL import Image
def load(n):
    a=np.array(Image.open(f'out/alla/{n:04d}_a.png').convert('L')); m=a<170
    ys=np.where(m.any(1))[0]; xs=np.where(m.any(0))[0]
    return m[ys[0]:ys[-1]+1, xs[0]:xs[-1]+1]
def inner(m):
    h,w=m.shape; c=m[int(h*.2):int(h*.82), int(w*.22):int(w*.78)]
    v=np.asarray(Image.fromarray((c*255).astype(np.uint8)).resize((16,20),Image.BILINEAR),float).ravel(); v-=v.mean(); return v/(np.linalg.norm(v) or 1)
def ringness(m):
    h,w=m.shape; e=np.zeros_like(m); e[:3]=1;e[-3:]=1;e[:,:3]=1;e[:,-3:]=1
    return m[e.astype(bool)].mean()
prev=json.load(open('ans_read.json'))
seed={int(k):v[1] for k,v in prev.items() if v[0]=='choice'}   # 282, all eyeballed
T={}
for n,t in seed.items(): T.setdefault(t,[]).append(inner(load(n)))
T={k:(lambda v:v/np.linalg.norm(v))(np.mean(v,0)) for k,v in T.items()}
out={}; unsure=[]
for n in range(1,1317):
    m=load(n); h,w=m.shape
    if not (19<=h<=26 and 19<=w<=26): continue
    if ringness(m)<0.18: continue
    sc=sorted(((float(inner(m)@v),k) for k,v in T.items()),reverse=True)
    if sc[0][0]>0.75 and sc[0][0]-sc[1][0]>0.15: out[n]=sc[0][1]
    else: unsure.append((n,[(round(a,2),b) for a,b in sc[:2]]))
agree=all(out.get(n)==t for n,t in seed.items())
print('choices',len(out),'seed all kept & agree:',agree,'unsure',unsure)
K={int(o['no']):o['answer_text'] for o in json.load(open('meta01.json'))}
print('ch01 mismatch',[(n,K[n],out.get(n)) for n in range(1,115) if (K[n] if K[n] and K[n] in '①②③④⑤' else None)!=out.get(n)])
json.dump(out,open('choice_final.json','w'),ensure_ascii=False)
