import json, re, os, shutil
from mtypes import *
from collections import Counter
M=json.load(open('q_meta.json')); AN=json.load(open('a_meta.json'))
TITLE={1:'다항식의 연산',2:'나머지 정리와 인수분해',3:'복소수',4:'이차방정식',5:'이차방정식과 이차함수',6:'여러 가지 방정식',7:'일차부등식',8:'이차부등식',9:'순열과 조합',10:'행렬과 그 연산'}
SEC={'A':'A 개념확인','B':'B 유형','C':'유형점검','P':'C 실력향상'}
def norm(t): return re.sub(r'[\x00-\x1f`\s]','',t)
rows=[]
for m in M:
    n=m['no']; sc=BCH[m['ch']]
    if m['sec']=='A': t=A[n]
    elif m['sec']=='B': t=B2S[m['ch']][m['btype']]
    elif m['no'] in MAN: t=MAN[n]
    else: t=B2S[m['ch']][m['ctype']]
    d=next((x for x in m['tags'] if x in('하','중','상')),'대표' if '대표 문제' in m['tags'] else None)
    lv={'A':1,'C':3,'P':4}.get(m['sec']) or (4 if d=='상' else 3)
    a=norm(AN[str(n)]['full'])
    k=('choice',a) if re.fullmatch(r'[①②③④⑤]',a) else ('number',a) if re.fullmatch(r'-?\d+',a) else ('image',None)
    rows.append(dict(b='유형만렙',g='공통수학1',s=1,n=sc,t=TITLE[sc],l=f'{n:04d}',c=f'공수1-{sc:02d}-{t:02d}',d=d if m['sec']=='B' else None,
      p=SEC[m['sec']],e='서술형' in m['tags'],v=False,i=d=='대표',x='png',dir=f'공통수학1-1/유형만렙/{sc:02d}',lv=lv,k=k[0],a=k[1]))
json.dump(rows,open(r'C:\Users\USER\studycheck\scripts\problems_mr_cm1.json','w',encoding='utf8'),ensure_ascii=False,indent=1)
base=r'C:\Users\USER\문제은행\고등\잘린문항_유형만렙_공통수학1'
for r in rows:
    dd=os.path.join(base,*r['dir'].split('/')); os.makedirs(dd,exist_ok=True)
    shutil.copy(f"out/q/{r['l']}.png",os.path.join(dd,f"{r['l']}.png")); shutil.copy(f"out/a/{r['l']}_a.png",os.path.join(dd,f"{r['l']}).png"))
print(len(rows),Counter(r['p'] for r in rows),Counter(r['lv'] for r in rows),Counter(r['k'] for r in rows),'types',len({r['c'] for r in rows}))
print('dups',[k for k,c in Counter((r['n'],r['l']) for r in rows).items() if c>1],'files',sum(len(f) for _,_,f in os.walk(base)))
