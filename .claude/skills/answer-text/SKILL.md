---
name: answer-text
description: 정답 그림(*_a.png)을 글자 정답(객관식 ①~⑤ · 숫자)으로 바꿔 QR 자동 채점이 되게 하는 절차. "정답 글자로", "자동 채점되게", "정답 입력", "객관식 정답 ①~⑤", "채점이 안 돼", "무엇을 골라도 오답", "answer_text 넣기" 같은 말이 나오면 쓴다. 새 교재를 자르고 올린(문제은행 업로드) 뒤 이어서 하는 단계다. Use when converting StudyCheck problem answer images into text answers (answer_kind/answer_text) so the QR self-grading flow at app/grade/[code] can auto-grade them, when choice answers are stored as digits instead of ①~⑤, or right after cropping/uploading a new textbook.
---

# 정답 그림 → 글자 정답 (QR 자동 채점용)

## 목적

문제은행 문항은 처음 올리면 정답이 **그림**(`problem-images` 의 `…/<번호>_a.png`, `problems.answer_image_path`)뿐인 경우가 많다.
그림 정답(`answer_kind='image'`)은 QR 채점에서 **학생이 스스로 O/X 체크**한다. 객관식·숫자 정답을 글자로 넣어 두면
서버가 **자동 채점**한다. 이 스킬은 그 글자 정답을 정확하게 넣는 절차다.

## 언제 쓰나

- 새 교재를 자르고(`scripts/crop-*/`) 올린(`scripts/upload-problems.mjs`) 직후 — 업로드 데이터에 `k`/`a` 키가 없었으면 전부 `image` 로 들어가 있다
- 「QR 채점이 안 돼」, 「무엇을 골라도 오답이 나와」 — 대개 정답 형식 문제(아래 '형식 규칙')
- 해설 PDF 를 다시 읽어 정답을 보강할 때

## 자동 채점 대상 / 아닌 것

| 종류 | `answer_kind` | 채점 | 예 |
|---|---|---|---|
| 객관식 | `choice` | 자동 | `③`, `①, ③` (복수정답) |
| 숫자 하나 | `number` | 자동 | `12`, `-3`, `0.5` |
| 그 밖 | `image` | 학생 자기채점(O/X) | 단위가 붙은 답(8 cm · 70° · 20 %), O/X, 선분·이름, 식, 분수, √, 표·그래프, 소문항 ⑴⑵ |
| 서술형 | `is_essay=true` | 선생님 채점(사진 제출 → 채점 대기) | `answer_kind` 와 상관없이 자동 채점 안 함 |

- 단위가 붙은 답을 `number` 로 넣으면 안 된다. 채점은 글자 그대로 비교하므로 학생이 「8」 이라 써도 「8 cm」 와 달라 틀린다.
- 분수·√ 는 `image` 로. √ 가 그림이라 `5√2`→`52`, `3/7`→`37` 로 읽힌 사례가 있다(`docs/문제은행.md`). 유형만렙 숫자 정답 10개(분수·행렬)도 자기채점으로 되돌렸다.
- 예제(필수예제)처럼 풀이 전체가 정답인 것은 한 줄로 못 뽑는다 → 풀이 상자 그림 그대로(`scripts/answers/README.md`).

## 정답 형식 규칙 (DB `problems` 테이블)

| 컬럼 | 값 |
|---|---|
| `answer_kind` | `'choice'` / `'number'` / `'image'` |
| `answer_text` | choice: **원문자 `①②③④⑤`**, 복수는 `', '` 로 이어서 `'①, ③'` · number: 숫자만 `'12'` · image: 보통 `null` |
| `answer_image_path` | 정답 그림 경로(그대로 둔다 — 지우지 말 것) |

채점 코드가 실제로 하는 일:
- 서버 `app/api/grade/[code]/route.ts` 의 `choiceDigits()` — `answer_text` 에서 **①~⑤ 글자만** 골라 `['1','3']` 으로 만든다.
  `'3'`·`'1,3'` 처럼 숫자로 들어가 있으면 **빈 목록**이 되어 학생이 무엇을 골라도 오답이다.
- 화면 `app/grade/[code]/page.tsx` 의 `judge()` — choice 는 고른 번호를 정렬해 비교(복수정답 지원),
  number 는 `norm()` = 공백·쉼표를 지운 뒤 글자 그대로 비교. 그래서 `1,000`=`1000` 이지만 `2, 3`(답 두 개)도 `23` 이 된다 → 답이 둘 이상인 숫자는 `image`.
- ⑥ 이상은 없다(보기 버튼이 ①~⑤ 다섯 개). 답지 `app/api/answer-key/route.ts` 도 같은 ①~⑤ 방식.
- 서버는 `answer_text` 가 **있으면 정답 그림 주소를 안 만든다.** `image` 문항에 `answer_text` 를 넣으면 학생 화면에 그림 대신 그 글자가 뜬다.

## 단계별 순서

### 0) 현재 상태 보기 (Supabase SQL)
```sql
select answer_kind, count(*) from problems
where book = '<교재>' and grade = '<중1>' and semester = <2> group by 1;
```

### 1) 정답 글자 얻기 — 교재에 따라 둘 중 하나

**A. 해설 PDF 에 글자 층이 있다** (개념+유형, 풍산자, 유형만렙, 마플시너지 등)
- 빠른정답 표·답 줄을 글꼴/글자 크기로 갈라 뽑는다. 예: `scripts/answers/ky_yh.py`(유형편 빠른정답, DIN-Bold 9.3pt), `scripts/answers/ky_gn.py`(개념편 유제, 굵은 글꼴)
  ```
  python scripts/answers/ky_yh.py "<정답과해설 PDF>" out.json <유형편 시작쪽-1>
  python scripts/answers/ky_gn.py "<정답과해설 PDF>" out.json <개념편 끝쪽>
  ```
- **2단 구성**이면 `(쪽, 칸, y)` 순으로 정렬한다. y 만 쓰면 좌우 칸이 섞인다.
- 번호로 짝이 안 맞으면(책 중단원 ≠ 학원 소단원) 순서로 짝짓되, 개수가 정확히 같은지와 기존 정답과 내용이 같은지 확인하고 넣는다.
- 새 교재는 업로드 데이터(`problems_*.json`)에 `k`(answer_kind)·`a`(answer_text)를 넣어 `upload-problems.mjs` 로 같이 올리는 것이 보통이다(`k` 가 있을 때만 정답 컬럼을 쓴다).

**B. 글자 층이 없다(스캔 해설)** — 라이트쎈 방식, 그림 두 번 + 원본 한 번 = **세 겹 대조**
1. 이미 잘라 둔 `*_a.png` 를 번호표와 함께 한 장에 30개씩 모아 읽는다 → 판독1
2. 25개씩·다른 배율로 다시 모은 묶음을 **다른 세션**이 판독1 을 보지 않고 읽는다 → 판독2
3. 객관식·숫자만 엄격히 대조, 다른 곳은 원본을 크게 키워 정한다
4. 숫자는 tesseract 로 한 번 더 읽고 다른 곳만 원본을 눈으로 본다(tesseract 는 옆 그림 조각에 잘 끌린다)
5. **원본(빠른정답 표 또는 풀이 본문의 「답」)과 한 번 더 맞춘다.** 원본과 그림이 다르면 원본을 눈으로 보고, 원본이 객관식·숫자면 원본 값을 넣는다

### 2) SQL 파일로 만들어 넣는다 (되돌리기 쌍 필수)
`scripts/answers/라이트쎈_중1-2_정답.sql` 형식을 따른다 — 머리말에 만든 방법·건수, 본문은 `id` 와 `local_no` 를 같이 적은 `update … from (values …)`:
```sql
update problems p set answer_kind = v.kind, answer_text = v.txt
from (values ('53948'::bigint, '0069', 'choice', '⑤'), ...) as v(id, local_no, kind, txt)
where p.id = v.id and p.book = '라이트쎈' and p.grade = '중1' and p.semester = 2
  and p.local_no = v.local_no and p.answer_kind = 'image' and p.answer_text is null;
```
- **지금 `image` 인 것만** 바꾼다(이미 맞게 들어간 글자 정답을 덮지 않게).
- 같은 폴더에 `<이름>_되돌리기.sql` 을 같이 만든다. 운영 DB 이므로 되돌릴 수 없는 변경 금지.
- 파일 이름: `scripts/answers/<교재>_<학년-학기>_정답.sql`. README 표(`scripts/answers/README.md`)에 건수(전체·객관식·숫자·그림·원본으로 바로잡음)를 한 줄 추가한다.
- 적용 뒤 바뀐 행 수가 파일 행 수와 같은지 본다(건너뜀 0).

> ⚠ `scripts/answers/apply.py` 의 `kind_of()` 는 객관식을 **숫자 `'1,3'`** 로 바꿔 넣는다 — 1,839문항(RPM 1,361 · 개념+유형 478)이 이렇게 들어가 QR 에서 늘 오답이었고 `객관식_숫자정답_바꾸기.sql` 로 고쳤다. apply.py 를 다시 쓸 거면 원문자 그대로 넣게 고친 뒤 쓸 것. 또 이 스크립트는 `semester=1` 과 `C:/Users/USER/studycheck/.env.local` 이 박혀 있다.

## 정답 그림 오류를 발견하면

읽다 보면 그림 자체가 틀린 것이 나온다. 라이트쎈에서만 153건(`scripts/answers/라이트쎈_정답그림_오류.md`).
- **밀림**: 옆(다음) 문항의 답이 잘려 들어감 — 자르기 스크립트가 번호 하나를 잘못 읽어 생긴다(끝자리 5 번호, 번호가 빠진 문항 바로 앞에 몰림)
- **잘림**: 답 끝 잘림, 표·그래프 위쪽만
- **섞임**: 두 문항 답이 한 그림에

처리:
1. 오류 목록 md 에 `번호 | 종류 | 내용 | 채점` 으로 적는다
2. 객관식·숫자면 **원본 값**으로 글자 정답을 넣는다 → 채점은 맞다
3. 그림 정답으로 남는 문항(학생이 그 그림을 보고 자기채점)은 **다시 잘라야 한다** → `.claude/skills/crop-fix/SKILL.md` 절차. 라이트쎈 사례: `scripts/fix-light/answers/`(`recut_key.py` · `recut_body.py` · `manual_boxes.json` · `upload_recut.mjs` — 같은 경로에 덮어 올리고 되받아 바이트 비교)
4. 이미 넣은 글자 정답이 틀렸으면 따로 바로잡기 SQL(조건에 옛 값까지 걸기). 예: `scripts/answers/라이트쎈_중1-2_0800_바로잡기.sql`

## 검증

1. SQL 로 형식 검사 — 둘 다 0 이어야 한다
   ```sql
   select count(*) from problems where answer_kind = 'choice'
     and (answer_text is null or answer_text !~ '^[①-⑤](, [①-⑤])*$');
   select count(*) from problems where answer_kind = 'number'
     and (answer_text is null or answer_text !~ '^-?[0-9]+(\.[0-9]+)?$');
   ```
2. **QR 채점 화면 실제 확인**: 문제은행(`/teacher/problem-bank`)에서 그 교재 문항으로 시험지를 만들고 → 인쇄(`/teacher/gradings/print`)의 QR 또는 `/grade/<코드>` 를 열어
   - 객관식에서 정답 번호를 고르면 정답, 다른 번호면 오답으로 나오는지
   - 숫자 문항 입력란이 뜨고 정답이 맞게 판정되는지
   - 그림 문항은 정답 그림이 뜨고 O/X 버튼이 있는지
   (1,839문항 수정 때는 운영 QR `RQRBAM` 에서 「정답 번호를 못 읽는 객관식 0」을 확인했다.)
3. QR 은 시험 대상 학생(`lib/pilot.ts`)만 이름 목록에 뜬다. 테스트 제출은 `gradings` 에 기록이 남으니 원장님께 알리거나 시험 대상 계정으로 할 것.
4. Storage 그림을 다시 올렸으면 CDN 캐시(1시간) 때문에 한동안 옛 그림이 보일 수 있다.

## 자주 하는 실수

- 객관식을 `3`·`1,3` 숫자로 넣음 → 무엇을 골라도 오답 (가장 흔하고, 에러도 안 난다)
- 단위·분수·√·여러 개 숫자 답을 `number` 로 넣음 → 학생이 맞게 써도 오답
- 두 판독이 같으니 맞다고 믿음 → 그림이 옆 문항 답이면 **같게 틀린다**(1-2 0800: 그림 ②, 풀이 ③). 원본과 한 번 더
- 판이 다른 정답 파일을 씀(라이트쎈 2-2 는 `[22개정]답지_라이트쎈중등수학2-2.pdf` 만 맞는 판, 중1-1 은 문제집·정답집 판이 달라 보류) — 구간마다 문제·정답 내용을 골고루 대조
- `image` 문항에 `answer_text` 를 채움 → 학생 화면에 그림 대신 글자가 뜬다(의도한 게 아니면 null)
- 되돌리기 SQL 없이 운영 DB 에 바로 update
- Supabase 는 1000행씩만 준다 — 전체를 읽을 때 `.range()` / `fetchAllRows`(`lib/utils.ts`)
- 다 넣고 README 표·`docs/문제은행.md` 교재 항목의 「자동채점 n / 자기채점 n」 숫자를 안 고침

## 규칙 추가 기록
> 작업하다 새 규칙이 생기면 여기 날짜와 함께 한 줄씩 추가하고, 위 본문의 해당 자리에도 반영한다.
- 2026-10-27 스킬 처음 만듦 (지금까지의 커밋·문서 기준)
