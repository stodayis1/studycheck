import json, numpy as np, collections
nums=json.load(open('cnums.json',encoding='utf8'))
G=np.load('cglyphs2.npy')
N=len(G); V=1237
T=collections.defaultdict(list)
for k in range(12):                       # 눈으로 확인한 0001~0012
    for ch,v in zip(f"{k+1:04d}", G[k+2]):
        if v.any(): T[ch].append(v)
SEED={ch:list(v) for ch,v in T.items()}
def mk(T):
    out={}
    for ch in SEED:
        vs=list(T.get(ch,[]))+SEED[ch]          # 확인된 본보기는 항상 유지
        m=np.mean(vs,0); out[ch]=m/(np.linalg.norm(m) or 1)
    return out
M=mk(T)
for it in range(6):
    dec=[''.join('?' if not v.any() else max(M,key=lambda c: float(M[c]@v)) for v in g) for g in G]
    # 증가 수열을 이루는 것만 믿고 본보기 보강
    good=[]; last=0
    for i,s in enumerate(dec):
        if s.isdigit() and last<int(s)<=V: good.append(i); last=int(s)
    T=collections.defaultdict(list)
    for i in good:
        for ch,v in zip(dec[i],G[i]):
            if v.any(): T[ch].append(v)
    M=mk(T)
print('믿을 만한 번호',len(good))
digs=[str(i) for i in range(10)]
D=np.array([[int(c) for c in f"{v:04d}"] for v in range(1,V+1)])
SIM=np.zeros((N,4,10))
for i in range(N):
    for p in range(4):
        v=G[i][p]
        if v.any():
            for j,ch in enumerate(digs): SIM[i,p,j]=float(M[ch]@v)
SC=SIM[:,0,D[:,0]]+SIM[:,1,D[:,1]]+SIM[:,2,D[:,2]]+SIM[:,3,D[:,3]]
SKIP=1.5; NEG=-1e9
dp=np.full((N,V+1),NEG); bk=np.zeros((N,V+1),dtype=np.int32)
dp[0,1:]=SC[0]; dp[0,0]=SKIP
for i in range(1,N):
    prev=dp[i-1]; best=NEG; arg=0
    run=np.empty(V+1); argrun=np.empty(V+1,dtype=np.int32)
    for v in range(V+1):
        run[v]=best; argrun[v]=arg
        if prev[v]>best: best=prev[v]; arg=v
    dp[i,1:]=SC[i]+run[1:]; bk[i,1:]=argrun[1:]
    dp[i,0]=prev.max()+SKIP; bk[i,0]=int(np.argmax(prev))
v=int(np.argmax(dp[N-1])); assign={}
for i in range(N-1,-1,-1):
    if v>0: assign[i]=v
    v=int(bk[i,v])
agree=sum(1 for i,val in assign.items() if dec[i]==f"{val:04d}")
print('번호 붙음',len(assign),'| OCR 일치',agree,'/',len(assign))
json.dump({str(k):v for k,v in assign.items()},open('cassign.json','w'))
json.dump(dec,open('cdec.json','w'))
