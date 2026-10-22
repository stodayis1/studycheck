# 쎈 중3-1 0896 (상) — 두 자리 자연수 b 에 대하여 x²+ax+4b=0 이 중근을 가질 때 가장 큰 자연수 a
from common import sp, x, a, b, terms, m

ORIGIN, LOCAL_NO, EXPECT = 8089, '896', '36'
ORIGINAL = dict(c=4)


def best(c):
    # a²=4cb → cb 가 제곱수인 두 자리 b 중 가장 큰 것
    bs = [v for v in range(10, 100) if int(sp.sqrt(c * v)) ** 2 == c * v]
    return (bs[-1], 2 * int(sp.sqrt(c * bs[-1]))) if bs else (None, None)


def sample(R):
    c = R.randint(2, 12)
    return dict(c=c) if best(c)[0] else None


def build(P):
    c = P['c']
    B, A = best(c)
    t = int(sp.sqrt(c * B))
    eq = f"{terms((1, 'x^2'), (1, 'ax'), (c, 'b'))}=0"
    return dict(
        math=dict(eq=eq),
        text=f"두 자리 자연수 $b$에 대하여 이차방정식 {m(eq)}이 중근을 가질 때, 가장 큰 자연수 $a$의 값은?",
        answer=sp.Integer(A),
        answer_tex=str(A),
        solution=[
            f"중근을 가지려면 ${c}b=\\left(\\dfrac{{a}}{{2}}\\right)^2$, 즉 $a^2={4 * c}b$",
            f"$a$가 자연수이려면 ${4 * c}b$, 즉 ${c}b$가 제곱수이어야 한다.",
            f"두 자리 자연수 중 이를 만족하는 가장 큰 $b$는 ${B}$ $({c}\\times{B}={t}^2)$",
            f"$$a^2={4 * c}\\times{B}={A * A} \\quad\\therefore a={A}$$",
        ],
    )


def check(M, built):
    # 두 자리 b 를 하나하나 넣어 보고, 중근이 되게 하는 자연수 a 중 가장 큰 것
    e = M['eq'].lhs
    found = []
    for bv in range(10, 100):
        for av in sp.solve(sp.discriminant(e.subs(b, bv), x), a):
            if av.is_integer and av > 0:
                found.append(av)
    return max(found) if found else None
