import pymupdf, re, json
from itertools import groupby
from collections import Counter
q=pymupdf.open('q.pdf'); ev=[]
COL={0x39b66:'T',0x1f98a8:'U',0xf15c2b:'E',0x6a59a1:'X'}
for pi,p in enumerate(q):
    xs=[round(dr['rect'].x0) for dr in p.get_drawings() if dr['rect'].width<2 and dr['rect'].height>300]
    div=xs[0] if xs else 312
    sp=[s for b in p.get_text('dict')['blocks'] for l in b.get('lines',[]) for s in l['spans']]
    g={}
    for s in sp:
        if 'MyriadPro-Bold' in s['font'] and 12<s['size']<14 and s['text'].strip():
            g.setdefault((round(s['bbox'][1]),int(s['bbox'][0]>div)),[]).append(s)
    for (y,col),ss in g.items():
        ss.sort(key=lambda s:s['bbox'][0]); cl=[[ss[0]]]
        for s_ in ss[1:]:
            if s_['bbox'][0]-cl[-1][-1]['bbox'][2]>6: cl.append([s_])
            else: cl[-1].append(s_)
        for c in cl:
            t=''.join(s['text'].strip() for s in c)
            if not re.fullmatch(r'\d{4}',t): continue
            color=[s['color'] for s in c if s['color']!=0x939598]
            x1=c[-1]['bbox'][2]
            tags=[s['text'].strip() for s in sp if abs(s['bbox'][1]-y)<8 and x1-2<s['bbox'][0]<x1+160 and s['text'].strip() and s['size']<10]
            ev.append(dict(k='num',no=int(t),pg=pi,col=col,y0=c[0]['bbox'][1],y1=c[0]['bbox'][3],x0=c[0]['bbox'][0],nx1=x1,sec=COL.get(color[0] if color else 0,'?'),tags=tags,div=div))
ev.sort(key=lambda e:(e['pg'],e['col'],e['y0']))
json.dump(ev,open('ev.json','w'),ensure_ascii=False)
ns=[e['no'] for e in ev]
print(len(ns),min(ns),max(ns),'missing',[n for n in range(1,max(ns)+1) if n not in ns][:30],'dups',sorted(n for n in set(ns) if ns.count(n)>1)[:20])
print(Counter(e['sec'] for e in ev)); print([(k,len(list(g))) for k,g in groupby(e['sec'] for e in sorted(ev,key=lambda e:e['no']))][:40])
print(Counter(t for e in ev for t in e['tags']).most_common(20))
