# pass 1: detect labels on every page of the problem PDF, read their digits
import json, numpy as np, sys
from detect import page_items, d
from digits import Reader
def lum(a):
    a=a.astype(int); return (a[...,0]*299+a[...,1]*587+a[...,2]*114)//1000
ALL=[]
start=int(sys.argv[1]) if len(sys.argv)>1 else 12
for i in range(start,len(d)):
    a,div,its=page_items(i)
    its=[r for r in its if not (r['kind']=='num' and r['h']<22)]
    L=lum(a)
    for r in its:
        if r['kind']=='num':
            r['gm']=(L[r['y0']:r['y1'], r['x0']-1:r['x1']+1]<205).tolist()
        r['div']=int(div)
    ALL+=its
    kinds=' '.join(f"{r['side']}{r['kind'][0]}{r['color'][0]}" for r in its)
    print(i, kinds, flush=True)
json.dump(ALL,open('scan_all.json','w'))
