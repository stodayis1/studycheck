import json, numpy as np
from digits import Reader
ALL=json.load(open('scan2.json'))
# reading order
def okey(r): return (r['page'],r['side'],r['y0'])
ALL.sort(key=okey)
# cluster rows: same page/side and |y0 diff|<12 -> order by x
out=[];cur=[]
for r in ALL:
    if cur and (r['page'],r['side'])==(cur[0]['page'],cur[0]['side']) and abs(r['y0']-cur[0]['y0'])<12: cur.append(r)
    else:
        out+=sorted(cur,key=lambda q:q['x0']); cur=[r]
out+=sorted(cur,key=lambda q:q['x0']); ALL=out
Q=json.load(open('qfinal.json')); EXP=[q['st'] for q in Q]
cand=[r for r in ALL if r['kind'] in('num','rep')]
# learn digits from chapter 01 labels (pages 14-27, verified earlier) — left-edge ones are in order 1..114
old=json.load(open('scan_all.json'))
old=[r for r in old if 14<=r['page']<=27 and r['kind'] in('num','rep')]
old.sort(key=lambda r:(r['page'],r['side'],r['y0']))
assert len(old)==114
R=Reader()
for k,r in enumerate(old):
    if r['kind']=='num': R.learn(np.array(r['gm']),f"{k+1:04d}")
R.finish()
for r in cand:
    if r['kind']=='num': r['dig'],r['conf']=R.read(np.array(r['gm']))
    else: r['dig'],r['conf']=None,0
    r['st']='B' if r['kind']=='rep' else {'red':'A','green':'B','blue':'C'}[r['color']]
def ham(a,b): return sum(x!=y for x,y in zip(a,b))
e=1; acc=[]; rej=[]; problems=[]
for r in cand:
    if e>len(EXP): rej.append(r); continue
    want=f"{e:04d}"
    if r['kind']=='rep':
        if EXP[e-1]=='B': r['no']=e; acc.append(r); e+=1
        else: rej.append(r)
        continue
    if r['dig']==want or (ham(r['dig'],want)<=1 and r['st']==EXP[e-1]):
        r['no']=e; acc.append(r); e+=1
    elif r['dig'].isdigit() and e < int(r['dig']) <= e+3 and r['st']==EXP[int(r['dig'])-1]:
        problems.append(('MISSING', list(range(e,int(r['dig']))), r['page'], r['side'], r['y0']))
        e=int(r['dig']); r['no']=e; acc.append(r); e+=1
    else: rej.append(r)
print('accepted',len(acc),'next expected',e,'rejected',len(rej))
for p in problems: print(p)
bad_stage=[(r['no'],r['st'],EXP[r['no']-1]) for r in acc if r['st']!=EXP[r['no']-1]]
print('stage mismatch',bad_stage[:20])
print('rejected sample',[(r['page'],r['side'],r['y0'],r['x0'],r['dig'],r['color']) for r in rej][:30])
json.dump(ALL,open('ordered.json','w'))
