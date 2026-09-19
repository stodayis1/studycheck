import numpy as np, json, sys
from PIL import Image
from scipy import ndimage
from digits import Reader
def cmasks(a,smin):
    h=np.array(Image.fromarray(a).convert('HSV')).astype(int); H,S,V=h[...,0],h[...,1],h[...,2]
    sat=(S>smin)&(V>70)
    return {'A':sat&((H<=24)|(H>=235)),'B':sat&(H>=55)&(H<=125),'C':sat&(H>=126)&(H<=185)}
def lum(a):
    a=a.astype(int); return (a[...,0]*299+a[...,1]*587+a[...,2]*114)//1000
def detect(smin,dil):
    allb=[]
    for pi in range(1,6):
        a=np.load(f'qa{pi}.npy'); M=cmasks(a,smin); W=a.shape[1]; L=lum(a)
        for half,(x0,x1) in enumerate(((0,W//2),(W//2,W))):
            bx=[]
            for st,m in M.items():
                md=ndimage.binary_dilation(m[:,x0:x1],structure=np.ones(dil))
                lab,n=ndimage.label(md)
                for i,s in enumerate(ndimage.find_objects(lab)):
                    sub=(lab[s]==i+1)&m[:,x0:x1][s]
                    ys=np.where(sub.any(1))[0]; xs=np.where(sub.any(0))[0]
                    if not len(ys): continue
                    y0=s[0].start+ys[0]; y1=s[0].start+ys[-1]+1; xa=s[1].start+xs[0]+x0; xb=s[1].start+xs[-1]+1+x0
                    if 15<=y1-y0<=24 and 32<=xb-xa<=62 and y0>185:
                        bx.append(dict(pg=pi,half=half,st=st,y0=int(y0),y1=int(y1),x0=int(xa),x1=int(xb),cy=(y0+y1)/2))
            bx.sort(key=lambda b:b['cy']); rows=[]
            for b in bx:
                if rows and abs(np.mean([q['cy'] for q in rows[-1]])-b['cy'])<17: rows[-1].append(b)
                else: rows.append([b])
            for ri,r in enumerate(rows):
                for b in sorted(r,key=lambda b:b['x0']): b['row']=ri; allb.append(b)
    return allb
def glyphmask(b,cache={}):
    if b['pg'] not in cache: cache[b['pg']]=lum(np.load(f"qa{b['pg']}.npy"))
    return cache[b['pg']][b['y0']:b['y1'], b['x0']-1:b['x1']+1]<205
if __name__=='__main__':
    smin=int(sys.argv[1]); dil=(int(sys.argv[2]),int(sys.argv[3]))
    B=detect(smin,dil)
    R=Reader()
    for i,b in enumerate(B[:114]): R.learn(glyphmask(b), f"{i+1:04d}")
    R.finish()
    for b in B:
        s,c=R.read(glyphmask(b)); b['dig']=s; b['conf']=round(c,3)
    seq=[int(b['dig']) if b['dig'].isdigit() else -1 for b in B]
    jumps=[(i,seq[i-1],seq[i]) for i in range(1,len(seq)) if seq[i]!=seq[i-1]+1]
    print(smin,dil,len(B),'jumps',len(jumps),jumps[:12])
    json.dump(B,open(f'qdet_{smin}_{dil[0]}_{dil[1]}.json','w'))
