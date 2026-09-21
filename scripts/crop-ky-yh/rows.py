import json, os, shutil, collections
from types_ import T, TITLE
rows=json.load(open('qmeta.json',encoding='utf8'))
K=json.load(open('kinds.json',encoding='utf8'))
FIXIMG={'04004','06046','08035'}      # 눈으로 확인: √10, 3/7, 1/6 — 글자로는 숫자로 읽힘
DIFF={0:'하',1:'하',2:'중',3:'상'}
LEVEL={0:2,1:2,2:3,3:4}
out=[]; miss=[]
for r in rows:
    code=T.get(r['sec'],{}).get(r['ty'])
    if not code: miss.append((r['sec'],r['ty'],r['tytitle'])); continue
    ch=int(code[:2])
    k,a=K[r['name']]
    if r['name'] in FIXIMG: k,a='image',None
    out.append(dict(b='개념+유형 유형편',g='공통수학1',s=1,n=ch,t=TITLE[ch],l=r['name'],
                    c=f'공수1-{code}',d=DIFF[r['fill']],p='유형',e=False,v=False,i=False,x='png',
                    dir=f'공통수학1-1/개념유형유형편/{ch:02d}',lv=LEVEL[r['fill']],k=k,a=a))
print('행',len(out),'| 유형 대응 없음',set(miss))
print(collections.Counter(r['k'] for r in out), collections.Counter(r['lv'] for r in out))
print('유형 수',len({r['c'] for r in out}),'| 단원',sorted(collections.Counter(r['n'] for r in out).items()))
json.dump(out,open(r'C:\Users\USER\studycheck\scripts\problems_ky_yh_cm1.json','w',encoding='utf8'),ensure_ascii=False,indent=1)
base=r'C:\Users\USER\문제은행\고등\잘린문항_개념유형유형편_공통수학1'
if os.path.exists(base): shutil.rmtree(base)
for r in out:
    dd=os.path.join(base,*r['dir'].split('/')); os.makedirs(dd,exist_ok=True)
    shutil.copy(f"out/q/{r['l']}.png",os.path.join(dd,f"{r['l']}.png"))
    shutil.copy(f"out/a/{r['l']}.png",os.path.join(dd,f"{r['l']}).png"))
print('이미지',sum(len(f) for _,_,f in os.walk(base)))
