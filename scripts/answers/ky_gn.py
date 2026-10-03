"""개념편 해설에서 유제(01-1 꼴) 정답 글자를 뽑는다.

번호는 DIN-Regular '08-' + DIN-Black '2' 로 쪼개져 있고,
정답은 바로 뒤 **굵은 글꼴**(NPBIE·NPRUTB·YDVYMjO14)로 온다. 풀이는 다른 글꼴(NPIE·YDVYMjO12)이라
글꼴로 답과 풀이를 가른다.
"""
import sys, re, json, collections
import pymupdf

doc = pymupdf.open(sys.argv[1])
END = int(sys.argv[3])              # 개념편 해설이 끝나는 쪽(0-based, 그 앞까지)
ANS = ('NPBIE', 'NPRUTB', 'YDVYMjO14', 'NPBI')
marks = []
spans = {}
for i in range(1, END):
    p = doc[i]
    sp = [s for b in p.get_text('dict')['blocks'] if b['type'] == 0
          for l in b.get('lines', []) for s in l['spans'] if s['text'].strip()]
    spans[i] = sp
    for s in sp:
        t = s['text'].strip()
        if s['font'].startswith('DIN') and re.fullmatch(r'\d{2}-', t):
            y = (s['bbox'][1] + s['bbox'][3]) / 2
            sub = [z for z in sp if z['font'].startswith('DIN')
                   and re.fullmatch(r'\d{1,2}', z['text'].strip())
                   and abs((z['bbox'][1]+z['bbox'][3])/2 - y) < 7
                   and -3 <= z['bbox'][0] - s['bbox'][2] < 14]
            if sub:
                marks.append(dict(pg=i, y=y, x1=sub[0]['bbox'][2],
                                  col=0 if s['bbox'][0] < p.rect.width / 2 else 1,
                                  ex=int(t[:2]), sub=int(sub[0]['text'].strip())))
# 2단 구성이라 좌·우 칸 순서를 지켜야 한다. y만으로 정렬하면 좌우가 섞여
# 예제 번호가 들쭉날쭉해지고 소단원이 91개로 쪼개진다.
marks.sort(key=lambda m: (m['pg'], m['col'], m['y'], m['x1']))

# 해설은 예제 번호 차례대로 흐르고, 소단원이 바뀌면 번호가 01로 되돌아간다.
# '01-1'일 때만 소단원을 넘기면 그 소단원 첫 유제가 01-2부터 시작하는 경우를 놓쳐
# 뒤가 통째로 밀린다(140개가 이렇게 어긋났다) → **번호가 작아지면** 새 소단원으로 본다.
out, si, prev_ex = {}, 0, 99
for m in marks:
    if m['ex'] < prev_ex:
        si += 1
    prev_ex = m['ex']
    sp = spans[m['pg']]
    row = sorted([z for z in sp if abs((z['bbox'][1]+z['bbox'][3])/2 - m['y']) < 7
                  and z['bbox'][0] >= m['x1'] - 1],
                 key=lambda z: z['bbox'][0])
    txt, lastx = '', m['x1']
    for z in row:
        if not any(z['font'].startswith(f) for f in ANS): break
        if z['bbox'][0] - lastx > 26: break
        txt += z['text']
        lastx = z['bbox'][2]
    out['%02d%02dS%d' % (si, m['ex'], m['sub'])] = re.sub(r'\s+', ' ', txt).strip()
ok = sum(1 for v in out.values() if v)
print('유제 %d개 · 정답 글자 %d개 · 소단원 %d개' % (len(out), ok, si))
c = collections.Counter('빈칸' if not v else ('숫자' if re.fullmatch(r'-?\d+(\.\d+)?', v) else '식·기타') for v in out.values())
print(dict(c))
for k in list(out)[:8]: print('  %s → %r' % (k, out[k][:28]))
json.dump(out, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False)
