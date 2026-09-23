import json, os, shutil, collections
rows=json.load(open('qnums_typed.json',encoding='utf8'))
TITLE={1:'유리수와 소수',2:'단항식의 계산',3:'다항식의 계산',4:'일차부등식',5:'일차부등식의 활용',
       6:'연립일차방정식',7:'연립일차방정식의 풀이',8:'연립일차방정식의 활용',
       9:'일차함수와 그래프 (1)',10:'일차함수와 그래프 (2)',11:'일차함수와 일차방정식의 관계'}
rows.sort(key=lambda r:r['no'])
LEVEL={'A':1,'B':2,'S':3}; STEP={'A':'A단계','B':'B단계','S':'학교시험'}
out=[]; skip=collections.Counter()
for r in rows:
    n=r['no']
    if 'tcode' not in r: skip['유형없음']+=1; continue
    if r['sec']=='S': skip['학교시험 제외']+=1; continue
    qp=f"out/q/{n:04d}.png"; ap=f"out/a/{n:04d}.png"
    if not os.path.exists(qp): skip['문항 이미지 없음']+=1; continue
    if not os.path.exists(ap): skip['정답 없음']+=1; continue
    ch=int(r['tcode'][:2])
    out.append(dict(b='라이트쎈',g='중2',s=1,n=ch,t=TITLE[ch],l=f"{n:04d}",
                    c=f"중2-1-{r['tcode']}",d=None,p=STEP[r['sec']],
                    e=False,v=False,i=False,x='png',
                    dir=f"중2-1/라이트쎈/{ch:02d}",lv=LEVEL[r['sec']],k='image',a=None))
print('업로드 대상',len(out),'| 제외',dict(skip))
print('단계',collections.Counter(r['p'] for r in out),'| 유형 수',len({r['c'] for r in out}))
print('단원',sorted(collections.Counter(r['n'] for r in out).items()))
json.dump(out,open(r'C:\Users\USER\studycheck\scripts\problems_light_m21.json','w',encoding='utf8'),ensure_ascii=False,indent=1)
base=r'C:\Users\USER\문제은행\중2-1\잘린문항_라이트쎈_중2-1'
if os.path.exists(base): shutil.rmtree(base)
for r in out:
    dd=os.path.join(base,*r['dir'].split('/')); os.makedirs(dd,exist_ok=True)
    shutil.copy(f"out/q/{r['l']}.png", os.path.join(dd, f"{r['l']}.png"))
    shutil.copy(f"out/a/{r['l']}.png", os.path.join(dd, f"{r['l']}).png"))
print('이미지',sum(len(f) for _,_,f in os.walk(base)))
