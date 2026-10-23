# -*- coding: utf-8 -*-
"""후보를 **읽는 차례**대로 줄 세운다.

차례 = 인쇄된 쪽 차례 → 단(왼쪽·오른쪽) → 줄(y 가 가까운 것끼리) → 줄 안에서 왼쪽부터.
※ 단순히 (쪽, 단, y, x) 로 정렬하면 안 된다 — 한 줄에 나란히 놓인 0634(왼쪽)와
   0635(오른쪽)가 y 가 1px 달라 뒤바뀐다. 반드시 **줄로 묶은 뒤** x 로 정렬해야 한다.
"""
import pgorder


def order(rows, npages, rowgap=22):
    rk = pgorder.rank(npages)
    idx = sorted(range(len(rows)),
                 key=lambda i: (rk[rows[i]['pg']], rows[i]['col'], rows[i]['y0'], rows[i]['x0']))
    out = []
    grp = []
    for i in idx:
        r = rows[i]
        if grp and (rk[rows[grp[0]]['pg']], rows[grp[0]]['col']) == (rk[r['pg']], r['col']) \
                and r['y0'] - rows[grp[0]]['y0'] < rowgap:
            grp.append(i)
        else:
            out.extend(sorted(grp, key=lambda t: rows[t]['x0']))
            grp = [i]
    out.extend(sorted(grp, key=lambda t: rows[t]['x0']))
    return out
