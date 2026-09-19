import pymupdf, re, json
q=pymupdf.open('q.pdf'); ev=[]
COL={0x49b752:'A',0x5b73b8:'B',0x231f20:'C',0xb455a0:'P'}
for pi,p in enumerate(q):
    xs=[round(dr['rect'].x0) for dr in p.get_drawings() if dr['rect'].width<2 and dr['rect'].height>300]
    div=xs[0] if xs else 312
    lines=[l for b in p.get_text('dict')['blocks'] for l in b.get('lines',[])]
    sp=[s for l in lines for s in l['spans']]
    # numbers: group Hoyoyo 12.7 spans by (y,col)
    g={}
    for s in sp:
        if 'Hoyoyo' in s['font'] and 12<s['size']<13.5 and s['text'].strip():
            g.setdefault((round(s['bbox'][1]),int(s['bbox'][0]>div)),[]).append(s)
    G={}
    for (y,col),ss in g.items():
        ss.sort(key=lambda s:s['bbox'][0]); cl=[[ss[0]]]
        for s_ in ss[1:]:
            if s_['bbox'][0]-cl[-1][-1]['bbox'][2]>6: cl.append([s_])
            else: cl[-1].append(s_)
        for k_,c_ in enumerate(cl): G[(y,col,k_)]=c_
    for (y,col,_k),ss in G.items():
        t=''.join(s['text'].strip() for s in ss)
        if not re.fullmatch(r'\d{4}',t): continue
        color=[s['color'] for s in ss if s['color']!=0x9d9fa2]
        x1=ss[-1]['bbox'][2]
        tags=[s['text'].strip() for s in sp if abs(s['bbox'][1]-y)<7 and s['bbox'][0]>x1-2 and (s['bbox'][0]>div)==bool(col) and 'Woori' in s['font'] and s['text'].strip()]
        ev.append(dict(k='num',no=int(t),pg=pi,col=col,y0=ss[0]['bbox'][1],y1=ss[0]['bbox'][3],x0=ss[0]['bbox'][0],nx1=x1,sec=COL.get(color[0] if color else 0,'?'),tags=tags,div=div))
    for i,s in enumerate(sp):
        t=s['text'].strip()
        if 'hEb' in s['font'] and s['color']==0xffffff and re.fullmatch(r'\d{2}',t):
            ev.append(dict(k='type',no=int(t),pg=pi,col=int(s['bbox'][0]>div),y0=s['bbox'][1]-6,y1=s['bbox'][3]+6))
        if 'hEb' in s['font'] and s['color']==0xffffff and re.fullmatch(r'\d{2}-\d',t):
            ev.append(dict(k='cpt',no=t,pg=pi,col=int(s['bbox'][0]>div),y0=s['bbox'][1]-6,y1=s['bbox'][3]+6))
        if 'Hoyoyo' in s['font'] and 9<s['size']<10.5 and t.startswith('['):
            ev.append(dict(k='brk',pg=pi,col=int(s['bbox'][0]>div),y0=s['bbox'][1],y1=s['bbox'][3],x0=s['bbox'][0]))
    # C-section per-problem type tags like '유형 01' small
    for s in sp:
        t=s['text'].strip()
        if re.fullmatch(r'유형\s?\d{2}',t) and s['size']<10 and s['color']!=0xffffff:
            ev.append(dict(k='ctag',t=int(t[-2:]),pg=pi,col=int(s['bbox'][0]>div),y0=s['bbox'][1],y1=s['bbox'][3]))
ev.sort(key=lambda e:(e['pg'],e['col'],e['y0']))
json.dump(ev,open('ev.json','w'),ensure_ascii=False)
from collections import Counter
N=[e for e in ev if e['k']=='num']; ns=[e['no'] for e in N]
print(len(N),ns[0],ns[-1],'missing',[n for n in range(1,ns[-1]+1) if n not in ns][:30],'dups',[n for n in set(ns) if ns.count(n)>1][:10])
print(Counter(e['sec'] for e in N), Counter(t for e in N for t in e['tags']), Counter(e['k'] for e in ev))
# sequence of sections
from itertools import groupby
print([(k,len(list(g))) for k,g in groupby(e['sec'] for e in N)][:40])
