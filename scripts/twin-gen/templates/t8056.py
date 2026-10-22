# 쎈 중3-1 0863 — x²-4x+a=0 의 한 근 x=1/2, 2x²+bx-4a=0 의 한 근 x=1 일 때 4ab
from common import sp, x, a, b, terms, num, m, par, tval, josa

ORIGIN, LOCAL_NO, EXPECT = 8056, '863', '35'
ORIGINAL = dict(mm=4, r=sp.Rational(1, 2), p2=2, kk=4, s=1, w=4)


def values(P):
    A = P['mm'] * P['r'] - P['r'] ** 2
    B = (P['kk'] * A - P['p2'] * P['s'] ** 2) / P['s']
    return A, B, P['w'] * A * B


def sample(R):
    P = dict(mm=R.randint(1, 9), r=sp.Rational(R.choice([1, 3, 5, -1]), 2), p2=R.randint(1, 4),
             kk=R.choice([4, 8]), s=R.choice([1, 2, -1]), w=R.choice([2, 4, 8]))
    A, B, ans = values(P)
    # 원래처럼 a 는 분수(양수), b 는 0 이 아닌 정수, 답은 정수
    if A <= 0 or A.q == 1 or B == 0 or B.q != 1 or ans.q != 1 or abs(ans) > 300:
        return None
    return P


def build(P):
    A, B, ans = values(P)
    e1 = f"{terms((1, 'x^2'), (-P['mm'], 'x'), (1, 'a'))}=0"
    e2 = f"{terms((P['p2'], 'x^2'), (1, 'bx'), (-P['kk'], 'a'))}=0"
    r1, r2 = f"x={num(P['r'])}", f"x={num(P['s'])}"
    ex = f"{P['w']}ab"
    return dict(
        math=dict(e1=e1, e2=e2, r1=r1, r2=r2, ex=ex),
        text=f"이차방정식 {m(e1)}의 한 근이 {m(r1)}이고 이차방정식 {m(e2)}의 한 근이 {m(r2)}일 때, "
             f"상수 $a$, $b$에 대하여 {m(ex)}의 값을 구하시오.",
        answer=ans,
        answer_tex=tval(ans),
        solution=[
            f"{m(e1)}에 {m(r1)}{josa(P['r'], '을/를')} 대입하면",
            f"$${par(P['r'])}^2-{P['mm']}\\times{par(P['r'])}+a=0 \\quad\\therefore a={tval(A)}$$",
            f"{m(e2)}에 {m(r2)}{josa(P['s'], '을/를')} 대입하면",
            f"$${'' if P['p2'] == 1 else str(P['p2']) + chr(92) + 'times'}{par(P['s'])}^2+b\\times{par(P['s'])}-{P['kk']}\\times{tval(A)}=0 \\quad\\therefore b={tval(B)}$$",
            f"$$\\therefore {P['w']}ab={P['w']}\\times{tval(A)}\\times{par(B)}={tval(ans)}$$",
        ],
    )


def check(M, built):
    sa = sp.solve(M['e1'].subs(x, M['r1'].rhs), a)
    if len(sa) != 1:
        return None
    sb = sp.solve(M['e2'].subs({x: M['r2'].rhs, a: sa[0]}), b)
    if len(sb) != 1:
        return None
    return M['ex'].subs({a: sa[0], b: sb[0]})
