"""RPM 중등 문항 그림에서 교재 번호를 지운다 (내려받기 → 지우기 → 다시 올리기).

  python scripts/twins/rpm_strip.py <작업폴더> --dry        # 20장 before/after 만 만든다
  python scripts/twins/rpm_strip.py <작업폴더> --grade 중1 --sem 1
  python scripts/twins/rpm_strip.py <작업폴더>              # 중등 전부

안전장치 — **아는 번호(local_no)와 읽은 값이 맞는 후보만** 지운다. 안 맞으면 손대지 않는다.
"""
import io
import json
import os
import sys
import pickle
import urllib.request
import numpy as np
from PIL import Image
from collections import Counter
from rpm_number import number_candidates, read_run, erase, GW, GH

HERE = os.path.dirname(os.path.abspath(__file__))


def env():
    for f in ('.env.local', '.env'):
        p = os.path.join(os.path.dirname(HERE), '..', f)
        p = os.path.abspath(p)
        if not os.path.exists(p):
            continue
        for line in io.open(p, encoding='utf8'):
            m = line.strip().split('=', 1)
            if len(m) == 2 and m[0].strip() and m[0].strip() not in os.environ:
                os.environ[m[0].strip()] = m[1].strip().strip('"\'')


def train(items):
    """그림에서 번호 글자 틀을 스스로 만든다 (글자 수가 아는 번호와 맞는 것만 교본으로)"""
    T = {}
    for r, f in items:
        a = np.array(Image.open(f).convert('RGB'))
        exp = r['local_no'].lstrip('0') or '0'
        m, cands = number_candidates(a, want=exp)
        for c in cands[:1]:
            if len(c['cols']) != len(exp):
                continue
            for (cx0, cx1), ch in zip(c['cols'], exp):
                g = m[c['y0']:c['y1'], c['x0'] + cx0:c['x0'] + cx1]
                ys = np.where(g.any(1))[0]
                if not len(ys):
                    continue
                v = np.asarray(Image.fromarray((g[ys[0]:ys[-1] + 1] * 255).astype(np.uint8))
                               .resize((GW, GH), Image.BILINEAR), float).ravel()
                v -= v.mean()
                n = np.linalg.norm(v)
                T.setdefault(ch, []).append(v / n if n else v)
    return {k: np.mean(v, 0) / np.linalg.norm(np.mean(v, 0)) for k, v in T.items()}


def fix_one(M, a, local_no):
    """(고친그림, 어떻게) — 못 고치면 (None, 사유)"""
    exp = local_no.lstrip('0') or '0'
    m, cands = number_candidates(a, want=exp)
    for c in cands:
        t, cf = read_run(M, m, c)
        # 번호가 한두 자리면 아무 글자나 「맞다」고 통과해 버린다 → 확신을 요구한다
        if not t or cf < 0.06:
            continue
        if len(exp) <= 2 and len(c['cols']) != len(exp):
            continue
        # 앞의 0 은 흐린 색이라 덩어리에 안 잡힌다. 「0001」은 「1」만 잡히므로
        # **아는 번호의 자릿수**만큼 왼쪽으로 더 열어야 0 세 개가 같이 지워진다.
        missing = max(0, len(local_no) - len(t))
        if t == exp:
            return erase(a, c, missing), '그대로'
        if exp.endswith(t):
            return erase(a, c, missing), '앞흐림'
        if exp.startswith(t) and len(t) >= 2:
            gw = max(8, (c['x1'] - c['x0']) // max(1, len(c['cols'])))
            c2 = dict(c, x1=c['x1'] + (len(exp) - len(t)) * gw)
            return erase(a, c2, len(local_no) - len(exp)), '뒤끊김'
    return None, '안맞음'
