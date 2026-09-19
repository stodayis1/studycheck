import json, numpy as np, subprocess, os
from PIL import Image
from scipy import ndimage
from concurrent.futures import ThreadPoolExecutor
TESS=r'C:\Program Files\Tesseract-OCR\tesseract.exe'
os.makedirs('ocrtmp',exist_ok=True)
def load(n):
    a=np.array(Image.open(f'out/alla/{n:04d}_a.png').convert('L')); m=a<170
    ys=np.where(m.any(1))[0]; xs=np.where(m.any(0))[0]
    return a[ys[0]:ys[-1]+1, xs[0]:xs[-1]+1], m[ys[0]:ys[-1]+1, xs[0]:xs[-1]+1]
def vec(m,size=(24,24)):
    v=np.asarray(Image.fromarray((m*255).astype(np.uint8)).resize(size,Image.BILINEAR),float).ravel(); v-=v.mean(); return v/(np.linalg.norm(v) or 1)
# circled-digit templates from ch01 answers typed & checked earlier
K=json.load(open('meta01.json'))
T={}
for o in K:
    t=o['answer_text']
    if t and t in '①②③④⑤' and len(t)==1:
        g,m=load(int(o['no'])); T.setdefault(t,[]).append(vec(m))
T={k:(lambda v:v/np.linalg.norm(v))(np.mean(v,0)) for k,v in T.items()}
print('templates',sorted(T))
def ocr(n,g):
    p=f'ocrtmp/a{n}.png'; I=Image.fromarray(g); I=I.resize((I.width*3,I.height*3),Image.LANCZOS)
    Image.fromarray(np.pad(np.array(I),30,constant_values=255)).save(p)
    r=subprocess.run([TESS,p,'stdout','--psm','7','-c','tessedit_char_whitelist=-0123456789'],capture_output=True,text=True)
    return r.stdout.strip()
res={}; jobs=[]
for n in range(1,1317):
    g,m=load(n); h,w=m.shape
    lab,nc=ndimage.label(m)
    if 16<=h<=30 and w<=34:
        sc=sorted(((float(vec(m)@v),k) for k,v in T.items()),reverse=True)
        if sc[0][0]>0.80 and sc[0][0]-sc[1][0]>0.08: res[n]=('choice',sc[0][1],round(sc[0][0],2)); continue
    # plain integers: single text line, no fractions/letters (short height), no wide shapes
    if h<=24 and w<=120: jobs.append((n,g))
with ThreadPoolExecutor(8) as ex:
    outs=list(ex.map(lambda j: ocr(*j), jobs))
import re
for (n,g),t in zip(jobs,outs):
    if re.fullmatch(r'-?\d{1,6}',t): res[n]=('number',t,None)
json.dump(res,open('ans_read.json','w'),ensure_ascii=False)
from collections import Counter
print(Counter(v[0] for v in res.values()), 'of 1316')
# check against ch01 hand-typed
bad=[(int(o['no']),o['answer_text'],res.get(int(o['no']))) for o in K if (o['answer_text'] or None)!=(res.get(int(o['no']),(None,None))[1])]
print('ch01 disagreements',bad)
