import json, numpy as np
from PIL import Image
from scipy import ndimage
from detect import masks
from digits import Reader, GW, GH
M=json.load(open('meta_all.json'))
old=json.load(open('scan_all.json')); old=[q for q in old if 14<=q['page']<=27 and q['kind'] in('num','rep')]
old.sort(key=lambda q:(q['page'],q['side'],q['y0'])); R=Reader()
for k,q in enumerate(old):
    if q['kind']=='num': R.learn(np.array(q['gm']),f"{k+1:04d}")
R.finish()
def readglyph(g):
    gy=np.where(g.any(1))[0]; gx=np.where(g.any(0))[0]; g=g[gy[0]:gy[-1]+1, gx[0]:gx[-1]+1]
    I=Image.fromarray((g*255).astype(np.uint8)).resize((GW,GH),Image.BILINEAR)
    v=np.asarray(I,float).ravel(); v-=v.mean(); v/=np.linalg.norm(v) or 1
    return max(((float(v@t),k) for k,t in R.M.items()))[1]
res={}
for m in M:
    if m['st']!='C': continue
    a=np.array(Image.open(f"out/all/{m['no']:04d}.png").convert('RGB'))[2:42, 300:]
    red,green,blue,_=masks(a)
    lum=a.astype(int).mean(2)
    gm=green & (lum<235)
    lab,n=ndimage.label(ndimage.binary_dilation(gm,np.ones((3,1))))
    comps=sorted([sl for i,sl in enumerate(ndimage.find_objects(lab)) if (lab[sl]==i+1).sum()>=12],key=lambda s:s[1].start)
    # group glyphs into numbers (gap < 6px)
    nums=[];cur=[]
    for sl in comps:
        if cur and sl[1].start-cur[-1][1].stop>11: nums.append(cur); cur=[]
        cur.append(sl)
    if cur: nums.append(cur)
    vals=[]
    for grp in nums:
        s=''.join(readglyph(gm[sl]) for sl in grp)
        vals.append(s)
    res[m['no']]=vals
json.dump(res,open('cref_raw.json','w'))
KNOWN={97:[1],98:[1,2],99:[3],100:[2,3],101:[5],102:[5],103:[2,5],104:[7],105:[3,9],106:[10],107:[11],108:[5,12],109:[5,12],110:[6,12],111:[7,12],112:[7,12],113:[7,12],114:[9,12]}
ok=sum(1 for k,v in KNOWN.items() if [int(x) for x in res[k] if x.isdigit()]==v)
print('ch01 check',ok,'/',len(KNOWN)); print({k:res[k] for k in KNOWN})
