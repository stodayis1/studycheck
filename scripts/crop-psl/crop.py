import pymupdf, json, re
import numpy as np
from PIL import Image
q=pymupdf.open('q.pdf'); W=680
def spans(p): return [sp for b in p.get_text('dict')['blocks'] for l in b.get('lines',[]) for sp in l['spans']]
def divx(p,pi):
    xs=[round(dr['rect'].x0) for dr in p.get_drawings() if dr['rect'].width<2 and dr['rect'].height>300]
    return xs[0] if xs else (315 if pi%2 else 323)
def colrange(pi,p,col):
    div=divx(p,pi); L0=62 if div<320 else 71; w=div-L0
    return (L0-6,div-4) if col==0 else (div+11,div+15+w)
def render(pi,rect):
    z=W/rect.width; pm=q[pi].get_pixmap(matrix=pymupdf.Matrix(z,z),clip=rect)
    return np.frombuffer(pm.samples,np.uint8).reshape(pm.height,pm.width,pm.n)[...,:3].copy()
def trim(a):
    m=a.min(2)<235; r=np.where(m.sum(1)>=2)[0]; return a[r[0]:r[-1]+1] if len(r) else a[:0]
def pad(a):
    h=a.shape[0]; o=np.full((h+16,W,3),255,np.uint8); o[8:8+h,:min(W,a.shape[1])]=a[:, :W]; return o
ev=[]
for pi,p in enumerate(q):
    if pi<6: continue
    div=divx(p,pi); sp=spans(p)
    for s in sp:
        t=s['text'].strip(); col=int(s['bbox'][0]>div); y=s['bbox'][1]
        if s['font']=='Jalnan' and s['size']>13.5 and re.fullmatch(r'\d{2,3}',t):
            tags=[z['text'].strip() for z in sp if abs(z['bbox'][1]-y-6)<6 and 0<z['bbox'][0]-s['bbox'][2]<120 and z['size']<9]
            ev.append(dict(k='num',t=t,pg=pi,col=col,y0=y,y1=s['bbox'][3],tags=tags))
        elif s['font']=='Jalnan' and 11.5<s['size']<13 and re.fullmatch(r'\d{2}',t) and s['color']==0xffffff:
            title=' '.join(z['text'].strip() for z in sp if abs(z['bbox'][1]-y)<5 and z['bbox'][0]>s['bbox'][2] and z['bbox'][0]<s['bbox'][2]+220 and z['size']>8)
            ev.append(dict(k='type',t=int(t),title=title,pg=pi,col=col,y0=y-6,y1=y))
ev.sort(key=lambda e:(e['pg'],e['col'],e['y0']))
out=[]; ch=1; in_ex=False; btype=None
for i,e in enumerate(ev):
    if e['k']=='type':
        if in_ex and ev[i-1]['k']=='num' and len(ev[i-1]['t'])==2: pass
        btype=(ch_for_type:=None) or e['t']; e['ch']=None; continue
    ex=len(e['t'])==2
    if not ex and in_ex: ch+=1
    in_ex=ex
    nxt=790
    for n in ev[i+1:]:
        if n['pg']!=e['pg'] or n['col']!=e['col']: break
        nxt=n['y0']-2; break
    x0,x1=colrange(e['pg'],q[e['pg']],e['col'])
    body=trim(render(e['pg'],pymupdf.Rect(x0,e['y1']+2,x1,nxt)))
    no=int(e["t"]); lno=f"{ch:02d}-S{no:02d}" if ex else f"{ch:02d}-{no:03d}"
    Image.fromarray(pad(body)).save(f"out/q/{lno}.png")
    out.append(dict(l=lno,no=no,ch=ch,sec='연습' if ex else '기본',btype=None if ex else btype,tags=e['tags'],pg=e['pg'],h=int(body.shape[0])))
json.dump(out,open('q_meta.json','w'),ensure_ascii=False)
from collections import Counter
print(len(out),Counter(o['sec'] for o in out),'chapters',sorted(Counter(o['ch'] for o in out).items()))
b=[o['no'] for o in out if o['sec']=='기본']; print('basic',b[0],b[-1],'gaps',[n for n in range(1,b[-1]+1) if n not in b],'dups',[n for n in set(b) if b.count(n)>1])
for c in range(1,13):
    e=[o['no'] for o in out if o['sec']=='연습' and o['ch']==c]; print(c,'연습',len(e),'ok' if e==list(range(1,len(e)+1)) else e)
print(Counter(t for o in out for t in o['tags']))
