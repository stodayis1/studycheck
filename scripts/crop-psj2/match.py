"""책의 유형 제목을 앱 유형표(standard_types)에 맞춘다.

제목이 글자로 나오는 교재(풍산자·유형만렙 등)는 눈으로 읽지 않아도 된다.
다만 앱 쪽 제목에는 잘린 것·깨진 것이 있어서(「두 점을 지름의 양 끝 점으로 하는」,
「이차방정식x@+y@+Ax+By+C=0이」) 글자 겹침으로 재고, **확신이 낮은 것만 사람이 본다.**
"""
import re


def norm(s):
    s = re.sub(r'[\s·,．.\-–—‒()⑴⑵⑶⑷\[\]{}「」『』]+', '', s)
    s = s.replace('－', '').replace('~', '').replace('@', '')
    return s


def bigrams(s):
    s = norm(s)
    return set(s[i:i + 2] for i in range(len(s) - 1)) or {s}


def score(a, b):
    A, B = bigrams(a), bigrams(b)
    if not A or not B:
        return 0.0
    return 2 * len(A & B) / (len(A) + len(B))


def best(title, types, topk=3):
    """types: [(code, title)] → 점수 높은 순"""
    r = sorted(((score(title, t), c, t) for c, t in types), reverse=True)
    return r[:topk]
