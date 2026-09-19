import pymupdf, json
from collections import Counter
q=pymupdf.open('q.pdf'); M=json.load(open('q_meta.json')); ev={e['no']:e for e in json.load(open('ev.json'))}
cache={}
def pageinfo(pi):
    if pi not in cache:
        p=q[pi]
        chars=[]
        for b in p.get_text('rawdict')['blocks']:
            for l in b.get('lines',[]):
                for s in l['spans']:
                    if s['size']<8 and 'YDVYGO13' in s['font']:
                        for c in s['chars']:
                            if c['c'] in '상중하': chars.append((c['c'],c['bbox']))
        arcs=[d['rect'] for d in p.get_drawings() if d['rect'].width<12 and d['rect'].height<8 and (d.get('fill') or d.get('color')) and (d.get('fill') or d.get('color'))!=(0,0,0)]
        cache[pi]=(chars,arcs)
    return cache[pi]
res={}
for m in M:
    e=ev[m['no']]; chars,arcs=pageinfo(e['pg'])
    cs=[c for c in chars if abs(c[1][1]-e['y0'])<9 and e['nx1']-2<c[1][0]<e['nx1']+45]
    if len(cs)<3: continue
    y0=min(c[1][1] for c in cs); x0=min(c[1][0] for c in cs); x1=max(c[1][2] for c in cs)
    hits=[a for a in arcs if x0-3<(a.x0+a.x1)/2<x1+3 and y0-7<a.y1<y0+5]
    if not hits: res[m['no']]='?'; continue
    ax=sum((a.x0+a.x1)/2 for a in hits)/len(hits)
    res[m['no']]=min(cs,key=lambda c:abs((c[1][0]+c[1][2])/2-ax))[0]
print(Counter(res.values()), len(res))
for m in M: m['diff']=res.get(m['no'])
json.dump(M,open('q_meta.json','w'),ensure_ascii=False)
print(Counter((m['sec'],m['diff'],('대표문제' in m['tags'])) for m in M))
