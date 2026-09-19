import json, numpy as np, sys
from scipy import ndimage
from detect import page, divider, labels, classify, masks, d
def lum(a):
    a=a.astype(int); return (a[...,0]*299+a[...,1]*587+a[...,2]*114)//1000
def midlabels(a,x0,x1,y0,y1,M,L):
    """number-shaped colored text anywhere in the column"""
    out=[]
    for cname,m in (('red',M[0]),('green',M[1]),('blue',M[2])):
        sub=m[y0:y1,x0:x1]
        md=ndimage.binary_dilation(sub,structure=np.ones((3,11)))
        lab,n=ndimage.label(md)
        for i,s in enumerate(ndimage.find_objects(lab)):
            core=(lab[s]==i+1)&sub[s]
            ys=np.where(core.any(1))[0]; xs=np.where(core.any(0))[0]
            if not len(ys): continue
            Y0=y0+s[0].start+ys[0]; Y1=y0+s[0].start+ys[-1]+1; X0=x0+s[1].start+xs[0]; X1=x0+s[1].start+xs[-1]+1
            h=Y1-Y0; w=X1-X0
            if 21<=h<=29 and 44<=w<=70:
                fill=core.sum()/(h*w)
                if fill<0.62:
                    out.append(dict(color=cname,y0=int(Y0),y1=int(Y1),x0=int(X0),x1=int(X1),w=int(w),h=int(h),fill=round(float(fill),2),kind='num',
                                    gm=(L[Y0:Y1,X0-1:X1+1]<205).tolist()))
    return out
ALL=[]
for i in range(12,197):
    a=page(i); div=divider(a); Hh=a.shape[0]; M=masks(a); L=lum(a)
    for side,(x0,x1) in (('L',(div-700,div-20)),('R',(div+20,div+700))):
        Y0,Y1=int(Hh*.04),int(Hh*.95)
        edge=[r for r in labels(a,x0,x1,Y0,Y1) if classify(r) not in (None,'num')]
        for r in edge: r['kind']=classify(r)
        nums=midlabels(a,x0,x1,Y0,Y1,M,L)
        # drop number candidates lying inside a rep box / pill / bracket
        nums=[n for n in nums if not any(e['kind'] in('rep','pill','bracket','logo') and e['y0']-4<=n['y0'] and n['y1']<=e['y1']+4 and e['x0']-4<=n['x0'] and n['x1']<=e['x1']+4 for e in edge)]
        for r in edge+nums:
            r.update(page=i,side=side,cx0=int(x0),cx1=int(x1),div=int(div),mid=bool(r['x0']-x0>60))
            ALL.append(r)
    print(i, sum(1 for r in ALL if r['page']==i and r['kind']=='num'), flush=True)
json.dump(ALL,open('scan2.json','w'))
