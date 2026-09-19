import json, re, sys
from b2s import *
M=json.load(open('q_meta.json')); A=json.load(open('a_meta.json'))
TITLE={1:'다항식의 연산',2:'나머지 정리와 인수분해',3:'복소수',4:'이차방정식',5:'이차방정식과 이차함수',6:'여러 가지 방정식',7:'일차부등식',8:'이차부등식',9:'순열과 조합',10:'행렬과 그 연산'}
LV=json.loads(sys.argv[1]) if len(sys.argv)>1 else {'기본':2,'연습':3,'UP':4}
def norm(t): return re.sub(r'[\x00-\x1f`\s]','',t)
rows=[]
for m in M:
    c=m['ch']; sc=STDCH[c]
    if m['sec']=='기본': t=OVR.get(m['l']) or B2S[c][m['btype']]
    else: t=EX[c][m['no']-1]
    up='UP' in m['tags']
    lv=LV['UP'] if up else LV[m['sec']]
    a=norm(A[m['l']]['t'])
    k=('choice',a) if re.fullmatch(r'[①②③④⑤]',a) else ('number',a) if re.fullmatch(r'-?\d+',a) else ('image',None)
    rows.append(dict(b='풍산자 라이트유형',g='공통수학1',s=1,n=sc,t=TITLE[sc],l=m['l'],c=f'공수1-{sc:02d}-{t:02d}',
      d=None,p='기본' if m['sec']=='기본' else '연습',e='서술형' in m['tags'],v=False,i=up,x='png',
      dir=f'공통수학1-1/풍산자 라이트유형/{sc:02d}',lv=lv,k=k[0],a=k[1],tags=m['tags']))
json.dump(rows,open('rows.json','w'),ensure_ascii=False)
from collections import Counter
print(len(rows),Counter(r['k'] for r in rows),Counter(r['lv'] for r in rows),'types',len({r['c'] for r in rows}))
