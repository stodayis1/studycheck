import json,os,re,collections
rows=json.load(open('rows.json',encoding='utf8'))
BASE=r'C:\Users\USER\문제은행'
# 학년-학기 폴더 안에서 '쎈' 폴더(베이직/쎈B 제외) 찾기
books={}
for g in ['중1-1','중1-2','중2-1','중2-2','중3-1','중3-2']:
    root=os.path.join(BASE,g,g)
    cand=[d for d in os.listdir(root) if os.path.isdir(os.path.join(root,d)) and '쎈' in d and '베이직' not in d and 'B' not in d]
    books[g]=os.path.join(root,cand[0]); 
print({k:os.path.basename(v) for k,v in books.items()})
# 소단원 폴더 → 번호
sub={}
for g,p in books.items():
    for d in os.listdir(p):
        m=re.match(r'^(?:\d+[-.]\s*)?(\d+)[.\s]',d)
        if m and os.path.isdir(os.path.join(p,d)): sub[(g,int(m.group(1)))]=os.path.join(p,d)
print('소단원 폴더', collections.Counter(g for g,_ in sub))
miss=[]
for r in rows:
    g=f"{r['grade']}-{r['semester']}"
    d=sub.get((g,r['sub_chapter_no']))
    f=None
    if d:
        for ext in ('png','jpg'):
            p=os.path.join(d,f"{r['local_no']}.{ext}")
            if os.path.exists(p): f=p; break
    r['file']=f
    if not f: miss.append((g,r['sub_chapter_no'],r['local_no']))
print('못 찾은 파일',len(miss),miss[:10])
json.dump(rows,open('rows2.json','w',encoding='utf8'),ensure_ascii=False)
