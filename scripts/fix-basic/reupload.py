"""베이직쎈에서 **올라가지 않은 문항 그림**을 원본 폴더에서 찾아 다시 올린다.

무슨 일이 있었나
  2026-09-15 베이직쎈을 올릴 때 b·d 시리즈의 그림이 조용히 빠졌다.
  문항 자체(정답·유형코드)는 DB에 들어가 있어서 표에서는 멀쩡해 보이는데,
  학습지·인쇄 화면에서는 그림이 없어 **빈칸**으로 나온다.
  중1-1 227개, 중1-2 315개, 중2-1 356개 — 모두 898개.

원본은 어디
  C:/Users/USER/문제은행/<과정>/<과정>/(개정) 베이직 쎈/<N-NN. 소단원>/
    a1.png   문항
    a1).png  정답
  DB 의 image_path(m1-1/basic/02/b1.png) 에서 소단원 번호(02)와 문항번호(b1)를 읽어 짝을 찾는다.

올린 뒤에 할 일
  python scripts/strip-book-number.py --book 베이직쎈
  (교재 원본 번호를 지운다. 이미 지운 그림은 색으로 걸러져 두 번 지워지지 않는다)

쓰는 법
  python scripts/fix-basic/reupload.py            # 빠진 것만 세어 본다
  python scripts/fix-basic/reupload.py --write     # 실제로 올린다
"""
import argparse
import io
import json as J
import os
import re
import sys
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
BUCKET = 'problem-images'
SRC = r'C:\Users\USER\문제은행'
# 과정마다 교재 폴더 이름이 조금씩 다르다
BOOKDIR = {('중1', 1): '(개정) 베이직 쎈', ('중1', 2): '(개정) 베이직 쎈',
           ('중2', 1): '(개정) 베이직 쎈', ('중2', 2): '베이직쎈',
           ('중3', 1): '베이직쎈', ('중3', 2): '베이직쎈'}


def load_env():
    for f in ('.env.local', '.env'):
        p = os.path.join(ROOT, f)
        if not os.path.exists(p):
            continue
        for line in io.open(p, encoding='utf8'):
            if '=' in line and not line.startswith('#'):
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip())


load_env()
URL = os.environ['NEXT_PUBLIC_SUPABASE_URL']
KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
H = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY}


def api(path, params=None, method='GET', data=None, headers=None, raw=False):
    url = URL + path + ('?' + urllib.parse.urlencode(params) if params else '')
    req = urllib.request.Request(url, data=data, method=method)
    for k, v in {**H, **(headers or {})}.items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=180) as r:
        b = r.read()
    return b if raw else J.loads(b or b'null')


def fetch_all(params):
    out, off = [], 0
    while True:
        q = dict(params, limit=1000, offset=off)
        got = api('/rest/v1/problems', q) or []
        out += got
        if len(got) < 1000:
            return out
        off += 1000


def ls(pre):
    out, off = set(), 0
    while True:
        got = api('/storage/v1/object/list/' + BUCKET, method='POST',
                  data=J.dumps({'prefix': pre, 'limit': 1000, 'offset': off}).encode(),
                  headers={'Content-Type': 'application/json'})
        out |= set(g['name'] for g in got)
        if len(got) < 1000:
            return out
        off += 1000


def put(path, buf):
    api('/storage/v1/object/' + BUCKET + '/' + urllib.parse.quote(path), method='POST', data=buf,
        headers={'Content-Type': 'image/png', 'x-upsert': 'true'})


def src_dir(grade, sem, sub_no):
    """DB 의 소단원 번호 → 원본 소단원 폴더.

    폴더 이름이 과정마다 다르다 — 중1 은 '1-02. 최대공약수…', 중2-1 은 '02. 단항식의 계산'.
    앞의 대단원 번호는 있어도 되고 없어도 되게 읽는다.
    """
    base = os.path.join(SRC, '%s-%d' % (grade, sem), '%s-%d' % (grade, sem),
                        BOOKDIR[(grade, sem)])
    if not os.path.isdir(base):
        return None
    for d in os.listdir(base):
        m = re.match(r'\s*(?:\d+\s*-\s*)?(\d+)\s*\.', d)
        if m and int(m.group(1)) == sub_no:
            return os.path.join(base, d)
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--write', action='store_true')
    a = ap.parse_args()

    total = {'빠짐': 0, '원본있음': 0, '원본없음': 0, '올림': 0, '정답올림': 0}
    for grade, sem in (('중1', 1), ('중1', 2), ('중2', 1), ('중2', 2)):
        rows = fetch_all({'select': 'id,sub_chapter_no,local_no,image_path,answer_image_path',
                          'book': 'eq.베이직쎈', 'grade': 'eq.' + grade,
                          'semester': 'eq.%d' % sem})
        have, gone = {}, []
        for r in rows:
            p = r.get('image_path')
            if not p:
                gone.append(r)
                continue
            d, n = p.rsplit('/', 1)
            if d not in have:
                have[d] = ls(d)
            if n not in have[d]:
                gone.append(r)
        print('%s-%d  전체 %d  그림빠짐 %d' % (grade, sem, len(rows), len(gone)), flush=True)
        total['빠짐'] += len(gone)
        nope = []
        for r in gone:
            d = src_dir(grade, sem, r.get('sub_chapter_no') or 0)
            f = os.path.join(d, '%s.png' % r['local_no']) if d else None
            if not f or not os.path.exists(f):
                nope.append(r['local_no'])
                total['원본없음'] += 1
                continue
            total['원본있음'] += 1
            if not a.write:
                continue
            put(r['image_path'], io.open(f, 'rb').read())
            total['올림'] += 1
            # 정답 그림도 같이 (원본은 'b1).png')
            ap_ = r.get('answer_image_path')
            af = os.path.join(d, '%s).png' % r['local_no'])
            if ap_ and os.path.exists(af):
                ad, an = ap_.rsplit('/', 1)
                if an not in have.get(ad, ()):
                    put(ap_, io.open(af, 'rb').read())
                    total['정답올림'] += 1
            if total['올림'] % 100 == 0:
                print('    올림 %d' % total['올림'], flush=True)
        if nope:
            print('  [원본 못 찾음] %d: %s' % (len(nope), ' '.join(nope[:12])))
    print()
    print(total)
    if not a.write:
        print('(--write 를 붙여야 실제로 올립니다)')


if __name__ == '__main__':
    main()
