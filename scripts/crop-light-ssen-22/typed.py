import json, collections
from pillmap import PM
from conmap import CM
qs=json.load(open('qnums_ok.json',encoding='utf8'))
pl=json.load(open('pills_body.json',encoding='utf8'))
cn=json.load(open('concepts.json',encoding='utf8'))
from confix import FIX
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
        t = (curC if v['sec']=='A' and curC else curP) if v['sec']=='A' else (curP or curC)
        if t: v['tcode']=t
        else: miss+=1
for q in qs:
    for a,b,c in FIX:
        if a<=q['no']<=b: q['tcode']=c
print('유형 못 붙인 문항',miss)
print('유형 수',len({q['tcode'] for q in qs if 'tcode' in q}))
print(collections.Counter(q['sec'] for q in qs if 'tcode' in q))
json.dump(qs,open('qnums_typed.json','w'),ensure_ascii=False)
