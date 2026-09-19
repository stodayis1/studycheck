import pymupdf, json, re
import numpy as np
from PIL import Image
q=pymupdf.open('q.pdf'); t=pymupdf.open('t.pdf'); W=680
nums=json.load(open('ev.json')); heads=json.load(open('heads.json'))
SP=[[s for b in p.get_text('dict')['blocks'] for l in b.get('lines',[]) for s in l['spans']] for p in q]
SPB=[[s['bbox'] for s in sp if s['text'].strip()] for sp in SP]
DIV={}
for pi,p in enumerate(q):
    xs=[round(dr['rect'].x0) for dr in p.get_drawings() if dr['rect'].width<2 and dr['rect'].height>300]
    DIV[pi]=xs[0] if xs else 312
ev=[dict(e,k='num') for e in nums]+[dict(h,k='type',y1=h['y0']+14) for h in heads]
for pi,sp in enumerate(SP):
    div=DIV[pi]
    for s in sp:
        tx=s['text'].strip()
        if 'DINPro-Black' in s['font'] and s['color']==0xffffff and re.fullmatch(r'\d{2}',tx) and 12<s['size']<14:
            nx=[z for z in sp if 'DINPro-Black' in z['font'] and z['color']!=0xffffff and abs(z['bbox'][1]-s['bbox'][1])<3 and 0<z['bbox'][0]-s['bbox'][2]<8]
            ev.append(dict(k='cpt',cn=int(nx[0]['text'].strip()) if nx and nx[0]['text'].strip().isdigit() else None,pg=pi,col=int(s['bbox'][0]>div),y0=s['bbox'][1]-4,y1=s['bbox'][3]))
        if 'MyriadPro-Bold' in s['font'] and 10<s['size']<11 and tx.startswith('['):
            ev.append(dict(k='brk',pg=pi,col=int(s['bbox'][0]>div),y0=s['bbox'][1],y1=s['bbox'][3],x0=s['bbox'][0]))
        # big section titles (시험에 꼭 나오는 문제 / 서술형 주관식 / 실력UP) are boundaries
        if (s['size']>16 and s['bbox'][1]>60 and not re.fullmatch(r'\d+',tx) and tx) or tx=='서술형':
            ev.append(dict(k='sec',pg=pi,col=int(s['bbox'][0]>div),y0=s['bbox'][1]-6,y1=s['bbox'][3]))
for pi,p in enumerate(q):
    div=DIV[pi]
    for d in p.get_drawings():
        r=d['rect']; f=d.get('fill')
        if f and 125<r.width<150 and 17<r.height<25:
            kind='서술형' if f[2]<0.85 else ('실력UP' if f[2]>0.93 and f[0]<0.88 else None)
            if kind: ev.append(dict(k='sec',sub=kind,pg=pi,col=int(r.x0>div),y0=r.y0,y1=r.y1))
ev.sort(key=lambda e:(e['pg'],e['col'],e['y0']))
def colrange(pg,col):
    div=DIV[pg]; L0=min([n['x0'] for n in nums if n['pg']==pg and n['col']==0] or [65])
    w=div-4-(L0-5)
    return (L0-5,div-4) if col==0 else (div+14,div+14+w)
def render(pi,rect):
    z=W/rect.width; pm=q[pi].get_pixmap(matrix=pymupdf.Matrix(z,z),clip=rect)
    a=np.frombuffer(pm.samples,np.uint8).reshape(pm.height,pm.width,pm.n)[...,:3].copy()
    light=(a.min(2)>205)&((a.max(2).astype(int)-a.min(2))<40)     # watermark / page tint → white
    a[light]=255
    return a
WM={pi:[s['bbox'] for s in sp if '@' in s['text'] or 'naver' in s['text']] for pi,sp in enumerate(SP)}
SMALLD={pi:[tuple(d['rect']) for d in p.get_drawings() if d['rect'].width<=13 and d['rect'].height<=13] for pi,p in enumerate(q)}
def inktop(pg,x0,x1,ytop,ybot):
    # highest y (pt) of ink that is connected (gaps<=1.5pt) to the band [ytop,ybot], scanning up at most 45pt
    z=4; r=pymupdf.Rect(x0,max(0,ytop-45),x1,ybot); pm=q[pg].get_pixmap(matrix=pymupdf.Matrix(z,z),clip=r)
    a=np.frombuffer(pm.samples,np.uint8).reshape(pm.height,pm.width,pm.n)[...,:3]
    ink=((a.max(2)<110)).sum(1)>=1          # dark ink only (grey/colour badges are ignored)
    y=int((ytop-r.y0)*z); gap=0; top=y
    while y>0:
        y-=1
        if ink[y]: gap=0; top=y
        else:
            gap+=1
            if gap>6: break
    return r.y0+top/z
def trim(a):
    m=a.min(2)<200; r=np.where(m.sum(1)>=2)[0]; return a[r[0]:r[-1]+1] if len(r) else a[:0]
def pad(a,tp=8):
    h=a.shape[0]; o=np.full((h+tp+8,W,3),255,np.uint8); o[tp:tp+h,:min(W,a.shape[1])]=a[:, :W]; return o
# E-section type labels from the teacher PDF ("유형 04" at the right of the number line)
etag={}
for pi,p in enumerate(t):
    sp=[s for b in p.get_text('dict')['blocks'] for l in b.get('lines',[]) for s in l['spans']]
    for s in sp:
        if s['text'].strip()=='유형' and s['size']<9:
            y=s['bbox'][1]; x=s['bbox'][2]
            d=''.join(z['text'].strip() for z in sorted([z for z in sp if 'DINPro' in z['font'] and abs(z['bbox'][1]-y)<4 and x-1<=z['bbox'][0]<x+11],key=lambda z:z['bbox'][0]))[:2]
            etag.setdefault(pi,[]).append((s['bbox'][0],y,d))
out=[]; bracket=None; typ=None; curch=None; sub=None; cpt=None
for i,e in enumerate(ev):
    if e['k']=='type': typ=e['no']; continue
    if e['k']=='cpt' and e.get('cn'): cpt=e['cn']
    if e['k'] in ('cpt','sec'): 
        if e['k']=='sec':
            bracket=None
            if e.get('sub'): sub=e['sub']
        continue
    pg=e['pg']; x0,x1=colrange(pg,e['col']); div=DIV[pg]
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
        if n['k']=='num':
            nsib=sorted([m for m in ev if m['k']=='num' and m['pg']==pg and m['col']==n['col'] and abs(m['y0']-n['y0'])<4 and m['x0']>n['x0']],key=lambda m:m['x0'])
            nx1_=nsib[0]['x0']-4 if nsib else x1
            top=min(top,inktop(pg,n['nx1']+3,nx1_,n['y0'],n['y1']))
        nxt=max(top-2, e['y1']+4) if e['k']=='num' else top-2
        # every sibling on the next row limits us too
        break
    if e['k']=='brk':
        r=pymupdf.Rect(x0,e['y0']-3,x1,nxt); z=W/r.width; raw=render(pg,r)
        lab_w=[s_['bbox'][2] for s_ in SP[pg] if 'MyriadPro-Bold' in s_['font'] and abs(s_['bbox'][1]-e['y0'])<2 and s_['text'].strip().endswith(']')]
        xe=(min(lab_w,key=lambda v:abs(v-e['x0'])) if lab_w else e['x0']+62)
        raw[0:int((e['y1']-e['y0']+5)*z), 0:int((xe+1-x0)*z)]=255
        lab=q[pg].get_textbox(pymupdf.Rect(e['x0']-1,e['y0']-1,e['x0']+80,e['y1']+1)).replace(' ','')
        m=re.search(r'~0*(\d+)',lab)
        bracket=dict(img=trim(raw),end=int(m.group(1)) if m else None); continue
    if e['ch']!=curch: curch=e['ch']; typ=None; sub=None
    if e['sec']!='E': sub=None
    otop=min(e['y0']-3, inktop(pg,e['nx1']+3,xs1,e['y0'],e['y1'])-2)
    r=pymupdf.Rect(x0,otop,x1,nxt); z=W/r.width
    raw=render(pg,r)
    for w in WM[pg]:
        raw[max(0,int((w[1]-otop)*z)):max(0,int((w[3]-otop)*z)), max(0,int((w[0]-x0)*z)):max(0,int((w[2]-x0)*z))]=255
    # erase printed number + its badges (대표문제 / 상중하 / 중요) on the number line
    bx=max([e['nx1']]+[s['bbox'][2] for s in SP[pg] if abs(s['bbox'][1]-e['y0'])<9 and e['nx1']-2<s['bbox'][0]<e['nx1']+70 and s['size']<9 and s['text'].strip() in ('대표문제','상','중','하','상중','중하','상중하','중요','서술형','교육청','기출','평가원','수능')])
    raw[int((e['y0']-3-otop)*z):int((e['y1']+2-otop)*z), 0:int((bx+2-x0)*z)]=255
    raw[:, :max(0,int((xs0-x0)*z))]=255; raw[:, int((xs1-x0)*z):]=255
    raw[:int((e['y1']+2-otop)*z), :int((e['nx1']+2-x0)*z)]=255      # '중요' badge above the number
    for d_ in SMALLD[pg]:          # '중요' star badge drawn right after the number
        if e['nx1']-2<=d_[0]<=e['nx1']+22 and e['y0']-4<=d_[1]<=e['y1']:
            raw[max(0,int((d_[1]-1-otop)*z)):max(0,int((d_[3]+1-otop)*z)), max(0,int((d_[0]-1-x0)*z)):max(0,int((d_[2]+1-x0)*z))]=255
    top_rows=int((e['y1']+2-otop)*z); g=raw[:top_rows].astype(int)
    col=(g.max(2)-g.min(2))>45                      # coloured badge remnants above/at the number row
    raw[:top_rows][col]=255
    body=trim(raw)
    if bracket and bracket['end'] and e['no']>bracket['end']: bracket=None
    parts=[pad(bracket['img'],4)[:-8]] if bracket else []
    img=np.vstack(parts+[pad(body)])
    Image.fromarray(img).save(f"out/q/{e['no']:04d}.png")
    d=[s['text'].strip() for s in SP[pg] if abs(s['bbox'][1]-e['y0'])<9 and e['nx1']-2<s['bbox'][0]<e['nx1']+40 and s['text'].strip() in ('상','중','하') and s['color']==0x231f20]
    et=None
    if e['sec']=='E':
        c=[tg for tg in etag.get(pg,[]) if (tg[0]>div)==bool(e['col']) and abs(tg[1]-e['y0'])<10]
        et=int(c[0][2]) if c and c[0][2].isdigit() else None
    out.append(dict(no=e['no'],ch=e['ch'],sec=e['sec'],btype=typ if e['sec'] in 'UX' else None,cpt=cpt if e['sec']=='T' else None,etype=et,sub=sub if e['sec']=='E' else None,diff=d[0] if d else None,tags=e['tags'],pg=pg,h=int(img.shape[0]),grp=bool(parts)))
json.dump(out,open('q_meta.json','w'),ensure_ascii=False)
from collections import Counter
print(len(out),sorted(Counter(o['ch'] for o in out).items()))
print('E without type',[o['no'] for o in out if o['sec']=='E' and not o['etype']][:40])
print('U/X without type',[o['no'] for o in out if o['sec'] in 'UX' and not o['btype']][:10],'grouped',sum(o['grp'] for o in out))
print('diff',Counter((o['sec'],o['diff']) for o in out))
