from detect import *
import json, os
OUT='out/01'; os.makedirs(OUT,exist_ok=True)
EXPECT={'A':range(1,40),'B':range(40,97),'C':range(97,115)}
def ink(a): return a.min(2)<218
def inkrows(a): return ink(a).sum(1)>=3
def trim_rows(img):
    m=inkrows(img)
    r=runs(m,gap=0)
    # drop tiny trailing specks (scan dust) separated by a big gap
    while len(r)>1 and r[-1][1]-r[-1][0]<8 and r[-1][0]-r[-2][1]>30: r.pop()
    return img[r[0][0]:r[-1][1]] if r else img[:0]
def cut_end(a,x0,x1,top,nxt):
    seg=inkrows(a[top:nxt,x0:x1])
    k=len(seg)-1; skipped=0
    while k>0 and seg[k] and skipped<25: k-=1; skipped+=1
    run=0
    while k>0:
        if not seg[k]:
            run+=1
            if run>=8: return top+k+run//2
        else: run=0
        k-=1
    return nxt-4
def _old_cut_end(a,x0,x1,top,nxt):
    """end row: largest white gap in the 60px before next label, then trim"""
    lo=max(top,nxt-60); seg=ink(a[lo:nxt,x0:x1]).any(1)
    best=(0,nxt); cur=None
    for k,v in enumerate(seg):
        if not v:
            cur=k if cur is None else cur
            if k-cur+1>=best[0]: best=(k-cur+1,lo+cur)
        else: cur=None
    return best[1] if best[0]>=4 else nxt-4
def shift_first_line(img,pad=8):
    rows=inkrows(img)
    r=runs(rows,gap=2)
    if not r: return img
    y0,y1=r[0]
    cols=np.where(ink(img[y0:y1]).any(0))[0]
    if not len(cols) or cols[0]<30: return img
    xs=cols[0]; out=img.copy(); out[y0:y1]=255
    seg=img[y0:y1,xs:]; out[y0:y1,pad:pad+seg.shape[1]]=seg
    return out
def white(h,w): return np.full((h,w,3),255,np.uint8)
def vstack(parts,W=680):
    parts=[p if p.shape[1]==W else np.hstack([p,white(p.shape[0],W-p.shape[1])])[:, :W] for p in parts]
    return np.vstack(parts)
def header_band(lbl,W=680):
    lbl=trim_rows(lbl)
    # fit number line into 29px (so it sits fully inside the top 37px)
    if lbl.shape[0]>29:
        im=Image.fromarray(lbl); f=29/lbl.shape[0]
        lbl=np.array(im.resize((max(1,int(im.width*f)),29),Image.LANCZOS))
    band=white(44,W); band[6:6+lbl.shape[0],:min(W,lbl.shape[1])]=lbl[:,:W]
    return band

items=[]
pages={}
for i in range(13,28):
    a,div,its=page_items(i); pages[i]=a
    its=[r for r in its if not (r['kind']=='num' and r['h']<22)]
    items+=its
# reading order: page, side, y
items.sort(key=lambda r:(r['page'],r['side'],r['y0']))
Hh=pages[14].shape[0]
probs=[]; n=0; typ=0; bracket=None
for idx,r in enumerate(items):
    if r['kind']=='pill': bracket=None
    if r['kind']=='pill' and r['color']=='green': typ+=1
    if r['kind'] not in ('num','rep','bracket'): continue
    a=pages[r['page']]; x0,x1=r['cx0'],r['cx1']
    # next boundary in same column
    nxt=int(Hh*.945)
    for q in items[idx+1:]:
        if q['page']==r['page'] and q['side']==r['side']: nxt=q['y0']; break
    end=cut_end(a,x0,x1,r['y1'],nxt)
    if r['kind']=='bracket':
        reg=a[r['y0']-4:end, x0:x1].copy()
        reg[0:r['y1']-r['y0']+8, r['x0']-x0-3:r['x1']-x0+4]=255   # remove "[0001~0002]"
        bracket=dict(img=shift_first_line(trim_rows(reg)),left=None,src=r); continue
    n+=1
    stage='A' if r['color']=='red' and r['kind']=='num' else ('B' if r['color'] in('green',) or r['kind']=='rep' else 'C')
    if r['kind']=='num' and stage=='A':
        hdr=a[r['y0']-2:r['y1']+3, r['x0']-2:r['x1']+4]
        body=a[r['y0']-6:end, x0:x1].copy()
        body[:, :r['x1']-x0+6][0:r['y1']-r['y0']+12]=255
        parts=[header_band(hdr)]
        if bracket: parts+= [bracket['img'], white(10,680)]
        parts.append(shift_first_line(trim_rows(body)))
    else:
        bracket=None
        # the label line (number + badges): rows around label, full width
        hdr=a[r['y0']-3:r['y1']+3, x0:x1]
        body=trim_rows(a[r['y1']+4:end, x0:x1])
        parts=[header_band(hdr), white(6,680), body]
    img=vstack(parts)
    img=np.vstack([img,white(8,680)])
    no=f'{n:04d}'
    Image.fromarray(img).save(f'{OUT}/{no}.png')
    probs.append(dict(no=no,stage=stage,rep=r['kind']=='rep',type=typ if stage=='B' else None,page=r['page'],side=r['side'],y=r['y0'],grouped=(bracket['src']['page'],bracket['src']['side'],bracket['src']['y0']) if (bracket and stage=='A') else None,h=img.shape[0]))
json.dump(probs,open('probs01.json','w'),ensure_ascii=False,indent=0)
from collections import Counter
print(len(probs), Counter(p['stage'] for p in probs))
for s,rg in EXPECT.items():
    got=[int(p['no']) for p in probs if p['stage']==s]
    print(s, 'OK' if got==list(rg) else f'MISMATCH {got[:3]}..{got[-3:]} vs {rg}')
print('types B:', Counter(p['type'] for p in probs if p['stage']=='B'))
print('rep:', [p['no'] for p in probs if p['rep']])
