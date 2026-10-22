# 쎈 중3-1 0891 — x²+2x+5-2k=0 이 중근을 가질 때 k
from common import sp, x, k, terms, m, par

ORIGIN, LOCAL_NO, EXPECT = 8084, '891', '2'
ORIGINAL = dict(h=1, n=5, c=2)


def sample(R):
    # 답 k 부터: (x+h)² 꼴이 되려면 n-ck = h²
    h, c, K = R.randint(1, 6), R.randint(2, 5), R.choice([-3, -2, -1, 1, 2, 3, 4, 5])
    n = h * h + c * K
    if n <= 0 or n > 40:
        return None
    return dict(h=h, n=n, c=c)


def build(P):
    h, n, c = P['h'], P['n'], P['c']
    K = sp.Rational(n - h * h, c)
    eq = f"{terms((1, 'x^2'), (2 * h, 'x'), (n, ''), (-c, 'k'))}=0"
    return dict(
        math=dict(eq=eq),
        text=f"이차방정식 {m(eq)}이 중근을 가질 때, 상수 $k$의 값은?",
        answer=K,
        answer_tex=str(K),
        solution=[
            "중근을 가지려면 좌변이 완전제곱식이어야 하므로 (상수항) $=\\left(\\dfrac{x\\text{의 계수}}{2}\\right)^2$",
            f"$${n}-{c}k=\\left(\\dfrac{{{2 * h}}}{{2}}\\right)^2={h * h}$$",
            f"$${c}k={n - h * h} \\quad\\therefore k={K}$$",
        ],
    )


def check(M, built):
    D = sp.discriminant(M['eq'].lhs - M['eq'].rhs, x)
    s = sp.solve(D, k)
    return s[0] if len(s) == 1 else None
