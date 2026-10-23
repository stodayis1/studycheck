# -*- coding: utf-8 -*-
"""마플시너지 공통수학2 — 낱장이 뒤바뀐 곳 (확인되면 여기에 적는다)"""
SWAP = []


def order(n):
    ins = {k: v for k, v in SWAP}
    moved = set(p for _, v in SWAP for p in v)
    out = []
    for p in range(n):
        if p in ins:
            out.extend(ins[p])
        if p in moved:
            continue
        out.append(p)
    return out


def rank(n):
    return {p: i for i, p in enumerate(order(n))}
