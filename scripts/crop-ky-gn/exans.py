import pymupdf, json, os, numpy as np
from PIL import Image
q=pymupdf.open('q.pdf'); ev=json.load(open('ev.json',encoding='utf8'))
rows=json.load(open('qmeta.json',encoding='utf8'))
OUT='out/a'; os.makedirs(OUT,exist_ok=True)
X0,X1=150,536; z=680/(X1-X0)
byp={}
for e in ev: byp.setdefault(e['pg'],[]).append(e)
DR={i:[d['rect'] for d in p.get_drawings() if d['rect'].width>300 and d['rect'].height>15] for i,p in enumerate(q)}
def trim(a,pad=5):
    ink=(a.min(2)<235); ys=np.where(ink.any(1))[0]
    return a[max(0,ys[0]-pad):ys[-1]+pad+1] if len(ys) else None
n=0
for r in rows:
    if r['k']!='ex': continue
    pg=r['pg']
    sol=[e for e in byp[pg] if e['k']=='sol']
    ex=[e for e in byp[pg] if e['k']=='ex' and e['pg']==pg]
    me=[e for e in ex if e['no']==r['ex']][0]
    s0=[e for e in sol if e['y0']>me['y0']]
    if not s0: print('풀이 없음',r['name']); continue
    top=s0[0]['y0']-6
    after=[e for e in byp[pg] if e['y0']>top+10 and e['k'] in ('prhead','ex','mid','check','plus')]
    bot=after[0]['y0']-6 if after else 726
    boxes=[b for b in DR[pg] if b.y0>=top-4 and b.y1<=bot+6]
    if boxes: bot=min(bot,max(b.y1 for b in boxes)+5)
    pm=q[pg].get_pixmap(matrix=pymupdf.Matrix(z,z),clip=pymupdf.Rect(X0,top,X1,bot))
    a=np.frombuffer(pm.samples,np.uint8).reshape(pm.height,pm.width,pm.n)[...,:3].copy()
    a=trim(a)
    if a is None: continue
    Image.fromarray(a).save(f"{OUT}/{r['name']}.png"); n+=1
print('예제 정답(풀이)',n)
