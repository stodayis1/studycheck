import json, collections, numpy as np
from PIL import Image
from sdet import spage
from cnum import numbers
GW,GH=14,20
out=[]; glyphs=[]
for pg in range(104):
    im=spage(pg); W=im.shape[1]
    gs,m=numbers(im)
    if not gs: continue
    hist=collections.Counter(g[0][0]//10*10 for g in gs)
    peaks=[]
    for x,_ in hist.most_common():
        if all(abs(x-p)>250 for p in peaks): peaks.append(x)
        if len(peaks)==2: break
    gs=[g for g in gs if any(abs(g[0][0]-p)<=25 for p in peaks)]
    for g in gs:
        x0,x1=g[0][0],g[-1][1]; y0=min(b[2] for b in g); y1=max(b[3] for b in g)
        sub=m[y0:y1, x0:x1]; w=sub.shape[1]; col=sub.sum(0); cuts=[0]
        for k in (1,2,3):
            cc=int(w*k/4); lo=max(1,cc-7); hi=min(w-1,cc+8)
            cuts.append(lo+int(np.argmin(col[lo:hi])))
        cuts.append(w); gl=[]
        for i in range(4):
            p=sub[:, cuts[i]:cuts[i+1]]
            ys=np.where(p.any(1))[0]; xs=np.where(p.any(0))[0]
            if not len(ys) or not len(xs): gl.append(np.zeros(GW*GH)); continue
            q=(p[ys[0]:ys[-1]+1, xs[0]:xs[-1]+1]*255).astype(np.uint8)
            v=np.asarray(Image.fromarray(q).resize((GW,GH),Image.BILINEAR),float).ravel()
            v-=v.mean(); v/=(np.linalg.norm(v) or 1); gl.append(v)
        out.append(dict(pg=pg,x0=int(x0),x1=int(x1),y0=int(y0),y1=int(y1),half=0 if x0<W//2 else 1))
        glyphs.append(gl)
    if pg%25==0: print('쪽',pg,'누적',len(out),flush=True)
out2=sorted(range(len(out)), key=lambda i:(out[i]['pg'],out[i]['half'],out[i]['y0']))
json.dump([out[i] for i in out2],open('cnums.json','w'))
np.save('cglyphs.npy', np.array([glyphs[i] for i in out2]))
print('색 번호 총',len(out))
