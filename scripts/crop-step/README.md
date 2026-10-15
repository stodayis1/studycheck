# 「기출 단계별 교재」(JYJ 수학교실 판) → 문제은행 (중1-2, 2026-10-15)

```
python scripts/crop-step/extract.py "<교재.pdf>" <폴더>   # 구조+빠른정답 → items/marks/answers.json
python scripts/crop-step/crop.py    "<교재.pdf>" <폴더>   # 자르기 → q/ a/ s/ · crop.json
python scripts/crop-step/build.py   <자른폴더상위> <쌓을폴더>
node   scripts/upload-problems.mjs "<쌓을폴더>" scripts/problems_step_m1_2.json
node   scripts/crop-solutions/upload.mjs "<쌓을폴더>/_해설" 기출단계별 중1 2 --write
```

## 지면 읽는 법 (728×1031, 2단)
| 무엇 | 어떻게 알아보나 |
|---|---|
| 문제 번호 | `Haansoft Batang` 16pt, 남색 `1644825`, 「1.」 |
| 유형 배지 | 흰 글자 번호(`HYwulM` 14pt) + 오른쪽 제목(`HYsupM` 12pt) |
| 대단원 띠 | `HYsupM` 14pt, 쪽 위쪽 (기본 도형 / 위치 관계 …) |
| 단계 배지 | `H2hdrM` 8pt — 기초 / 기본 / 발전 / 심화 / 유형별 |
| 빠른정답 | 문제 뒤 한두 장에 「1. 정답 ④」 가 쭉 |
| 해설 | 그 뒤에 「1. 정답 ④ + 풀이 …」 |

## 이 교재의 좋은 점 — **자동 채점**
빠른정답을 글자로 뽑아 `answer_kind='choice'` + `answer_text='④'` 로 넣는다.
그러면 학생이 QR 을 찍고 ①~⑤ 를 고르면 **앱이 바로 채점**한다(정답 그림을 눈으로 대조할 필요가 없다).
2348문항 중 2309개가 객관식이다.

> ⚠️ `answer_kind='image'` 인 문항에는 `answer_text` 를 **넣으면 안 된다**.
> `app/api/grade/[code]` 는 answer_text 가 있으면 정답 그림에 서명을 안 해 주므로
> 둘 다 넣으면 학생 화면에 아무것도 안 보인다.

## 걸려 넘어졌던 것
- **해설 쪽은 글이 y 99.5 에서 시작한다.** 문제 쪽 기준(100)으로 자르면 해설 25개를 통째로 놓친다 → `TOP_SOL`.
  94 로 너무 올리면 이번엔 3pt 짜리 워터마크 줄이 딸려 들어온다 → 98 이 맞다.
- 유형 번호는 구간(기초/기본/발전)마다 1부터 다시 매겨진다 → **제목**으로 맞춘다 (`typemap.json`).
- 「유형별」 이라는 단계도 있다 (07 통계 앞부분).

## 아쉬운 점
이 교재의 유형 묶음이 앱 유형표보다 굵다. 예를 들어 「상대도수」 한 유형에 215문항이 들어가는데
앱에는 상대도수 유형이 9가지 있다. 더 잘게 나누려면 문항별로 해설을 읽어 다시 붙여야 한다.
