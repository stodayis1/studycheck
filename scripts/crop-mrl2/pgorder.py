# -*- coding: utf-8 -*-
"""스캔에서 낱장이 뒤바뀐 자리를 바로잡은 **쪽 차례**.

인쇄된 쪽번호를 눈으로 확인한 결과 PDF 192·193쪽이 인쇄 187·188쪽이었다
(PDF 185쪽=인쇄 186쪽 다음에 와야 한다). 문항 번호 읽은 값도 그렇게 말한다
— PDF 192·193쪽이 1227~1237, PDF 186~190쪽이 1238~1266.
"""
SWAP = [(186, [192, 193])]        # 이 쪽 **앞에** 끼워 넣을 쪽들


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
