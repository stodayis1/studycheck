import json, os, numpy as np
from PIL import Image
from detect import page, runs
exec(open('build.py',encoding='utf8').read().split("items=[]")[0].split("OUT='out/01'")[1].split('\n',1)[1])  # reuse helpers
OUT='out/all'; os.makedirs(OUT,exist_ok=True)
A=json.load(open('ordered.json')); Q=json.load(open('qfinal.json'))
CH={q['no']:q['ch'] for q in Q}
items=[r for r in A if r.get('no') or r['kind'] in('bracket','pill','?','logo')]
Hh=2341
bypage={}
for r in items: bypage.setdefault(r['page'],[]).append(r)
gaps=[]; from digits import Reader
from scipy import ndimage
_old=json.load(open('scan_all.json')); _old=[q for q in _old if 14<=q['page']<=27 and q['kind'] in('num','rep')]
_old.sort(key=lambda q:(q['page'],q['side'],q['y0'])); RD=Reader()
for k,q in enumerate(_old):
    if q['kind']=='num': RD.learn(np.array(q['gm']),f"{k+1:04d}")
RD.finish()
def bracket_range(a,r):
    L=a[r['y0']:r['y1'], r['x0']-1:r['x1']+2].astype(int); L=(L[...,0]*299+L[...,1]*587+L[...,2]*114)//1000<205
    lab,n=ndimage.label(L); comps=sorted([(sl[1].start,sl[1].stop) for i,sl in enumerate(ndimage.find_objects(lab)) if (lab[sl]==i+1).sum()>=6])
    m=[]
    for c in comps:
        if m and c[0]<m[-1][1]-1: m[-1]=(m[-1][0],max(m[-1][1],c[1]))
        else: m.append(c)
    if len(m)<11: return None,None,len(m)
    s1=RD.read(L[:, m[1][0]:m[4][1]])[0]; s2=RD.read(L[:, m[-5][0]:m[-2][1]])[0]
    return s1,s2,len(m)
brk=[]
figs=[]; meta=[]; bracket=None; typ={}; curch=None
def ext_top(a,r,xs,xe):
    """if the expression next to the number reaches above it (braces, matrices), start higher"""
    y=r['y0']-1
    while y>r['y0']-80 and ink(a[y:y+1, r['x1']+2:min(xe,r['x1']+170)]).sum()>=1: y-=1
    return y+1 if y<r['y0']-4 else r['y0']
for pg in sorted(bypage):
    its=bypage[pg]; a=page(pg); H=a.shape[0]
    for r in its:
        r['top']=r['y0']
        if r['kind']=='num' and r['color']=='red':
            col=[q for q in its if q['side']==r['side']]
            same=sorted([q for q in col if q.get('no') and abs(q['y0']-r['y0'])<12 and q['x0']>r['x0']],key=lambda q:q['x0'])
            xe=same[0]['x0']-8 if same else r['cx1']
            r['top']=ext_top(a,r,r['x0'],xe)
    for idx,r in enumerate(its):
        if r['kind']=='pill':
            bracket=None
            if r['color']=='green': typ[curch]=typ.get(curch,0)+1; r['typeno']=typ[curch]
            continue
        if r['kind'] in('?','logo'): continue
        x0,x1=r['cx0'],r['cx1']
        col=[q for q in its if q['side']==r['side']]
        nxt=int(H*.945)
        for q in col:
            if q['y0']>r['y1']+5: nxt=q['top']; break
        end=cut_end(a,x0,x1,r['y1'],nxt)
        gp=int(inkrows(a[end:max(end,nxt-25),x0:x1]).sum())
        if gp>6 and not (r['kind']=='bracket'): gaps.append((r.get('no'),pg,r['side'],end,nxt,gp))
        if r['kind']=='bracket':
            # a figure on the right may run down past the first problem's number
            mx=x0+(x1-x0)//2; fig_end=None; y=end
            fq=next((q for q in col if q['y0']>r['y1']+5),None)
            pair=bool(fq) and any(q.get('no') and q['mid'] and abs(q['y0']-fq['y0'])<12 for q in col)
            if not pair and nxt<int(H*.945) and inkrows(a[nxt-3:nxt, mx:x1])[0]:
                y=nxt
                while y<nxt+300 and inkrows(a[y:y+1, mx:x1])[0]: y+=1
                fig_end=y
            reg=a[r['y0']-4:(fig_end or end), x0:x1].copy()
            if fig_end: reg[end-(r['y0']-4):, :mx-x0-10]=255      # keep only the figure part below the text
            reg[0:r['y1']-r['y0']+8, max(0,r['x0']-x0-3):r['x1']-x0+4]=255
            b1,b2,nc=bracket_range(a,r)
            OVR={(90,'R',823):'0584',(156,'R',624):'1047'}   # checked by eye: one glyph merged, couldn't be read
            if (pg,r['side'],r['y0']) in OVR: b2=OVR[(pg,r['side'],r['y0'])]
            bracket=dict(img=shift_first_line(trim_rows(reg)),src=(pg,r['side'],r['y0']),fig=(fig_end,mx) if fig_end else None,b1=b1,b2=b2,nc=nc,first=None); brk.append(bracket); continue
        no=r['no']; ch=CH[no]
        if ch!=curch: curch=ch
        st=Q[no-1]['st']
        if bracket and bracket['b2'] and bracket['b2'].isdigit() and bracket['first'] and no>int(bracket['b2']): bracket=None
        if bracket and bracket['first'] is None: bracket['first']=no
        # horizontal extent (side-by-side problems on one line)
        xs=r['x0']-4 if r['mid'] else x0
        same=sorted([q for q in col if q.get('no') and abs(q['y0']-r['y0'])<12 and q['x0']>r['x0']],key=lambda q:q['x0'])
        xe=same[0]['x0']-8 if same else x1
        if st=='A' and r['kind']=='num':
            hdr=a[r['y0']-2:r['y1']+3, r['x0']-2:r['x1']+4]
            t0=min(r['y0']-6, r['top']-4)
            body=a[t0:end, xs:xe].copy()
            body[r['y0']-t0-4:r['y1']-t0+6, :r['x1']-xs+6]=255
            if bracket and bracket.get('fig') and bracket['fig'][0]>t0:   # remove the instruction's figure tail
                fe,mx=bracket['fig']; body[:fe-t0, max(0,mx-xs-10):]=255
            parts=[header_band(hdr)]
            if bracket: parts+=[bracket['img'], white(10,680)]
            bd=trim_rows(body)
            parts.append(bd if r['top']<r['y0'] else shift_first_line(bd))
            grp=bracket['src'] if bracket else None
            if bracket and bracket.get('fig'): figs.append(no)
        else:
            bracket=None; grp=None
            hdr=a[r['y0']-3:r['y1']+3, xs:xe]
            body=trim_rows(a[r['y1']+4:end, xs:xe])
            parts=[header_band(hdr), white(6,680), body]
        img=np.vstack([vstack(parts),white(8,680)])
        Image.fromarray(img).save(f'{OUT}/{no:04d}.png')
        meta.append(dict(no=no,ch=ch,st=st,rep=r['kind']=='rep',type=typ.get(ch) if st=='B' else None,page=pg,side=r['side'],y=r['y0'],mid=r['mid'],ext=r['top']<r['y0'],grp=grp,h=int(img.shape[0])))
cnt={}
for m in meta:
    if m['st']=='B':
        if m['rep']: cnt[m['ch']]=cnt.get(m['ch'],0)+1
        m['type']=cnt.get(m['ch'])
typ=cnt
json.dump(meta,open('meta_all.json','w'))
from collections import Counter
json.dump([{k:v for k,v in b.items() if k!='img'} for b in brk],open('brackets.json','w'))
json.dump(gaps,open('gaps.json','w')); print('uncovered gaps',gaps)
print('bracket figures cross into problems:',figs)
print(len(meta), 'types per chapter', dict(sorted(typ.items())))
print('empty/small', [m['no'] for m in meta if m['h']<70])
