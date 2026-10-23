# -*- coding: utf-8 -*-
"""문항 1,272개에 **구간·유형·난이도·서술형**을 붙인다.

쓰는 재료
  · 인쇄된 쪽번호  — 해설이 구간마다 「유형 완성 26~35쪽」처럼 문제편 쪽을 알려 준다
  · 대표 문제      — 유형이 여기서 시작한다 (유형 완성 구간)
  · 난이도 동그라미 — 빛깔로 하(초록)·중(파랑)·상(보라)
  · 「유형 11」 꼬리표 — 유형 점검 문항이 어느 유형인지
  · 해설의 「채점 기준」 — 서술형 문항
"""
import io
import json
import re
import numpy as np

# PDF 쪽 → 인쇄 쪽. 스캔에서 낱장이 뒤바뀌어 중간이 어긋난다 (pgorder.py 참고)
def printed(p):
    if 186 <= p <= 191:
        return p + 3
    if p in (192, 193):
        return p - 5
    return p + 1


def sections(path='secs.json'):
    """(구간, 시작쪽, 끝쪽) 목록 → 중단원 번호를 붙여 돌려준다"""
    s = json.load(io.open(path, encoding='utf8'))
    ch = 0
    out = []
    for r in s:
        if r['kind'] == '개념 확인':
            ch += 1
        out.append(dict(ch=ch, kind=r['kind'], p0=r['p0'], p1=r['p1']))
    return out


def kind_of(secs, pp):
    for s in secs:
        if s['p0'] <= pp <= s['p1']:
            return s
    return None


def spread(items, ntypes):
    """구간 안의 문항을 유형 차례대로 고르게 나눈다.

    개념 확인·유형 점검·실력 향상은 **그 중단원의 유형을 차례대로** 훑는다
    (책이 그렇게 짜여 있다). 정확한 경계는 모르므로 자리 비례로 나눈다.
    """
    n = len(items)
    if n == 0 or ntypes == 0:
        return {}
    return {it: min(ntypes, 1 + i * ntypes // n) for i, it in enumerate(items)}
