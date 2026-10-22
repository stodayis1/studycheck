# 쎈 중3-1 0893 — x²+2ax=8a-20 이 중근을 갖도록 하는 a 를 모두 고르면? (정답 2개)
from common import sp, x, a, terms, m

ORIGIN, LOCAL_NO, EXPECT = 8086, '893', '①,④'
ORIGINAL = dict(r1=-10, r2=2, dis=(-5, -4, 8))
CIRCLE = '①②③④⑤'


def coef(r1, r2):
    # a²+Ma-N=0 의 두 근이 r1, r2 → M=-(r1+r2), N=-r1·r2
    return -(r1 + r2), -r1 * r2


def sample(R):
    r1, r2 = R.randint(-12, -2), R.randint(1, 6)
    M, N = coef(r1, r2)
    if M <= 0 or N <= 0 or N > 60:           # 원래처럼 '=Ma-N' 꼴
        return None
    # 헷갈릴 만한 오답: 부호를 바꾼 근, 근의 절반, x 의 계수 등
    pool = {-r1, -r2, M, -M, r1 + r2, r2 - r1, r1 // 2 if r1 % 2 == 0 else None, r2 * 2}
    pool = sorted(v for v in pool if v is not None and v not in (r1, r2))
    if len(pool) < 3:
        return None
    return dict(r1=r1, r2=r2, dis=tuple(sorted(R.sample(pool, 3))))


def build(P):
    r1, r2 = P['r1'], P['r2']
    M, N = coef(r1, r2)
    ch = sorted([r1, r2, *P['dis']])
    ans = ','.join(CIRCLE[ch.index(v)] for v in sorted([r1, r2]))
    eq = f"{terms((1, 'x^2'), (2, 'ax'))}={terms((M, 'a'), (-N, ''))}"
    return dict(
        math=dict(eq=eq),
        text=f"이차방정식 {m(eq)}이 중근을 갖도록 하는 상수 $a$의 값을 모두 고르면? (정답 2개)",
        choices=[str(v) for v in ch],
        answer=tuple(sp.Integer(v) for v in sorted([r1, r2])),
        answer_tex=ans,
        solution=[
            f"${terms((1, 'x^2'), (2, 'ax'), (-M, 'a'), (N, ''))}=0$이 중근을 가지려면 $\\dfrac{{D}}{{4}}=0$이어야 하므로",
            f"$$a^2-({terms((-M, 'a'), (N, ''))})=0, \\quad {terms((1, 'a^2'), (M, 'a'), (-N, ''))}=0$$",
            f"$$(a{'+' if -r1 > 0 else ''}{-r1})(a{'+' if -r2 > 0 else ''}{-r2})=0 \\quad\\therefore a={r1} \\;\\text{{또는}}\\; a={r2}$$",
        ],
    )


def check(M, built):
    e = M['eq'].lhs - M['eq'].rhs
    s = sorted(sp.solve(sp.discriminant(e, x), a))
    ch = [sp.Integer(c) for c in built['choices']]
    if len(s) != 2 or not all(v in ch for v in s):
        return None
    # 보기 번호로도 맞는지
    if ','.join(CIRCLE[ch.index(v)] for v in s) != built['answer_tex']:
        return None
    return tuple(s)
