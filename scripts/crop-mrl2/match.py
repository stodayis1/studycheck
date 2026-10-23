# -*- coding: utf-8 -*-
"""책의 유형 이름 ↔ 앱의 `standard_types` 맞추기.

책(유형만렙)은 중단원 10개에 유형 165개, 앱은 소단원 18개에 유형 142개다.
이름이 거의 같은 것이 많아 **두 글자 묶음(bigram)**이 겹치는 정도로 짝을 찾되,
중단원마다 갈 수 있는 소단원을 미리 묶어 엉뚱한 데로 가지 않게 한다.
"""
import re

# 책 중단원 → 앱 소단원 (여기를 안 묶으면 「점이 나타내는 도형의 방정식」이
# 평면좌표에서 원의 방정식으로 날아간다)
CH2SUB = {1: [1, 2], 2: [3, 4], 3: [5, 6], 4: [7, 8], 5: [9], 6: [10],
          7: [11, 12, 13], 8: [14, 15, 16], 9: [17], 10: [18]}


def norm(s):
    s = re.sub(r'[\s,·－\-‐‑‒–—,.()⑴⑵（）\[\]{}]', '', s or '')
    s = s.replace('＠', '@').replace('　', '')
    return s


def grams(s):
    s = norm(s)
    return set(s[i:i + 2] for i in range(len(s) - 1)) or {s}


def sim(a, b):
    A, B = grams(a), grams(b)
    if not A or not B:
        return 0.0
    return 2.0 * len(A & B) / (len(A) + len(B))


def best(title, pool):
    sc = sorted(((sim(title, t['type_title']), t) for t in pool),
                key=lambda q: -q[0])
    return sc[0] if sc else (0.0, None)
