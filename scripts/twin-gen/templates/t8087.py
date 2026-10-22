# 쎈 중3-1 0894 (서술형) — x²-10x+a=0 이 중근 x=p, 4x²-12x+b=0 이 중근 x=q 일 때 a+b+p+q
from common import sp, x, a, b, terms, m, tval

ORIGIN, LOCAL_NO, EXPECT = 8087, '894', '81/2'
ORIGINAL = dict(h=5, c=4, d=12)


def sample(R):
    h, c, d = R.randint(2, 9), R.randint(2, 9), R.randint(2, 30)
    q = sp.Rational(d, 2 * c)
    B = sp.Rational(d * d, 4 * c)
    # 원래처럼 q 는 분수, b 는 정수
    if q.q == 1 or B.q != 1 or B > 60:
        return None
    return dict(h=h, c=c, d=d)


def build(P):
    h, c, d = P['h'], P['c'], P['d']
    A, p_, q_, B = h * h, h, sp.Rational(d, 2 * c), sp.Rational(d * d, 4 * c)
    ans = A + B + p_ + q_
    e1 = f"{terms((1, 'x^2'), (-2 * h, 'x'), (1, 'a'))}=0"
    e2 = f"{terms((c, 'x^2'), (-d, 'x'), (1, 'b'))}=0"
    return dict(
        math=dict(e1=e1, e2=e2),
        text=f"이차방정식 {m(e1)}이 중근 $x=p$를 갖고, 이차방정식 {m(e2)}이 중근 $x=q$를 가질 때, "
             f"$a+b+p+q$의 값을 구하시오. (단, $a$, $b$는 상수이다.)",
        answer=ans,
        answer_tex=tval(ans),
        solution=[
            f"{m(e1)}이 중근을 가지므로 $a=\\left(\\dfrac{{-{2 * h}}}{{2}}\\right)^2={A}$",
            f"$$x^2-{2 * h}x+{A}=0, \\quad (x-{h})^2=0 \\quad\\therefore p={h}$$",
            f"{m(e2)}의 양변을 ${c}$로 나누면 $x^2-{tval(sp.Rational(d, c))}x+\\dfrac{{b}}{{{c}}}=0$",
            f"$$\\dfrac{{b}}{{{c}}}=\\left({tval(q_)}\\right)^2 \\quad\\therefore b={B}, \\; q={tval(q_)}$$",
            f"$$\\therefore a+b+p+q={A}+{B}+{h}+{tval(q_)}={tval(ans)}$$",
        ],
    )


def check(M, built):
    out = []
    for e, s in ((M['e1'].lhs, a), (M['e2'].lhs, b)):
        v = sp.solve(sp.discriminant(e, x), s)
        if len(v) != 1:
            return None
        r = sp.solve(e.subs(s, v[0]), x)
        if len(r) != 1:              # 정말 중근인지
            return None
        out += [v[0], r[0]]
    return sum(out)
