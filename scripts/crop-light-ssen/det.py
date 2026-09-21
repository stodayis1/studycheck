import pymupdf, numpy as np
from scipy import ndimage
q=pymupdf.open('q.pdf')
DPI=200
def page(i):
    pm=q[i].get_pixmap(dpi=DPI)
    a=np.frombuffer(pm.samples,np.uint8).reshape(pm.height,pm.width,pm.n)[...,:3]
    return np.asarray(a).mean(2)
def boxes(g):
    ink=g<120
    lab,n=ndimage.label(ink)
    out=[]
    for sl in ndimage.find_objects(lab):
        h=sl[0].stop-sl[0].start; w=sl[1].stop-sl[1].start
        if 18<h<40 and 8<w<82: out.append((sl[1].start,sl[1].stop,sl[0].start,sl[0].stop))
    # 줄 묶기: y가 12px 안이면 같은 줄로 본다 (반올림으로 나누면 경계에서 줄이 갈라진다)
    out.sort(key=lambda b:(b[2], b[0]))
    rows=[]; base=None; r=-1
    for b in out:
        if base is None or b[2]-base>12: r+=1; base=b[2]
        rows.append((r,b))
    return [b for r,b in sorted(rows, key=lambda rb:(rb[0], rb[1][0]))]
def groups(bx, gap=10):
    """가로로 붙어 있는 글자 4개 = 문항 번호 후보"""
    res=[]; cur=[bx[0]] if bx else []
    for b in bx[1:]:
        if 0<=b[0]-cur[-1][1]<=gap and abs(b[2]-cur[-1][2])<8: cur.append(b)
        else: res.append(cur); cur=[b]
    if cur: res.append(cur)
    return res
if __name__=='__main__':
    g=page(7)
    bx=boxes(g)
    gr=[x for x in groups(bx) if len(x)==4]
    print('페이지7 4글자 묶음',len(gr))
    for x in gr[:14]:
        print('  x',x[0][0],'y',x[0][2],'높이',x[0][3]-x[0][2],'폭',x[-1][1]-x[0][0])
