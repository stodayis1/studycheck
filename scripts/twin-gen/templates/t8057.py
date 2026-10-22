# 쎈 중3-1 0864 — (a+1)x²+(a-b+2)x+3b-1=0 의 두 근이 x=1, x=-2 일 때 ab
from common import sp, x, a, b, terms, num, m, sg, par

ORIGIN, LOCAL_NO, EXPECT = 8057, '864', '-2'
ORIGINAL = dict(al=1, be=2, ga=3, de=-1, r1=1, r2=-2)


def sample(R):
    # 답(a, b)과 두 근부터 정하고, 식이 k(x-r1)(x-r2) 가 되도록 나머지 수를 맞춘다
    A, B = R.choice([-4, -3, -2, -1, 1, 2, 3, 4]), R.choice([-4, -3, -2, -1, 1, 2, 3, 4])
    r1, r2 = R.choice([1, 2, 3]), R.choice([-3, -2, -1])
    K = R.randint(1, 5)                      # x² 의 계수 a+α
    al = K - A
    be = -K * (r1 + r2) - A + B
    ga = R.randint(2, 5)
    de = K * r1 * r2 - ga * B
    if al <= 0 or be <= 0 or de >= 0 or max(al, be, -de) > 20:   # 원래처럼 +α, +β, +γb-δ 꼴
        return None
    P = dict(al=al, be=be, ga=ga, de=de, r1=r1, r2=r2)
    s = sp.solve(solve_ab(P)[2], [a, b], dict=True)
    if len(s) != 1 or set(s[0]) != {a, b}:   # 연립방정식의 해가 하나로 정해져야 한다
        return None
    return P


def solve_ab(P):
    eqs = [(a + P['al']) * r * r + (a - b + P['be']) * r + P['ga'] * b + P['de'] for r in (P['r1'], P['r2'])]
    s = sp.solve(eqs, [a, b], dict=True)
    if len(s) != 1 or set(s[0]) != {a, b}:
        return None, None, eqs
    return s[0][a], s[0][b], eqs


def build(P):
    A, B, eqs = solve_ab(P)
    eq = f"(a{sg(P['al'])})x^2+(a-b{sg(P['be'])})x{terms((P['ga'], 'b'), (P['de'], ''), first=False)}=0"
    r1, r2 = f"x={num(P['r1'])}", f"x={num(P['r2'])}"
    lines = [f"{m(eq)}의 두 근이 {m(r1)}, {m(r2)}이므로 각각 대입하면"]
    for r, e in zip((P['r1'], P['r2']), eqs):
        e = sp.expand(e)
        ca, cb, c0 = e.coeff(a), e.coeff(b), e.subs({a: 0, b: 0})
        lines.append(f"$$x={num(r)}: \\; {terms((ca, 'a'), (cb, 'b'), (c0, ''))}=0$$")
    lines.append(f"두 식을 연립하여 풀면 $a={A}$, $b={B}$")
    lines.append(f"$$\\therefore ab={par(A)}\\times{par(B)}={A * B}$$")
    return dict(
        math=dict(eq=eq, r1=r1, r2=r2),
        text=f"이차방정식 {m(eq)}의 두 근이 {m(r1)}, {m(r2)}일 때, 상수 $a$, $b$에 대하여 $ab$의 값을 구하시오.",
        answer=A * B,
        answer_tex=str(A * B),
        solution=lines,
    )


def check(M, built):
    s = sp.solve([M['eq'].subs(x, M['r1'].rhs), M['eq'].subs(x, M['r2'].rhs)], [a, b], dict=True)
    if len(s) != 1 or (s[0][a] + sp.Integer(0)).free_symbols:
        return None
    # 두 근이 그 둘뿐인지(이차방정식인지)도 본다
    if sp.expand(M['eq'].lhs.subs(s[0])).coeff(x, 2) == 0:
        return None
    return s[0][a] * s[0][b]
