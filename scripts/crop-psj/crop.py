import pymupdf, json, re, os, sys
import numpy as np
from PIL import Image
q=pymupdf.open('q.pdf'); s=pymupdf.open('sol.pdf')
W=680
BOOKCH_START={1:1,2:67,3:154,4:214,5:290,6:387,7:459,8:556,9:625,10:721,11:787,12:858}
def bookch(n): return max(c for c,st in BOOKCH_START.items() if n>=st)
def spans(p): return [sp for b in p.get_text('dict')['blocks'] for l in b.get('lines',[]) for sp in l['spans']]
def cols(pi,p):
    xs=[round(dr['rect'].x0) for dr in p.get_drawings() if dr['rect'].width<2 and dr['rect'].height>300]
    div=xs[0] if xs else (315 if pi%2==1 else 323)
    L0=62 if pi%2==1 else 71
    w=div-L0
    return [(L0-6,div-4),(div+11,div+15+w)]
def ink_trim(a,thr=235):
    m=(a.min(2)<thr); rows=np.where(m.sum(1)>=2)[0]
    if not len(rows): return a[:0]
    # drop trailing tiny specks far below
    return a[rows[0]:rows[-1]+1]
def render(doc,pi,rect,width_pt):
    z=W/width_pt; pm=doc[pi].get_pixmap(matrix=pymupdf.Matrix(z,z),clip=rect)
    return np.frombuffer(pm.samples,np.uint8).reshape(pm.height,pm.width,pm.n)[...,:3].copy()
def pad(a,top=8,bot=8):
    h,w=a.shape[:2]; out=np.full((h+top+bot,W,3),255,np.uint8); out[top:top+h,:min(w,W)]=a[:, :W]; return out
# ---- scan question pages
Q=[]; secs={}; cur_sec=None; typ_events=[]
for pi,p in enumerate(q):
    sp=spans(p); txt=p.get_text().replace('\n','')[:200]
    if '실력' in txt and '기르는' in txt: cur_sec='유형'
    if '내신을' in txt and '서술형' in txt: cur_sec='서술형'
    if '고득점' in txt: cur_sec='고득점'
    C=cols(pi,p)
    nums={}
    for x in sp:
        if 'Leferi' in x['font'] and x['size']>14: nums.setdefault((round(x['bbox'][1]),x['bbox'][0]>300),[]).append(x)
    marks=[]   # boundaries per column
    for (y,right),ss in nums.items():
        ss.sort(key=lambda z:z['bbox'][0]); t=''.join(z['text'] for z in ss).strip()
        if re.fullmatch(r'\d{3}',t): marks.append(dict(k='num',no=int(t),col=int(right),y0=ss[0]['bbox'][1],y1=ss[0]['bbox'][3]))
    for x in sp:
        t=x['text'].strip()
        if x['font'].startswith('KoreanGD18') and re.fullmatch(r'\d{2}',t): marks.append(dict(k='type',no=int(t),col=int(x['bbox'][0]>300),y0=x['bbox'][1]-7,y1=x['bbox'][3]+7))
        if t=='풀이' and x['size']<11: marks.append(dict(k='stop',col=int(x['bbox'][0]>300),y0=x['bbox'][1]-2,y1=x['bbox'][3]))
    for m in sorted(marks,key=lambda m:(m['col'],m['y0'])):
        m['pg']=pi; m['sec']=cur_sec
        Q.append(m)
Q.sort(key=lambda m:(m['pg'],m['col'],m['y0']))
FOOT=790
out=[]; btype=None
for i,m in enumerate(Q):
    if m['k']=='type': btype=m['no']; continue
    if m['k']!='num': continue
    nxt=FOOT
    for n in Q[i+1:]:
        if n['pg']!=m['pg'] or n['col']!=m['col']: break
        nxt=n['y0']; break
    pi=m['pg']; x0,x1=cols(pi,q[pi])[m['col']]
    # difficulty badge on number line: right end of column
    band=render(q,pi,pymupdf.Rect(x1-50,m['y0'],x1,m['y1']),50)
    body=render(q,pi,pymupdf.Rect(x0,m['y1']+2,x1,nxt-2),x1-x0)
    body=ink_trim(body)
    out.append(dict(no=m['no'],pg=pi,col=m['col'],sec=m['sec'],btype=btype if m['sec']=='유형' else None,bch=bookch(m['no']),h=int(body.shape[0])))
    Image.fromarray(pad(body)).save(f"out/q/{m['no']:03d}.png")
    Image.fromarray(band).save(f"out/band/{m['no']:03d}.png")
# ---- answers
A={}
for pi,p in enumerate(s):
    lines=[l for b in p.get_text('dict')['blocks'] for l in b.get('lines',[])]
    nums=[]; ans=[]
    for l in lines:
        t=''.join(z['text'] for z in l['spans']).strip()
        if l['spans'] and 'Leferi' in l['spans'][0]['font'] and re.fullmatch(r'\d{3}',t): nums.append((l['bbox'],int(t)))
        if t.startswith('정답_'): ans.append((l['bbox'],t[3:].strip()))
    for bb,t in ans:
        col=bb[0]>300
        # owner: last number above in same column (or previous column / page)
        cands=[(nb,n) for nb,n in nums if (nb[0]>300)==col and nb[1]<bb[1]]
        n=max(cands,key=lambda z:z[0][1])[1] if cands else None
        if n is None:
            prev=[(nb,n) for nb,n in nums if not (nb[0]>300) and col]
            n=max(prev,key=lambda z:z[0][1])[1] if prev else A.get('_last')
        A[n]=dict(t=t,pg=pi,bb=list(bb)); A['_last']=n
A.pop('_last',None)
json.dump(out,open('q_meta.json','w'),ensure_ascii=False)
json.dump({int(k):v for k,v in A.items()},open('a_meta.json','w'),ensure_ascii=False)
print('problems',len(out),'answers',len(A),'missing ans',[o['no'] for o in out if o['no'] not in A][:20])
