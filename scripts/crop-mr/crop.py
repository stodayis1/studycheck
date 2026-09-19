import pymupdf, json, re
import numpy as np
from PIL import Image
q=pymupdf.open('q.pdf'); W=680
ev=json.load(open('ev.json'))
def colrange(pg,col,div):
    L0=51 if div<312 else 57; w=div-L0
    return (L0-5,div-4) if col==0 else (div+9,div+14+w)
def render(pi,rect):
    z=W/rect.width; pm=q[pi].get_pixmap(matrix=pymupdf.Matrix(z,z),clip=rect)
    return np.frombuffer(pm.samples,np.uint8).reshape(pm.height,pm.width,pm.n)[...,:3].copy()
def trim(a):
    m=a.min(2)<235; r=np.where(m.sum(1)>=2)[0]; return a[r[0]:r[-1]+1] if len(r) else a[:0]
def pad(a,t=8):
    h=a.shape[0]; o=np.full((h+t+8,W,3),255,np.uint8); o[t:t+h,:min(W,a.shape[1])]=a[:, :W]; return o
# C-section type tags (Cafe24 '유형' + digits) per page/col/y
ctag={}
for pi,p in enumerate(q):
    sp=[s for b in p.get_text('dict')['blocks'] for l in b.get('lines',[]) for s in l['spans']]
    for s in sp:
        if s['text'].strip()=='유형' and 'Cafe24' in s['font']:
            y=s['bbox'][1]; x=s['bbox'][2]
            d=''.join(z['text'].strip() for z in sorted([z for z in sp if 'Cafe24' in z['font'] and abs(z['bbox'][1]-y)<3 and x-1<=z['bbox'][0]<x+20],key=lambda z:z['bbox'][0]))
            ctag.setdefault(pi,[]).append((s['bbox'][0],y,d))
SPB=[[z_['bbox'] for b_ in p_.get_text('dict')['blocks'] for l_ in b_.get('lines',[]) for z_ in l_['spans'] if z_['text'].strip()] for p_ in q]
out=[]; bracket=None; typ=None; ch=0; prev=None
divs={e['pg']:e.get('div') for e in ev if e['k']=='num'}
for i,e in enumerate(ev):
    if e['k']=='type': typ=e['no']; continue
    if e['k']=='cpt': continue
    pg=e['pg']; div=divs.get(pg,312); x0,x1=colrange(pg,e['col'],div)
    nxt=792; xs0,xs1=x0,x1
    if e['k']=='num':
        sib=sorted([n for n in ev if n['k']=='num' and n['pg']==pg and n['col']==e['col'] and abs(n['y0']-e['y0'])<4 and n is not e],key=lambda n:n['x0'])
        if sib:
            xs0=e['x0']-3
            right=[n for n in sib if n['x0']>e['x0']]
            if right: xs1=right[0]['x0']-4
    for n in ev[i+1:]:
        if n['pg']!=pg or n['col']!=e['col']: break
        if abs(n['y0']-e['y0'])<4: continue
        top=n['y0']
        if n['k']=='num':   # tall expressions (matrices, fractions) on the next number's line reach above it
            for r_ in SPB[pg]:
                if r_[0]>=x0 and r_[2]<=x1+2 and r_[3]>n['y0']+1 and r_[1]<n['y1']-1: top=min(top,r_[1])
        nxt=top-2; break
    if e['k']=='brk':
        r=pymupdf.Rect(x0,e['y0']-3,x1,nxt); z=W/r.width; raw=render(pg,r)
        lab_w=[s_['bbox'][2] for b_ in q[pg].get_text('dict')['blocks'] for l_ in b_.get('lines',[]) for s_ in l_['spans'] if 'Hoyoyo' in s_['font'] and abs(s_['bbox'][1]-e['y0'])<2 and s_['text'].strip()==']']
        xe=(min(lab_w,key=lambda v:abs(v-e['x0'])) if lab_w else e['x0']+62)
        raw[0:int((e['y1']-e['y0']+5)*z), 0:int((xe+1-x0)*z)]=255
        img=trim(raw)
        lab=q[pg].get_textbox(pymupdf.Rect(e['x0']-1,e['y0']-1,e['x0']+70,e['y1']+1)).replace(' ','')
        m=re.search(r'~0*(\d+)',lab)
        bracket=dict(img=img,end=int(m.group(1)) if m else None,pg=pg); continue
    if e['sec']=='A' and prev not in (None,'A'): ch+=1; typ=None
    if ch==0: ch=1
    prev=e['sec']
    otop=e['y0']-3
    for r_ in SPB[pg]:
        if r_[0]>=xs0 and r_[2]<=xs1+2 and r_[3]>e['y0']+1 and r_[1]<e['y1']-1: otop=min(otop,r_[1]-2)
    r=pymupdf.Rect(x0,otop,x1,nxt); z=W/r.width
    raw=render(pg,r)
    raw[int((e['y0']-3-otop)*z):int((e['y1']+2-otop)*z), 0:int((e['nx1']+1-x0)*z)]=255
    raw[:, :max(0,int((xs0-x0)*z))]=255; raw[:, int((xs1-x0)*z):]=255   # erase printed number
    body=trim(raw)
    parts=[]
    if bracket and bracket['end'] and e['no']>bracket['end']: bracket=None
    if bracket and e['sec']=='A':
        parts=[pad(bracket['img'],4)[:-8]]
    else: bracket=None
    img=np.vstack(parts+[pad(body)]) if parts else pad(body)
    Image.fromarray(img).save(f"out/q/{e['no']:04d}.png")
    ct=None
    if e['sec'] in 'CP':
        c=[t for t in ctag.get(pg,[]) if (t[0]>div)==bool(e['col']) and abs(t[1]-e['y0'])<8]
        ct=int(c[0][2]) if c and c[0][2].isdigit() else None
    out.append(dict(no=e['no'],ch=ch,sec=e['sec'],btype=typ if e['sec']=='B' else None,ctype=ct,tags=e['tags'],pg=pg,h=int(img.shape[0]),grp=bool(parts)))
json.dump(out,open('q_meta.json','w'),ensure_ascii=False)
from collections import Counter
print(len(out),sorted(Counter(o['ch'] for o in out).items()))
print('C/P without type',[o['no'] for o in out if o['sec'] in 'CP' and not o['ctype']][:20])
print('B without type',[o['no'] for o in out if o['sec']=='B' and not o['btype']][:10],'grouped',sum(o['grp'] for o in out))
