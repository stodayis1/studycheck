import json, numpy as np
from PIL import Image
from collections import Counter
M=json.load(open('meta_all.json'))
seed={int(k):v[1] for k,v in json.load(open('ans_read.json')).items() if v[0]=='choice'}
more=json.load(open('choice_more.json'))
CH=dict(seed); CH.update({n:t for n,t in more['new']}); CH.update({n:t for n,t in more['uns']}); CH[635]='②'
CREF={int(k):v for k,v in json.load(open('cref.json')).items()}
TITLES={1:'다항식의 연산',2:'나머지 정리와 인수분해',3:'복소수',4:'이차방정식',5:'이차방정식과 이차함수',6:'여러 가지 방정식',7:'일차부등식',8:'이차부등식',9:'순열과 조합',10:'행렬과 그 연산'}
def badges(no):
    a=np.array(Image.open(f'out/all/{no:04d}.png').convert('RGB'))[4:40, 60:400]
    h=np.array(Image.fromarray(a).convert('HSV')).astype(int)
    m=(h[...,1]>80)&(h[...,2]>80); H=h[...,0]
    c=lambda lo,hi:int((m&(H>=lo)&(H<hi)).sum())
    return dict(sang=c(228,256),jung=c(135,165),ha=c(8,20),essay=c(30,40))
rows=[]; unk=[]
for m in M:
    n=m['no']; st=m['st']; b=badges(n)
    diff=None
    if st=='B':
        if m['rep']: diff='대표'
        else:
            k=max(('상',b['sang']),('중',b['jung']),('하',b['ha']),key=lambda x:x[1])
            diff=k[0] if k[1]>120 else ('하' if b['sang']<30 and b['jung']<30 else None)
            if not diff: unk.append(n)
    essay= st in 'BC' and b['essay']>400
    if st=='A': t=None
    elif st=='B': t=m['type']
    else: r=CREF[n]; t=12 if (m['ch']==1 and 12 in r) else r[-1] if False else (max(r) if False else r[0])
    level=1 if st=='A' else (4 if st=='C' or diff=='상' else 3)
    a=CH.get(n)
    rows.append(dict(b='쎈',g='공통수학1',s=1,n=m['ch'],t=TITLES[m['ch']],l=f'{n:04d}',
        c=(f"공수1-{m['ch']:02d}-{t:02d}" if t else None),d=diff,p=st,e=essay,v=False,i=bool(m['rep']),
        x='png',dir=f"공통수학1-1/쎈/{m['ch']:02d}",lv=level,k=('choice' if a else 'image'),a=a,cref=CREF.get(n)))
json.dump(rows,open('rows.json','w'),ensure_ascii=False)
print(len(rows),'B diff unknown:',unk)
print(Counter(r['p'] for r in rows), Counter(r['lv'] for r in rows), Counter(r['d'] for r in rows if r['p']=='B'))
print('essay',sum(r['e'] for r in rows),'choice',sum(r['k']=='choice' for r in rows))
