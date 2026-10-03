"""뽑아 둔 글자 정답을 problems에 넣는다. 답지 화면이 그림 대신 글자로 깔끔하게 보이게."""
import sys, re, json, io, os, urllib.request, urllib.parse

for line in io.open(r'C:/Users/USER/studycheck/.env.local', encoding='utf8'):
    if '=' in line and not line.startswith('#'):
        k, v = line.split('=', 1); os.environ.setdefault(k.strip(), v.strip())
URL, KEY = os.environ['NEXT_PUBLIC_SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY']
CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩'

def clean(t):
    # 이 교재 PDF들은 한글 수식 편집기 표기를 그대로 담고 있다.
    #   `  얇은 공백,  @ 제곱(x@ = x²),  # 세제곱,   ·  특수 공백
    # 그대로 두면 답지에 '12x@-7x+3'처럼 나와 읽히지 않는다.
    t = t.replace('`', ' ').replace(' ', ' ').replace(' ', ' ').replace(' ', '')
    t = t.replace('@', '²').replace('#', '³').replace('$', '⁴')
    t = re.sub(r'\s+', ' ', t).strip()
    t = re.sub(r'\s+([²³,)])', r'', t)
    return t


def kind_of(t):
    if re.fullmatch(r'[①-⑩](\s*,\s*[①-⑩])*', t):
        return 'choice', ','.join(str(CIRCLED.index(c) + 1) for c in t if c in CIRCLED)
    if re.fullmatch(r'-?\d+(\.\d+)?', t):
        return 'number', t
    return 'image', t          # 식·단위가 섞인 답 — 채점은 자기채점, 답지에는 글자로 보인다

ans = json.load(io.open(sys.argv[1], encoding='utf-8'))
BOOK, GRADE = sys.argv[2], sys.argv[3]
n = 0
for local, raw in ans.items():
    t = clean(raw)
    if not t:
        continue
    k, text = kind_of(t)
    q = urllib.parse.urlencode({'book': 'eq.' + BOOK, 'grade': 'eq.' + GRADE,
                                'semester': 'eq.1', 'local_no': 'eq.' + local})
    req = urllib.request.Request(URL + '/rest/v1/problems?' + q,
                                 data=json.dumps({'answer_text': text, 'answer_kind': k}).encode(),
                                 method='PATCH')
    for h, v in {'apikey': KEY, 'Authorization': 'Bearer ' + KEY,
                 'Content-Type': 'application/json', 'Prefer': 'return=minimal'}.items():
        req.add_header(h, v)
    urllib.request.urlopen(req, timeout=60)
    n += 1
    if n % 100 == 0:
        print('  %d개' % n, flush=True)
print('✓ 정답 반영 %d개' % n)
