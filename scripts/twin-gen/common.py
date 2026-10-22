"""쌍둥이 생성 — 틀(templates/*.py)들이 같이 쓰는 도구.

수식은 **평문 하나**로만 쓴다 (예: "2x^2-ax-2a+1=0").
  · 화면에는 tex() 로 바꿔 KaTeX 로 그린다
  · 검산은 같은 문자열을 sympy 로 다시 읽어서 푼다
그래서 「화면에 보이는 식」과 「검산한 식」이 어긋날 수가 없다.
"""
import re

import sympy as sp
from sympy.parsing.sympy_parser import (
    parse_expr, standard_transformations, implicit_multiplication_application, convert_xor,
)

x, a, b, k, p, q = sp.symbols('x a b k p q')
SYMS = {'x': x, 'a': a, 'b': b, 'k': k, 'p': p, 'q': q}
_TF = standard_transformations + (implicit_multiplication_application, convert_xor)


def num(c):
    """정수·분수를 평문으로. 3 → '3', 7/4 → '7/4'"""
    c = sp.Rational(c)
    return str(c.p) if c.q == 1 else f'{c.p}/{c.q}'


def sg(c):
    """부호 붙인 수. 3 → '+3', -2 → '-2'"""
    c = sp.Rational(c)
    return f'+{num(c)}' if c >= 0 else num(c)


def terms(*pairs, first=True):
    """[(계수, 'x^2'), (계수, 'x'), (계수, '')] → '2x^2-x+5'. 계수 0 은 빠진다."""
    out = ''
    for c, body in pairs:
        c = sp.Rational(c)
        if c == 0:
            continue
        mag = abs(c)
        s = ('' if mag == 1 and body else num(mag)) + body
        if first:
            out += ('-' if c < 0 else '') + s
        else:
            out += ('-' if c < 0 else '+') + s
        first = False
    return out or '0'


def parse(s):
    """평문 식 → sympy. '='가 있으면 Eq."""
    def one(t):
        return parse_expr(t.replace('^', '**'), local_dict=SYMS, transformations=_TF)
    if '=' in s:
        l, r = s.split('=')
        return sp.Eq(one(l), one(r))
    return one(s)


def tex(s):
    """평문 → KaTeX. 7/4 → \\frac{7}{4}"""
    return re.sub(r'(\d+)/(\d+)', r'\\frac{\1}{\2}', s)


def par(c):
    """대입 표시용. 음수·분수만 괄호: 3 → '3', -1 → '(-1)'"""
    c = sp.Rational(c)
    s = tex(num(c))
    return s if c > 0 and c.q == 1 else f'\\left({s}\\right)'


def tval(v):
    """sympy 값 → KaTeX"""
    return sp.latex(sp.Rational(v)) if sp.Rational(v).q != 1 else str(v)


def m(s):
    """본문에 넣을 수식 조각: $…$"""
    return f'${tex(s)}$'


# 숫자 뒤 조사 — 마지막 자리 읽는 소리로 정한다 (1 일, 2 이, 3 삼 …)
_BATCHIM = {0: True, 1: True, 2: False, 3: True, 4: False, 5: False, 6: True, 7: True, 8: True, 9: False}


def josa(v, pair):
    """josa(3, '을/를') → '을'. 분수는 분자 기준."""
    yes, no = pair.split('/')
    n = abs(sp.Rational(v).p) % 10
    return yes if _BATCHIM[n] else no


def ints_in(s):
    return [int(t) for t in re.findall(r'\d+', s)]
