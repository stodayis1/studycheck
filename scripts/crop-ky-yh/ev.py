import pymupdf, re, json, collections
q=pymupdf.open('q.pdf')
SP=[[s for b in p.get_text('dict')['blocks'] for l in b.get('lines',[]) for s in l['spans'] if s['text'].strip()] for p in q]
DOTS={i:[d for d in p.get_drawings() if d['rect'].width<8 and d['rect'].height<8 and d.get('fill')] for i,p in enumerate(q)}
ev=[]
for i,sp in enumerate(SP):
    for s in sp:
        t=s['text'].strip(); f=s['font']
        if f.startswith('Futura') and s['size']>15 and re.fullmatch(r'\d{1,3}',t):
            r=s['bbox']
            dots=[d for d in DOTS[i] if abs(d['rect'].x0-r[0])<22 and 0<d['rect'].y0-r[3]<14]
            filled=sum(1 for d in dots if d['fill'][0]>0.8 and d['fill'][2]<0.5)
            ev.append(dict(k='q',no=int(t),pg=i,y0=r[1],y1=r[3],x0=r[0],dots=len(dots),fill=filled))
        elif f.startswith('YDVYheadL') and 10<s['size']<12 and re.fullmatch(r'\d{1,2}',t) and s['color']==0xffffff:
            rmax=290 if s['bbox'][0]<290 else 560     # 같은 칸 안에서만 제목을 읽는다
            ti=''.join(z['text'] for z in sorted([z for z in sp if abs(z['bbox'][1]-s['bbox'][1])<9 and s['bbox'][2]<z['bbox'][0]<rmax],key=lambda z:z['bbox'][0]))
            ev.append(dict(k='ty',no=int(t),pg=i,y0=s['bbox'][1],y1=s['bbox'][3],x0=s['bbox'][0],title=ti.strip()))
        elif f.startswith('RixGulimPB'): ev.append(dict(k='big',pg=i,y0=s['bbox'][1],y1=s['bbox'][3],t=t))
ev.sort(key=lambda e:(e['pg'], 0 if e.get('x0',0)<290 else 1, e['y0']))
json.dump(ev,open('ev.json','w'),ensure_ascii=False)
print(collections.Counter(e['k'] for e in ev))
print('난이도 점 분포',collections.Counter((e['dots'],e['fill']) for e in ev if e['k']=='q'))
print('대단원',[(e['pg'],e['t']) for e in ev if e['k']=='big'])
qs=[e['no'] for e in ev if e['k']=='q']; print('번호 처음/끝',qs[:6],qs[-4:])
