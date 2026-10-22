# 쎈 중3-1 0895 (상) — x²+2ax+4a-3=0 이 중근 x=b 를 가질 때 a-b 의 최댓값
from common import sp, x, a, b, terms, m

ORIGIN, LOCAL_NO, EXPECT = 8088, '895', '6'
ORIGINAL = dict(r1=1, r2=3)


def sample(R):
    # a²-Ka+N=0 의 두 근 r1<r2 부터 (둘 다 양수 → '+Ka-N' 꼴 유지)
    r1, r2 = R.randint(1, 6), R.randint(2, 9)
    if r1 >= r2 or r1 * r2 > 40:
        return None
    return dict(r1=r1, r2=r2)


def build(P):
    r1, r2 = P['r1'], P['r2']
    K, N = r1 + r2, r1 * r2
    eq = f"{terms((1, 'x^2'), (2, 'ax'), (K, 'a'), (-N, ''))}=0"
    return dict(
        math=dict(eq=eq),
        text=f"이차방정식 {m(eq)}이 중근 $x=b$를 가질 때, $a-b$의 값 중 가장 큰 값을 구하시오. (단, $a$는 상수이다.)",
        answer=sp.Integer(2 * r2),
        answer_tex=str(2 * r2),
        solution=[
            "중근을 가지려면 (상수항) $=\\left(\\dfrac{x\\text{의 계수}}{2}\\right)^2$ 이어야 하므로",
            f"$${terms((K, 'a'), (-N, ''))}=a^2, \\quad a^2-{K}a+{N}=0, \\quad (a-{r1})(a-{r2})=0$$",
            f"$a={r1}$이면 $(x+{r1})^2=0$이므로 $b=-{r1}$, $a-b={2 * r1}$",
            f"$a={r2}$이면 $(x+{r2})^2=0$이므로 $b=-{r2}$, $a-b={2 * r2}$",
            f"따라서 $a-b$의 값 중 가장 큰 값은 ${2 * r2}$",
        ],
    )


def check(M, built):
    e = M['eq'].lhs
    vals = []
    for av in sp.solve(sp.discriminant(e, x), a):
        r = sp.solve(e.subs(a, av), x)
        if len(r) != 1:
            return None
        vals.append(av - r[0])
    return max(vals) if vals else None
