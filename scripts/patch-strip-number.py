"""라이트쎈 자르기 코드(crop.py)에 '원본 문항 번호 지우기'를 넣는다.

왜 하나
  학습지는 1, 2, 3… 으로 번호를 다시 매겨 인쇄한다. 그런데 잘라 둔 그림에 교재의 원래 번호
  (0232 같은 것)와 묶음 지시문의 [0231~0232] 가 같이 들어가 있어 학생이 헷갈린다.

하는 일 (crop.py 두 군데를 고친다)
  1) 문항 그림에서 번호 상자(qnums_ok 의 x0~x1, y0~y1)를 흰색으로 덮는다
  2) 묶음 지시문에서 앞머리의 '[0231~0232]' 를 흰색으로 덮는다
     - 예전 qbrk.json 에는 지시문의 오른쪽 끝이 없다 → 번호 시작점부터 **가로로 12픽셀 이상
       비는 곳**까지를 대괄호 묶음으로 보고 거기까지만 덮는다

쓰는 법
  python scripts\patch-strip-number.py <crop.py 가 있는 폴더>
"""
import io
import os
import sys

NUM_PATCH = """        a=g[cy0:cy1, d['cx0']:d['cx1']].astype(np.uint8).copy()
        # 원본 문항 번호를 지운다 (학습지에는 1,2,3… 으로 다시 번호가 매겨진다)
        ny0=max(0, d['y0']-cy0-6); ny1=min(a.shape[0], d['y1']-cy0+6)
        nx0=max(0, d['x0']-d['cx0']-6); nx1=min(a.shape[1], d['x1']-d['cx0']+8)
        if ny1>ny0 and nx1>nx0: a[ny0:ny1, nx0:nx1]=255
        a=trim(a)"""

INS_PATCH = """            iy0=max(TOP,bb['y0']-12)
            ins=g[iy0: min(first-8, bb['y0']+330), ix0:ix1].astype(np.uint8).copy()
            # 지시문 앞머리의 '[0231~0232]' 도 지운다.
            # 옛 qbrk.json 에는 끝 위치가 없으니 가로로 12픽셀 넘게 비는 곳까지를 대괄호 묶음으로 본다
            ry0=max(0, bb['y0']-iy0-6); ry1=min(ins.shape[0], bb['y1']-iy0+6)
            rx0=max(0, bb['x0']-ix0-16)
            if ry1>ry0 and rx0<ins.shape[1]-20:
                band=(ins[ry0:ry1, rx0:]<175).any(0)
                run=0; end=None
                for i,v in enumerate(band):
                    if i<20: continue
                    if not v:
                        run+=1
                        if run>=12: end=i-run+1; break
                    else: run=0
                rx1=min(ins.shape[1], rx0+(end if end else 200))
                ins[ry0:ry1, rx0:rx1]=255
            ins=trim(ins,4)"""


def main(d):
    p = os.path.join(d, 'crop.py')
    s = io.open(p, encoding='utf8').read()
    if '원본 문항 번호를 지운다' in s:
        print('이미 고쳐져 있음:', p); return
    old_num = "        a=g[cy0:cy1, d['cx0']:d['cx1']].astype(np.uint8)\n        a=trim(a)"
    old_ins = ("            ins=g[max(TOP,bb['y0']-12): min(first-8, bb['y0']+330), ix0:ix1].astype(np.uint8)\n"
               "            ins=trim(ins,4)")
    assert old_num in s, '문항 자르는 부분을 못 찾음'
    assert old_ins in s, '지시문 자르는 부분을 못 찾음'
    s = s.replace(old_num, NUM_PATCH).replace(old_ins, INS_PATCH)
    io.open(p, 'w', encoding='utf8').write(s)
    print('고침:', p)


if __name__ == '__main__':
    main(sys.argv[1])
