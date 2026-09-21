import json, numpy as np, collections
from PIL import Image
from adet import apage
nums=json.load(open('anum.json',encoding='utf8'))
GW,GH=14,20
def colmask(im):
    mx=im.max(2); mn=im.min(2)
    return (mx-mn>45)&(mx<250)&(mn<225)
MASK={pi:colmask(apage(pi)) for pi in sorted({d['pg'] for d in nums})}
def glyphs(d):
    m=MASK[d['pg']][max(0,d['y0']-2):d['y1']+2, d['x0']:d['x1']]
    w=m.shape[1]; col=m.sum(0); cuts=[0]
    for k in (1,2,3):
        cc=int(w*k/4); lo=max(1,cc-7); hi=min(w-1,cc+8)
        cuts.append(lo+int(np.argmin(col[lo:hi])))
    cuts.append(w); out=[]
    for i in range(4):
        p=m[:, cuts[i]:cuts[i+1]]
        ys=np.where(p.any(1))[0]; xs=np.where(p.any(0))[0]
        if not len(ys) or not len(xs): out.append(None); continue
        q=(p[ys[0]:ys[-1]+1, xs[0]:xs[-1]+1]*255).astype(np.uint8)
        v=np.asarray(Image.fromarray(q).resize((GW,GH),Image.BILINEAR),float).ravel()
        v-=v.mean(); v/=(np.linalg.norm(v) or 1); out.append(v)
    return out
G=[glyphs(d) for d in nums]
T=collections.defaultdict(list)
for k in range(80):
    for ch,v in zip(f"{k+1:04d}", G[k]):
        if v is not None: T[ch].append(v)
M={ch:(np.mean(v,0)/(np.linalg.norm(np.mean(v,0)) or 1)) for ch,v in T.items()}
for _ in range(5):                                   # 본보기 다듬기
    dec=[]
    for gl in G:
        dec.append(''.join('?' if v is None else max(M,key=lambda c: float(M[c]@v)) for v in gl))
    T=collections.defaultdict(list)
    for s,gl in zip(dec,G):
        for ch,v in zip(s,gl):
            if v is not None and ch!='?': T[ch].append(v)
    M={ch:(np.mean(v,0)/(np.linalg.norm(np.mean(v,0)) or 1)) for ch,v in T.items()}
digs=[str(i) for i in range(10)]
N=len(G); V=1237
# 자리별 숫자 유사도표
SIM=np.zeros((N,4,10))
for i,gl in enumerate(G):
    for p,v in enumerate(gl):
        if v is None: SIM[i,p,:]=0.0
        else:
            for k,ch in enumerate(digs): SIM[i,p,k]=float(M[ch]@v)
# 번호 v(1..1237)의 자리 숫자
D=np.zeros((V,4),dtype=int)
for v in range(1,V+1):
    s=f"{v:04d}"
    for p in range(4): D[v-1,p]=int(s[p])
SC=np.zeros((N,V))
for i in range(N):
    SC[i]=SIM[i,0,D[:,0]]+SIM[i,1,D[:,1]]+SIM[i,2,D[:,2]]+SIM[i,3,D[:,3]]
NEG=-1e9
dp=np.full((N,V),NEG); bk=np.zeros((N,V),dtype=np.int32)
dp[0]=SC[0]
for i in range(1,N):
    best=NEG; arg=-1; prev=dp[i-1]
    run=np.empty(V); argrun=np.empty(V,dtype=np.int32)
    for v in range(V):
        run[v]=best; argrun[v]=arg
        if prev[v]>best: best=prev[v]; arg=v
    dp[i]=SC[i]+run; bk[i]=argrun
    dp[i,0]=NEG
v=int(np.argmax(dp[N-1])); path=[0]*N
for i in range(N-1,-1,-1):
    path[i]=v+1; v=int(bk[i,v])
c=collections.Counter(path)
print('정렬 완료 | 중복',len([k for k,x in c.items() if x>1]),'| 범위',min(path),max(path))
agree=sum(1 for p,s in zip(path,dec) if s==f"{p:04d}")
print('OCR와 일치',agree,'/',N)
for d,p,s in zip(nums,path,dec): d['no']=p; d['ocr']=s
json.dump(nums,open('anum_ok.json','w'))
