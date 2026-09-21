import json, os
from PIL import Image, ImageDraw
rows=json.load(open('rows2.json',encoding='utf8'))
rows.sort(key=lambda r:(r['grade'],r['semester'],r['sub_chapter_no'],int(r['local_no'])))
os.makedirs('sheets',exist_ok=True)
PER=50; COLS=2; SW=486; RH=46
sheets=[]
for s in range(0,len(rows),PER):
    chunk=rows[s:s+PER]
    rowsn=(len(chunk)+COLS-1)//COLS
    img=Image.new('RGB',(COLS*SW,rowsn*RH+20),'white'); d=ImageDraw.Draw(img)
    for k,r in enumerate(chunk):
        cx=(k//rowsn)*SW; cy=(k%rowsn)*RH+18
        im=Image.open(r['file']).convert('RGB'); w,h=im.size
        strip=im.crop((int(w*0.42),0,w,min(42,h))).resize((int(w*0.58*0.92),int(min(42,h)*0.92)))
        d.text((cx+2,cy+12),f"{r['grade'][-1]}{r['semester']}c{r['sub_chapter_no']:02d} {r['local_no']}",fill='red')
        img.paste(strip,(cx+96,cy))
        d.line([(cx,cy+RH-2),(cx+SW-4,cy+RH-2)],fill=(220,220,220))
    d.text((5,3),f"SHEET {len(sheets)+1}  ({chunk[0]['grade']}-{chunk[0]['semester']} {chunk[0]['local_no']} ~ {chunk[-1]['grade']}-{chunk[-1]['semester']} {chunk[-1]['local_no']})",fill='blue')
    p=f'sheets/s{len(sheets)+1:02d}.png'; img.save(p); sheets.append(p)
json.dump(rows,open('rows_sorted.json','w',encoding='utf8'),ensure_ascii=False)
print(len(rows),'문항 →',len(sheets),'시트', img.size)
