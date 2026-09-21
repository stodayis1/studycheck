import pymupdf, json, os, numpy as np
from PIL import Image
q=pymupdf.open('q.pdf'); ev=json.load(open('ev.json',encoding='utf8'))
OUT='out/q'; os.makedirs(OUT,exist_ok=True)
COL=[(73,303),(327,557)]        # 번호 오른쪽부터 칸 끝까지
FOOT=728
CH=[(2,9,1,'다항식의 연산'),(10,23,2,'나머지 정리와 인수분해'),(24,33,3,'복소수'),(34,39,4,'이차방정식'),
    (40,47,5,'이차방정식과 이차함수'),(48,59,6,'여러 가지 방정식'),(60,67,7,'일차부등식'),
    (68,75,8,'이차부등식'),(76,89,9,'순열과 조합'),(90,103,10,'행렬과 그 연산')]
def chap(pg):
    for a,b,c,t in CH:
        if a<=pg<=b: return c,t
    return None,None
def coli(x): return 0 if x<290 else 1
def trim(a,pad=6):
    ink=(a.min(2)<235); ys=np.where(ink.any(1))[0]
    return a[max(0,ys[0]-pad):ys[-1]+pad+1] if len(ys) else None
SPAN=[[z for b in p.get_text('dict')['blocks'] for l in b.get('lines',[]) for z in l['spans'] if z['text'].strip()] for p in q]
BADGE={i:[tuple(d['rect']) for d in p.get_drawings() if d['rect'].width<70 and 4<d['rect'].height<14 and d.get('fill')] for i,p in enumerate(q)}
byp={}
for e in ev: byp.setdefault(e['pg'],[]).append(e)
rows=[]; curty=None; seq={}
for e in ev:
    if e['k']=='ty': curty=e                      # 유형 제목은 다음 유형이 나올 때까지 이어진다
    if e['k']!='q': continue
    pg=e['pg']; ci=coli(e['x0']); x0,x1=COL[ci]; z=680/(x1-x0)
    later=[w for w in byp[pg] if w.get('x0') is not None and coli(w['x0'])==ci and w['y0']>e['y0']+6 and w['k'] in ('q','ty')]
    bot=min([w['y0']-6 for w in later]+[FOOT])
    top=e['y0']-4
    if bot-top<14: continue
    pm=q[pg].get_pixmap(matrix=pymupdf.Matrix(z,z),clip=pymupdf.Rect(x0,top,x1,bot))
    a=np.frombuffer(pm.samples,np.uint8).reshape(pm.height,pm.width,pm.n)[...,:3].copy()
    # 문항 맨 위의 작은 배지(기출 표시) 지우기
    txt=[w for w in SPAN[pg] if top<=w['bbox'][1]<bot and x0-4<=w['bbox'][0]<x1]
    if txt:
        ft=min(w['bbox'][1] for w in txt)
        if 2<ft-top<18:                     # 첫 글자 줄 위의 배지 띠만 지운다
            a[:max(0,int((ft-1-top)*z))]=255
    a=trim(a)
    if a is None: continue
    ch,ttl=chap(pg)
    seq[ch]=seq.get(ch,0)+1
    ty=curty
    rows.append(dict(no=e['no'],pg=pg,ch=ch,ttl=ttl,col=ci,fill=e['fill'],
                     ty=ty['no'] if ty else None, tytitle=ty['title'] if ty else None))
    nm=f"{ch:02d}{seq[ch]:03d}"          # 책 번호는 중단원마다 다시 시작하므로 단원 안 순번으로 새로 매긴다
    Image.fromarray(a).save(f"{OUT}/{nm}.png")
    rows[-1]['name']=nm; rows[-1]['booknoo']=e['no']
json.dump(rows,open('qmeta.json','w'),ensure_ascii=False)
import collections
print('문항',len(rows),'| 고유 이름',len({r['name'] for r in rows}))
print('유형 없는 문항',sum(1 for r in rows if r['ty'] is None))
print(collections.Counter(r['ch'] for r in rows))
