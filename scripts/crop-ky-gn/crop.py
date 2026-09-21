import pymupdf, json, os, numpy as np
from PIL import Image
q=pymupdf.open('q.pdf'); ev=json.load(open('ev.json',encoding='utf8'))
OUT='out/q'; os.makedirs(OUT,exist_ok=True)
X0,X1=150,536                 # 본문 칸 (왼쪽 '공략 Point' 칸과 번호는 제외)
FOOT=726                      # 쪽 번호 위
z=680/(X1-X0)
def render(pg,r):
    pm=q[pg].get_pixmap(matrix=pymupdf.Matrix(z,z),clip=r)
    return np.frombuffer(pm.samples,np.uint8).reshape(pm.height,pm.width,pm.n)[...,:3].copy()
def trim(a,pad=6):
    ink=(a.min(2)<235)
    ys=np.where(ink.any(1))[0]; xs=np.where(ink.any(0))[0]
    if not len(ys): return None
    y0=max(0,ys[0]-pad); y1=min(a.shape[0],ys[-1]+pad+1)
    return a[y0:y1]
CH=[(6,27,1,'다항식의 연산'),(28,59,2,'나머지 정리와 인수분해'),(60,76,3,'복소수'),(77,99,4,'이차방정식'),
    (100,115,5,'이차방정식과 이차함수'),(116,147,6,'여러 가지 방정식'),(148,162,7,'일차부등식'),
    (163,185,8,'이차부등식'),(186,219,9,'순열과 조합'),(220,247,10,'행렬과 그 연산')]
def chap(pg):
    for a,b,c,t in CH:
        if a<=pg<=b: return c,t
    return None,None
byp={}
for e in ev: byp.setdefault(e['pg'],[]).append(e)
# 단원 안에서 예제에 1번부터 다시 번호를 매긴다 (책 번호는 중단원마다 초기화되어 겹치므로)
idx={}; seq={}
for e in ev:
    if e['k']=='ex':
        c,_=chap(e['pg'])
        if c: idx[c]=idx.get(c,0)+1; seq[(e['pg'],e['y0'])]=idx[c]
cur={}
rows=[]
for e in ev:
    if e['k'] not in ('ex','pr'): continue
    pg=e['pg']; ch,ttl=chap(pg)
    if ch is None: continue
    later=[z_ for z_ in byp[pg] if z_['y0']>e['y0']+2]
    if e['k']=='ex':
        top=e['y1']+6
        stop=[z_ for z_ in later if z_['k']=='sol']
        bot=(stop[0]['y0']-10) if stop else FOOT
        cur[ch]=seq[(e['pg'],e['y0'])]
        name=f"{ch:02d}{cur[ch]:02d}"
    else:
        top=e['y0']-7
        stop=[z_ for z_ in later if z_['k'] in ('pr','ex','check','plus','mid','big')]
        bot=(stop[0]['y0']-8) if stop else FOOT
        name=f"{ch:02d}{cur.get(ch,0):02d}S{e['sub']}"
    if bot-top<12: continue
    a=render(pg,pymupdf.Rect(X0,top,X1,bot))
    a=trim(a)
    if a is None: continue
    Image.fromarray(a).save(f"{OUT}/{name}.png")
    rows.append(dict(k=e['k'],name=name,pg=pg,ch=ch,ttl=ttl,ex=e['no'],idx=cur.get(ch),sub=e.get('sub'),title=e.get('title','')))
json.dump(rows,open('qmeta.json','w'),ensure_ascii=False)
print('자른 문항',len(rows),'| 예제',sum(1 for r in rows if r['k']=='ex'),'| 문제',sum(1 for r in rows if r['k']=='pr'))
