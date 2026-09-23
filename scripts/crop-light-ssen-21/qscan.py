import json, numpy as np
from PIL import Image
from scipy import ndimage
from qdet import page, groups, color_of
GW,GH=14,20
def split_glyphs(m, g):
    x0,x1=g[0][0],g[-1][1]; y0=min(b[2] for b in g); y1=max(b[3] for b in g)
    sub=m[y0:y1, x0:x1]
    lab,_=ndimage.label(sub)
    comps=[]
    for sl in ndimage.find_objects(lab):
        w=sl[1].stop-sl[1].start; h=sl[0].stop-sl[0].start
        if w>=3 and h>=8: comps.append([sl[1].start, sl[1].stop])
    comps.sort()
    while len(comps)<4 and comps:
        i=max(range(len(comps)), key=lambda k: comps[k][1]-comps[k][0])
        a,b=comps[i]
        if b-a<14: break
        col=sub[:, a:b].sum(0); mid=(b-a)//2
        lo=max(1,mid-6); hi=min(b-a-1,mid+7)
        c=a+lo+int(np.argmin(col[lo:hi]))
        comps[i:i+1]=[[a,c],[c,b]]; comps.sort()
    out=[]
    for a,b in comps[:4]:
        p=sub[:, a:b]
        ys=np.where(p.any(1))[0]; xs=np.where(p.any(0))[0]
        if not len(ys) or not len(xs): out.append(np.zeros(GW*GH)); continue
        q=(p[ys[0]:ys[-1]+1, xs[0]:xs[-1]+1]*255).astype(np.uint8)
        # 세로를 GH에 맞추고 가로는 비율 그대로 → 가운데 정렬 (늘리면 1과 8이 비슷해진다)
        h0,w0=q.shape
        nw=max(1,min(GW,int(round(w0*GH/h0))))
        im2=Image.fromarray(q).resize((nw,GH),Image.BILINEAR)
        canvas=Image.new('L',(GW,GH),0); canvas.paste(im2,((GW-nw)//2,0))
        v=np.asarray(canvas,float).ravel()
        v-=v.mean(); v/=(np.linalg.norm(v) or 1); out.append(v)
    while len(out)<4: out.append(np.zeros(GW*GH))
    return out
if __name__=='__main__':
    rows=[]; gl=[]; braw=[]
    for i in range(173):
        im=page(i); gs,m,cand=groups(im); W=im.shape[1]
        if len(gs)<2:                       # 흑백으로 스캔된 쪽은 색으로 못 찾는다
            gs,m,cand=groups(im, dark=True)
        # 묶음 지시문 '[0029~0030]'은 번호 둘이 130px 안에 나란히 있다 → 둘 다 버린다
        keep=[]; brk=[]
        for g in cand:
            y=g[0][2]
            right=[o for o in cand if o is not g and abs(o[0][2]-y)<10 and 0<o[0][0]-g[-1][1]<130]
            left=[o for o in cand if o is not g and abs(o[0][2]-y)<10 and 0<g[0][0]-o[-1][1]<130]
            if right or left:
                if right: brk.append((g,right[0]))     # 묶음 지시문 '[a~b]'
            else: keep.append(g)
        for g,o in brk:
            braw.append(dict(pg=i,x0=int(g[0][0]),y0=int(min(b[2] for b in g)),
                             y1=int(max(b[3] for b in g)),
                             gl_a=[v.tolist() for v in split_glyphs(m,g)],
                             gl_b=[v.tolist() for v in split_glyphs(m,o)]))
        gs=keep
        for g in gs:
            rows.append(dict(pg=i,x0=int(g[0][0]),x1=int(g[-1][1]),y0=int(min(b[2] for b in g)),
                             y1=int(max(b[3] for b in g)),sec=color_of(im,g),half=0 if g[0][0]<500 else 1))
            gl.append(split_glyphs(m,g))
        if i%25==0: print('쪽',i,'누적',len(rows),flush=True)
    order=sorted(range(len(rows)), key=lambda k:(rows[k]['pg'],rows[k]['half'],rows[k]['y0'],rows[k]['x0']))
    json.dump([rows[k] for k in order],open('qnums.json','w'))
    np.save('qglyphs.npy', np.array([gl[k] for k in order]))
    json.dump(braw,open('qbrk.json','w'))
    print('번호 후보',len(rows),'| 묶음 지시문',len(braw))
