import numpy as np, os, json
from PIL import Image
from detect import masks
Q=json.load(open('qfinal.json'))
os.makedirs('out/alla',exist_ok=True)
ink=lambda im: im.min(2)<200
groups={}
for b in Q: groups.setdefault((b['pg'],b['half']),[]).append(b)
cache={}; leaks=[]; meta=[]; boxes=[]
for (pg,half),bs in groups.items():
    if pg not in cache: cache={pg:np.load(f'qa{pg}.npy')}
    a=cache[pg]; W=a.shape[1]
    MR,MG,MB,_=masks(a)
    for b in bs:
        m={'A':MR,'B':MG,'C':MB}[b['st']][b['y0']:b['y1'], b['x0']:b['x1']+10]
        cols=np.where(m.sum(0)>=2)[0]
        b['x1']=int(b['x0']+cols[-1]+1) if len(cols) else b['x1']
    PR=(W//2-10) if half==0 else (W-12)
    rows={}
    for b in bs: rows.setdefault(b['row'],[]).append(b)
    rk=sorted(rows); cent={r:np.mean([b['cy'] for b in rows[r]]) for r in rk}
    for i,r in enumerate(rk):
        rb=sorted(rows[r],key=lambda b:b['x0'])
        for j,b in enumerate(rb):
            cy=cent[r]
            xr=rb[j+1]['x0']-4 if j+1<len(rb) else PR
            # base window: halfway to the neighbouring rows (keeps fractions whole)
            pc=cent[rk[i-1]] if i>0 else cy-64; nc=cent[rk[i+1]] if i+1<len(rk) else cy+64
            top=int(max(cy-32,(pc+cy)/2)); bot=int(min(cy+32,(nc+cy)/2))
            band=lambda y: ink(a[y:y+1, b['x1']+3:xr]).sum()>=1
            # tall answers (braces, matrices) touching the window: follow the ink (gaps<=2), never past the neighbour's centre
            if band(top):
                y=top; gap=0
                while y>pc+14:
                    y-=1; gap=0 if band(y) else gap+1
                    if gap>2: break
                top=y
            if band(bot-1):
                y=bot-1; gap=0
                while y<nc-14:
                    y+=1; gap=0 if band(y) else gap+1
                    if gap>2: break
                bot=y+1
            # drop fragments of the neighbouring rows: keep only ink runs that reach the label's middle band
            rr=[y for y in range(top,bot) if band(y)]
            runs_=[]; 
            for y in rr:
                if runs_ and y-runs_[-1][1]<=3: runs_[-1][1]=y
                else: runs_.append([y,y])
            keep=[r_ for r_ in runs_ if r_[1]>=cy-14 and r_[0]<=cy+14]
            if keep: top,bot=keep[0][0],keep[-1][1]+1
            seg=a[top:bot, b['x1']+3:xr].copy(); boxes.append((pg,top,bot,b['x0']-4,xr))
            m=ink(seg); ys=np.where(m.sum(1)>=1)[0]; xs=np.where(m.sum(0)>=1)[0]
            if not len(ys): leaks.append((b['no'],'EMPTY')); continue
            if ys[0]==0 or ys[-1]>=m.shape[0]-1: leaks.append((b['no'],'EDGE'))
            seg=seg[ys[0]:ys[-1]+1, xs[0]:xs[-1]+1]
            h,w=seg.shape[:2]; H=max(35,h+10); Wd=max(458,w+12)
            can=np.full((H,Wd,3),255,np.uint8); oy=(H-h)//2; can[oy:oy+h,4:4+w]=seg
            Image.fromarray(can).save(f"out/alla/{b['no']:04d}_a.png")
            rr,gg,bb,_=masks(can)
            if (rr|gg|bb).sum()>40: leaks.append((b['no'],'COLOR'))
            meta.append(dict(no=b['no'],w=w,h=h))
print(len(meta),'answer crops; problems:',leaks)
json.dump(meta,open('ans_all.json','w')); json.dump(boxes,open('ans_boxes.json','w'))
