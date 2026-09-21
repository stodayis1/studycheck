import pymupdf, re, json
q=pymupdf.open('q.pdf')
SP=[[s for b in p.get_text('dict')['blocks'] for l in b.get('lines',[]) for s in l['spans'] if s['text'].strip()] for p in q]
ev=[]
for i,sp in enumerate(SP):
    for s in sp:
        t=s['text'].strip(); f=s['font']; y0,y1=s['bbox'][1],s['bbox'][3]
        if f.startswith('YDVYheadL') and s['size']>20 and re.fullmatch(r'\d{2}',t):
            ti=''.join(z['text'] for z in sorted([z for z in sp if z['font'].startswith(('RixSinGoRound','NPBIE','NPYB','YDVYMjO14')) and abs(z['bbox'][1]-y0)<22 and z['bbox'][0]>140],key=lambda z:(round(z['bbox'][1]),z['bbox'][0])))
            ev.append(dict(k='ex',no=int(t),pg=i,y0=y0,y1=y1,title=ti.strip()))
        elif f.startswith('YDVYheadL') and 8.5<s['size']<9.5 and re.fullmatch(r'\d{2}',t.replace('\u2009','')):
            sub=[z for z in sp if z['font'].startswith('YDVYheadB') and abs(z['bbox'][1]-y0)<8 and 0<z['bbox'][0]-s['bbox'][2]<20]
            if sub: ev.append(dict(k='pr',no=int(t.replace('\u2009','')),sub=int(sub[0]['text'].strip()),pg=i,y0=y0,y1=sub[0]['bbox'][3]))
        elif t=='풀이' and f.startswith('RixRakSans'): ev.append(dict(k='sol',pg=i,y0=y0,y1=y1))
        elif t=='문제' and f.startswith('OTNemojin') and s['size']>10: ev.append(dict(k='prhead',pg=i,y0=y0,y1=y1))
        elif f.startswith(('RixRakSansRoun',)) and s['size']>=16 and len(t)>1: ev.append(dict(k='mid',pg=i,y0=y0,y1=y1,t=t))   # 중단원 제목
        elif f.startswith('RixGulimPB'): ev.append(dict(k='big',pg=i,y0=y0,y1=y1,t=t))                                        # 대단원
        elif f.startswith('BalooBhaina') and t in ('Check','Plus'): ev.append(dict(k=t.lower(),pg=i,y0=y0,y1=y1))
ev.sort(key=lambda e:(e['pg'],e['y0']))
json.dump(ev,open('ev.json','w'),ensure_ascii=False)
import collections; print(collections.Counter(e['k'] for e in ev))
print([ (e['pg'],e['t']) for e in ev if e['k']=='big'])
