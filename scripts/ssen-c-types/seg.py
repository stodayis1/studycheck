import json, numpy as np
from PIL import Image
from scipy import ndimage
rows=json.load(open('rows2.json',encoding='utf8'))
out=[]
for r in rows:
    im=Image.open(r['file']).convert('RGB'); w,h=im.size
    band=np.asarray(im.crop((int(w*0.45),0,w,min(60,h)))).astype(int)
    R,G,B=band[...,0],band[...,1],band[...,2]
    m=(G>R+18)&(G>B+18)&(G<230)            # 초록 글자만
    lab,n=ndimage.label(m)
    objs=[]
    for sl in ndimage.find_objects(lab):
        hh=sl[0].stop-sl[0].start; ww=sl[1].stop-sl[1].start
        if 8<=hh<=40 and 3<=ww<=30 and m[sl].sum()>25: objs.append((sl[1].start,sl[1].stop,sl[0].start,sl[0].stop))
    objs.sort()
    r['objs']=objs; r['w']=w
    out.append(len(objs))
import collections; print(collections.Counter(out))
json.dump(rows,open('rows3.json','w',encoding='utf8'),ensure_ascii=False)
