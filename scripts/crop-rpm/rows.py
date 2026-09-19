import json, re, os, shutil
from rtypes import *
from collections import Counter
M=json.load(open('q_meta.json')); AN=json.load(open('a_meta.json'))
TITLE={1:'다항식의 연산',2:'나머지 정리와 인수분해',3:'복소수',4:'이차방정식',5:'이차방정식과 이차함수',6:'여러 가지 방정식',7:'일차부등식',8:'이차부등식',9:'순열과 조합',10:'행렬과 그 연산'}
rows=[]
for m in M:
    n=m['no']; c=m['ch']; sc=BCH[c]
    if m['sec']=='T': t=CPT[c][m['cpt']]; p='교과서 문제'; lv=2
    elif m['sec'] in 'UX':
        t=B2S[c][m['btype']]; p='유형 익히기' if m['sec']=='U' else '발전 유형'
        lv=4 if (m['sec']=='X' or m['diff']=='상') else 3
    else:
        t=B2S[c][m['etype']]; p={'서술형':'서술형 주관식','실력UP':'실력UP'}.get(m['sub'],'시험에 꼭 나오는 문제')
        lv=4 if m['sub']=='실력UP' else 3
    d='대표' if '대표문제' in m['tags'] else m['diff'] if m['sec'] in 'UX' else None
    v=AN[str(n)]
    raw=v['full'].replace('\xad','').replace('`','').strip()
    if v['multi']: k=('image',None)
    elif re.fullmatch(r'[①②③④⑤]',raw): k=('choice',raw)
    elif re.fullmatch(r'-?\d+',raw) and not any(('root' in f or 'bunsu' in f or 'paren' in f) for f in v['fonts']) and v['h']<=40: k=('number',raw)
    else: k=('image',None)
    rows.append(dict(b='RPM',g='공통수학1',s=1,n=sc,t=TITLE[sc],l=f'{n:04d}',c=f'공수1-{sc:02d}-{t:02d}',d=d,p=p,e=m['sub']=='서술형',v=False,i=d=='대표',x='png',dir=f'공통수학1-1/RPM/{sc:02d}',lv=lv,k=k[0],a=k[1]))
json.dump(rows,open(r'C:\Users\USER\studycheck\scripts\problems_rpm_cm1.json','w',encoding='utf8'),ensure_ascii=False,indent=1)
base=r'C:\Users\USER\문제은행\고등\잘린문항_RPM_공통수학1'
if os.path.exists(base): shutil.rmtree(base)
for r in rows:
    dd=os.path.join(base,*r['dir'].split('/')); os.makedirs(dd,exist_ok=True)
    shutil.copy(f"out/q/{r['l']}.png",os.path.join(dd,f"{r['l']}.png")); shutil.copy(f"out/a/{r['l']}_a.png",os.path.join(dd,f"{r['l']}).png"))
print(len(rows),Counter(r['p'] for r in rows),Counter(r['lv'] for r in rows),Counter(r['k'] for r in rows),'types',len({r['c'] for r in rows}))
print('dups',[k for k,c in Counter((r['n'],r['l']) for r in rows).items() if c>1],'files',sum(len(f) for _,_,f in os.walk(base)))
