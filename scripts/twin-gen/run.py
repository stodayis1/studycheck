"""쌍둥이 생성 — 틀(templates/t{문항id}.py)로 숫자만 바꾼 문제를 만들고 검산한다.

    python scripts/twin-gen/run.py [--ids 8054,8055] [--n 3]     (--ids 가 없으면 templates 전부)

틀 하나가 지켜야 할 것 (자세한 건 README.md):
  ORIGINAL 을 넣으면 책 정답(EXPECT)이 그대로 나와야 한다  ← 틀 자체가 맞는지 확인
  sample()  : 답부터 정하고 문제 숫자를 거꾸로 만든다 (깔끔하지 않으면 None)
  build()   : 문제 글·수식(평문)·답·풀이
  check()   : 화면에 나가는 수식을 sympy 로 다시 읽어 «앞에서부터» 푼 답 — build 의 답과 같아야 통과

DB 에는 아무것도 쓰지 않는다. 결과는 out/twins.json → 다음은 bake.mjs (그림 굽기 + 미리보기)
"""
import argparse
import importlib
import json
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, 'templates'))

from common import sp, parse, ints_in, tex, num  # noqa: E402

MAX_NUM = 99      # 식에 나오는 수가 이보다 크면 버린다
TRIES = 20000


def same(u, v):
    if u is None or v is None:
        return False
    if isinstance(u, (list, tuple)):
        return len(u) == len(v) and all(same(s, t) for s, t in zip(u, v))
    return sp.simplify(sp.sympify(u) - sp.sympify(v)) == 0


def verify(T, P):
    """틀로 한 벌 만들고 검산. (built, 실패사유)"""
    built = T.build(P)
    M = {name: parse(s) for name, s in built['math'].items()}
    got = T.check(M, built)
    if not same(got, built['answer']):
        return built, f'검산 불일치: 틀의 답 {built["answer"]} / 다시 푼 답 {got}'
    big = [n for s in built['math'].values() for n in ints_in(s) if n > getattr(T, 'MAX_NUM', MAX_NUM)]
    if big:
        return built, f'수가 너무 큼 {big}'
    ch = built.get('choices')
    if ch and len(set(ch)) != len(ch):
        return built, '보기가 겹침'
    return built, None


def run_template(T, n):
    report = dict(origin=T.ORIGIN, local_no=T.LOCAL_NO, expect=T.EXPECT)
    orig, err = verify(T, T.ORIGINAL)
    if err or orig['answer_tex'] != tex(T.EXPECT):
        report['error'] = err or f'원래 문제로 돌렸더니 답이 {orig["answer_tex"]} (책: {T.EXPECT})'
        report['twins'] = []
        return report
    report['original'] = orig

    R = random.Random(T.ORIGIN)
    seen = {tuple(sorted(orig['math'].values()))}
    # 답이 원래 문제나 앞의 쌍둥이와 같으면 버린다 — 답을 외워서 맞히지 못하게
    answers = {str(orig['answer'])}
    twins, rejected = [], {}
    for _ in range(TRIES):
        if len(twins) >= n:
            break
        P = T.sample(R)
        if P is None or P == T.ORIGINAL:
            continue
        built, err = verify(T, P)
        key = tuple(sorted(built['math'].values()))
        if key in seen or str(built['answer']) in answers:
            continue
        if err:
            rejected[err.split(':')[0]] = rejected.get(err.split(':')[0], 0) + 1
            continue
        seen.add(key)
        answers.add(str(built['answer']))
        twins.append(dict(params=P, bank=bank_answer(built), **built))
    report['twins'] = twins
    report['rejected'] = rejected
    return report


CIRCLES = '①②③④⑤'


def bank_answer(built):
    """problems.answer_kind / answer_text 형식 (lib/examAnalysis.ts bankAnswer 와 같게)
    객관식 → choice '①, ④' · 정수 → number · 그 밖(분수·여러 값) → image 에 글자 정답 (학생 자기채점)"""
    if built.get('choices'):
        picks = sorted(c for c in built['answer_tex'] if c in CIRCLES)
        return dict(kind='choice', text=', '.join(picks))
    v = built['answer']
    if isinstance(v, sp.Basic) and v.is_Integer:
        return dict(kind='number', text=str(v))
    if isinstance(v, sp.Basic) and v.is_Rational:
        return dict(kind='image', text=num(v))
    return dict(kind='image', text=built.get('answer_plain') or built['answer_tex'])


def to_json(v):
    if isinstance(v, dict):
        return {k: to_json(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [to_json(x) for x in v]
    if isinstance(v, sp.Basic):
        return str(v)
    return v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--n', type=int, default=3)
    ap.add_argument('--ids', default='', help='문항 id 를 쉼표로 (없으면 templates 전부)')
    args = ap.parse_args()

    out = os.path.join(HERE, 'out')
    os.makedirs(out, exist_ok=True)
    have = sorted(f[:-3] for f in os.listdir(os.path.join(HERE, 'templates')) if f.startswith('t') and f.endswith('.py'))
    want = [f't{i.strip()}' for i in args.ids.split(',') if i.strip()]
    missing = [w for w in want if w not in have]
    if missing:
        print(f'  틀이 없음: {", ".join(missing)}')
    names = [w for w in want if w in have] if want else have
    reports = []
    for name in names:
        T = importlib.import_module(name)
        r = run_template(T, args.n)
        reports.append(r)
        state = r.get('error') or f'쌍둥이 {len(r["twins"])}개' + (f' (버림 {r["rejected"]})' if r.get('rejected') else '')
        print(f'  {T.ORIGIN} ({T.LOCAL_NO})  {state}')

    with open(os.path.join(out, 'twins.json'), 'w', encoding='utf-8') as f:
        json.dump(to_json(reports), f, ensure_ascii=False, indent=1)
    bad = [r for r in reports if r.get('error') or not r['twins']]
    print(f'\n  틀 {len(reports)} · 실패 {len(bad)} · 쌍둥이 {sum(len(r["twins"]) for r in reports)} → out/twins.json')
    sys.exit(1 if bad or missing else 0)


if __name__ == '__main__':
    main()
