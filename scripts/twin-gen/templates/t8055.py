# 쎈 중3-1 0862 — 3x²-2x-a=0 의 한 근 x=-1, 4x²-11x-b=0 의 한 근 x=3 일 때 a, b
from common import sp, x, a, b, terms, num, m, par, josa

ORIGIN, LOCAL_NO, EXPECT = 8055, '862', 'a=5, b=3'
ORIGINAL = dict(p1=3, c1=2, r1=-1, p2=4, c2=11, r2=3)


def sample(R):
    p1, p2 = R.randint(2, 5), R.randint(2, 5)
    c1, c2 = R.randint(1, 12), R.randint(1, 12)
    r1, r2 = R.choice([-3, -2, -1]), R.choice([1, 2, 3])
    A = p1 * r1 * r1 - c1 * r1
    B = p2 * r2 * r2 - c2 * r2
    if not (0 < A <= 40 and 0 < B <= 40) or A == B:  # '-a', '-b' 꼴을 지키려면 a, b 가 양수
        return None
    return dict(p1=p1, c1=c1, r1=r1, p2=p2, c2=c2, r2=r2)


def build(P):
    e1 = f"{terms((P['p1'], 'x^2'), (-P['c1'], 'x'), (-1, 'a'))}=0"
    e2 = f"{terms((P['p2'], 'x^2'), (-P['c2'], 'x'), (-1, 'b'))}=0"
    r1, r2 = f"x={num(P['r1'])}", f"x={num(P['r2'])}"
    A = P['p1'] * P['r1'] ** 2 - P['c1'] * P['r1']
    B = P['p2'] * P['r2'] ** 2 - P['c2'] * P['r2']
    return dict(
        math=dict(e1=e1, e2=e2, r1=r1, r2=r2),
        text=f"이차방정식 {m(e1)}의 한 근이 {m(r1)}이고, 이차방정식 {m(e2)}의 한 근이 {m(r2)}일 때, 상수 $a$, $b$의 값을 구하시오.",
        answer=(sp.Integer(A), sp.Integer(B)),
        answer_tex=f'a={A}, b={B}',
        solution=[
            f"{m(e1)}에 {m(r1)}{josa(P['r1'], '을/를')} 대입하면",
            f"$${P['p1']}\\times{par(P['r1'])}^2-{P['c1']}\\times{par(P['r1'])}-a=0 \\quad\\therefore a={A}$$",
            f"{m(e2)}에 {m(r2)}{josa(P['r2'], '을/를')} 대입하면",
            f"$${P['p2']}\\times{par(P['r2'])}^2-{P['c2']}\\times{par(P['r2'])}-b=0 \\quad\\therefore b={B}$$",
        ],
    )


def check(M, built):
    sa = sp.solve(M['e1'].subs(x, M['r1'].rhs), a)
    sb = sp.solve(M['e2'].subs(x, M['r2'].rhs), b)
    return (sa[0], sb[0]) if len(sa) == 1 and len(sb) == 1 else None
