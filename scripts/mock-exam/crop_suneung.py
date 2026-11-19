import pymupdf, re, os, json, numpy as np
from PIL import Image
R=r"C:\Users\USER\문제은행\모의고사\2027수능"
d=pymupdf.open(os.path.join(R,"원본","27DaeSuneung_2.pdf"))
SEC=[("공통",range(0,8)),("확통",range(8,12)),("미적",range(12,16)),("기하",range(16,20))]
COLS=[(70,416),(422,772)]; Z=200/72; out=[]
for sec,pages in SEC:
    os.makedirs(os.path.join(R,"crops",sec),exist_ok=True)
    for pi in pages:
        p=d[pi]; ws=p.get_text("words")
        pix=p.get_pixmap(matrix=pymupdf.Matrix(Z,Z)); im=Image.frombytes("RGB",(pix.width,pix.height),pix.samples)
        for ci,(x0,x1) in enumerate(COLS):
            hs=sorted([(w[1],int(w[4][:-1])) for w in ws if re.fullmatch(r"\d{1,2}\.",w[4]) and x0<=w[0]<x0+40])
            for k,(y,no) in enumerate(hs):
                stop=[w[1] for w in ws if w[4]=="확인" and x0<=w[0]<x1 and w[1]>y]
                y1=hs[k+1][0]-8 if k+1<len(hs) else (min(stop)-14 if stop else 1065)
                c=im.crop([int(v*Z) for v in (x0,y-16,x1,y1)]); a=np.asarray(c.convert("L"))
                rows=np.where((a<200).sum(1)>1)[0]; cols=np.where((a<200).sum(0)>1)[0]
                c=c.crop((max(cols[0]-10,0),max(rows[0]-10,0),min(cols[-1]+10,c.width),min(rows[-1]+10,c.height)))
                f=os.path.join(R,"crops",sec,f"{no:02d}.png"); c.save(f); out.append((sec,no,pi+1,c.size))
print(len(out)); print([ (s,n) for s,n,_,_ in out])
