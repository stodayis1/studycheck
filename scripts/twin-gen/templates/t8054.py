# 쎈 중3-1 0861 — 이차방정식 2x²-ax-2a+1=0 의 한 근이 x=1 일 때 a
from common import sp, x, a, terms, num, m, josa, par

ORIGIN, LOCAL_NO, EXPECT = 8054, '861', '1'
ORIGINAL = dict(P=2, Q=2, S=1, r=1, A=1)


def sample(R):
    # 답(a)부터 정하고 상수항 S 를 거꾸로 맞춘다
    A = R.choice([-5, -4, -3, -2, -1, 1, 2, 3, 4, 5])
    r = R.choice([-2, -1, 1, 2, 3])
    P = R.randint(2, 5)
    Q = R.randint(1, 5)
    S = -(P * r * r) + A * r + Q * A
    if S <= 0 or S > 30 or r + Q == 0:  # 원래처럼 '+상수' 꼴을 지킨다
        return None
    return dict(P=P, Q=Q, S=S, r=r, A=A)


def build(P):
    eq = f"{terms((P['P'], 'x^2'), (-1, 'ax'), (-P['Q'], 'a'), (P['S'], ''))}=0"
    root = f"x={num(P['r'])}"
    r, A = P['r'], P['A']
    c = -r - P['Q']               # a 의 계수
    k = P['P'] * r * r + P['S']   # 상수
    return dict(
        math=dict(eq=eq, root=root),
        text=f"이차방정식 {m(eq)}의 한 근이 {m(root)}일 때, 상수 $a$의 값은?",
        answer=sp.Integer(A),
        answer_tex=str(A),
        solution=[
            f"{m(eq)}에 {m(root)}{josa(r, '을/를')} 대입하면",
            f"$${P['P']}\\times{par(r)}^2-a\\times{par(r)}{terms((-P['Q'], 'a'), (P['S'], ''), first=False)}=0$$",
            f"$${terms((c, 'a'), (k, ''))}=0 \\quad\\therefore a={A}$$",
        ],
    )


def check(M, built):
    eq = M['eq'].subs(x, M['root'].rhs)
    sol = sp.solve(eq, a)
    return sol[0] if len(sol) == 1 else None
