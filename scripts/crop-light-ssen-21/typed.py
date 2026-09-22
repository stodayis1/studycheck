import json, collections
from pillmap import PM
from conmap import CM
qs=json.load(open('qnums_ok.json',encoding='utf8'))
pl=json.load(open('pills_body.json',encoding='utf8'))
cn=json.load(open('concepts.json',encoding='utf8'))
ev=[]
for i,d in enumerate(pl):
    if PM.get(i): ev.append((d['pg'],d['half'],d['y0'],'P',PM[i]))
for i,d in enumerate(cn):
    if CM.get(i): ev.append((d['pg'],d['half'],d['y0'],'C',CM[i]))
for q in qs: ev.append((q['pg'],q['half'],q['y0'],'Q',q))
ev.sort(key=lambda e:(e[0],e[1],e[2]))
curP=curC=None; miss=0
for pg,h,y,kind,v in ev:
    if kind=='P': curP=v
    elif kind=='C': curC=v
    else:
        t = curC if v['sec']=='A' and curC else curP
        if v['sec']!='A': t=curP or curC
        if t: v['tcode']=t
        else: miss+=1
# 개념 상자가 한 쪽에 둘인 6쪽 — 직접 보고 경계를 정함 (앞 상자가 맡는 마지막 번호, 그 상자의 코드)
FIX={11:(54,'01-12'),44:(338,'03-09'),74:(536,'05-13'),93:(651,'07-06'),109:(741,'08-15'),125:(839,'09-04')}
for q in qs:
    f=FIX.get(q['pg'])
    if f and q['sec']=='A' and q['no']<=f[0]: q['tcode']=f[1]
print('유형 못 붙인 문항',miss)
print('유형 수',len({q['tcode'] for q in qs if 'tcode' in q}))
print(collections.Counter(q['sec'] for q in qs if 'tcode' in q))
json.dump(qs,open('qnums_typed.json','w',encoding='utf8'),ensure_ascii=False)
