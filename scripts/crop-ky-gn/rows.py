import json, re, os, shutil, collections
from types_ import T, TITLE
rows=json.load(open('qmeta.json',encoding='utf8'))
am=json.load(open('ameta.json',encoding='utf8'))
# 눈으로 확인해 잡은 예외: √가 글자가 아니라 그림이라 숫자로 잘못 읽힌 것
FIXIMG={'0108S2','0603S2'}
def kind(nm):
    if nm in FIXIMG: return 'image',None
    v=am.get(nm)
    if not v: return 'image',None
    t=v['t'].replace('\u200a','').replace('\u2009','').strip()
    if re.fullmatch(r'[①②③④⑤]',t): return 'choice',t
    bad=any(f.startswith(('NPBUN','NPRUT','NPSUN','NPYP')) for f in v['f'])
    if re.fullmatch(r'-?\d+',t) and not bad and v['h']<=48: return 'number',t
    return 'image',None
out=[]; missing=[]
for r in rows:
    base=r['name'].split('S')[0]
    code=T.get(base)
    if not code: missing.append(base); continue
    ch=int(code[:2])
    k,a=('image',None) if r['k']=='ex' else kind(r['name'])
    out.append(dict(b='개념+유형 개념편',g='공통수학1',s=1,n=ch,t=TITLE[ch],l=r['name'],
                    c=f'공수1-{code}',d=None,p='필수예제' if r['k']=='ex' else '문제',
                    e=False,v=False,i=r['k']=='ex',x='png',
                    dir=f'공통수학1-1/개념유형개념편/{ch:02d}',lv=2,k=k,a=a))
print('행',len(out),'| 유형 없는 예제',set(missing))
print(collections.Counter(r['k'] for r in out), collections.Counter(r['p'] for r in out))
print('유형 수',len({r['c'] for r in out}),'| 단원',sorted(collections.Counter(r['n'] for r in out).items()))
json.dump(out,open(r'C:\Users\USER\studycheck\scripts\problems_ky_gn_cm1.json','w',encoding='utf8'),ensure_ascii=False,indent=1)
base=r'C:\Users\USER\문제은행\고등\잘린문항_개념유형개념편_공통수학1'
if os.path.exists(base): shutil.rmtree(base)
for r in out:
    dd=os.path.join(base,*r['dir'].split('/')); os.makedirs(dd,exist_ok=True)
    shutil.copy(f"out/q/{r['l']}.png",os.path.join(dd,f"{r['l']}.png"))
    shutil.copy(f"out/a/{r['l']}.png",os.path.join(dd,f"{r['l']}).png"))
print('이미지',sum(len(f) for _,_,f in os.walk(base)))
