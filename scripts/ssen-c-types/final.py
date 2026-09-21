import json,glob,re,collections
rows=json.load(open('rows_sorted.json',encoding='utf8'))
read={}
for f in sorted(glob.glob('read*.txt')):
    for line in open(f,encoding='utf8'):
        parts=line.split()
        if not parts: continue
        key=parts[0]; gr='중'+key[0]; sem=int(key[1]); ch=int(key[3:])
        for p in parts[1:]:
            no,v=p.split('=')
            if v!='?' or (gr,sem,ch,no) not in read: read[(gr,sem,ch,no)]=None if v=='?' else int(v)
types=json.load(open('types.json',encoding='utf8'))
tset=collections.defaultdict(set)
for t in types:
    m=re.match(r'^(중\d)-(\d)-(\d+)-(\d+)$',t['code'])
    if m: tset[(m.group(1),int(m.group(2)),int(m.group(3)))].add(int(m.group(4)))
out=[]; bad=[]
for r in rows:
    k=(r['grade'],r['semester'],r['sub_chapter_no'],r['local_no'])
    v=read.get(k)
    if v is None: bad.append((k,'못읽음')); continue
    g,s,ch=r['grade'],r['semester'],r['sub_chapter_no']
    # 중3-1 마지막 단원만 학원 유형표가 12/13 둘로 쪼개져 있다 (책 유형 10~13 → 13단원 01~04)
    if (g,s,ch)==('중3',1,12) and v>9: ch2,v2=13,v-9
    else: ch2,v2=ch,v
    if v2 not in tset[(g,s,ch2)]: bad.append((k,f'유형 {v}→{ch2}-{v2} 없음')); continue
    out.append({'id':r['id'],'code':f'{g}-{s}-{ch2:02d}-{v2:02d}'})
print('유형 부여',len(out),'| 실패',len(bad))
for b in bad: print('  ',b)
json.dump(out,open('update.json','w'),ensure_ascii=False)
print(collections.Counter(c['code'].split('-')[0]+'-'+c['code'].split('-')[1] for c in out))
