# 쎈 중3-1 0892 — 2x²+ax+2=0 이 중근을 갖도록 하는 모든 a 의 값의 곱
from common import sp, x, a, terms, m

ORIGIN, LOCAL_NO, EXPECT = 8085, '892', '-16'
ORIGINAL = dict(P=2, Q=2)


def sample(R):
    # a²=4PQ 에서 a 가 정수가 되도록 PQ 가 제곱수
    P, Q = R.randint(1, 9), R.randint(1, 12)
    if P == 1 or int(sp.sqrt(P * Q)) ** 2 != P * Q:
        return None
    return dict(P=P, Q=Q)


def build(P):
    pq = P['P'] * P['Q']
    r = int(sp.sqrt(4 * pq))
    eq = f"{terms((P['P'], 'x^2'), (1, 'ax'), (P['Q'], ''))}=0"
    return dict(
        math=dict(eq=eq),
        text=f"이차방정식 {m(eq)}이 중근을 갖도록 하는 모든 상수 $a$의 값의 곱을 구하시오.",
        answer=sp.Integer(-4 * pq),
        answer_tex=str(-4 * pq),
        solution=[
            "중근을 가지려면 판별식이 0 이어야 하므로",
            f"$$a^2-4\\times{P['P']}\\times{P['Q']}=0, \\quad a^2={4 * pq}$$",
            f"$$\\therefore a=-{r} \\;\\text{{또는}}\\; a={r}$$",
            f"따라서 모든 $a$의 값의 곱은 $-{r}\\times{r}={-4 * pq}$",
        ],
    )


def check(M, built):
    s = sp.solve(sp.discriminant(M['eq'].lhs, x), a)
    return sp.prod(s) if len(s) == 2 else None
