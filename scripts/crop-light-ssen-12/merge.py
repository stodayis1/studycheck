import json, glob, collections
pairs=json.load(open('pairs.json',encoding='utf8'))
vals=[]
for f in sorted(glob.glob('read*.txt')):
    vals += open(f,encoding='utf8').read().split()
print('읽은 값',len(vals),'| 답 표시',len(pairs))
assert len(vals)>=len(pairs), '읽은 개수가 모자랍니다'
ans={}
for p,v in zip(pairs, vals):
    if v=='x': continue
    n=int(v)
    if not (1<=n<=1085): continue
    ans[n]=p          # 같은 번호에 여러 표시면 마지막(최종답)
print('정답 붙은 문항',len(ans))
json.dump({str(k):v for k,v in ans.items()},open('ansmap.json','w'))
