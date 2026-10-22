# 쌍둥이 생성

문제은행 문항을 **숫자만 바꾼 같은 문제**로 만들어 넣는다. 정답·풀이 그림까지.
버튼은 요청만 남기고(`twin_requests`), 만드는 건 Claude 다 — 원장님이 「요청 처리해줘」라고 하면 아래 순서대로.

## 요청이 생기는 곳

| 어디서 | 무엇이 |
|---|---|
| 문제은행(유형별) 「고른 유형 쌍둥이 만들기 요청」 | 고른 유형의 문항 전부 (`source='manual'`) |
| 채점결과 → 재출제 「쌍둥이 문제」 | 틀린 문항 중 아직 만든 쌍둥이가 없는 것 (`source='reprint'`) |

같은 문제가 쎈·쎈B 등 여러 권에 실리므로 **묶음(twin_group)마다 한 번만** 요청된다 (`lib/twinRequests.ts`).
상태: `대기` → (굽기) `확인대기` → (원장님 확인 후 넣기) `반영완료` / 못 만들면 `실패`(+이유).

## 처리 순서 (「요청 처리해줘」)

```bash
node scripts/twin-gen/queue.mjs list                 # 무엇이 기다리나
node scripts/twin-gen/queue.mjs pull --limit 20      # 문제·정답·해설 그림 → work/<문항id>/
#   → 그림을 읽고 templates/t<문항id>.py 를 쓴다 (아래 「틀」)
#   → 도형·그래프·개념 문제처럼 못 만드는 건: queue.mjs fail <문항id> "도형 문제"
python scripts/twin-gen/run.py --ids 8054,8055       # 쌍둥이 만들고 검산 → out/twins.json
node scripts/twin-gen/bake.mjs                       # 그림 굽기 + out/preview.html, 요청은 「확인대기」
#   → preview.html 을 원장님께 보여 드리고 확인받는다  ← 지금은 반드시 (2026-10-22 원장님 결정)
node scripts/twin-gen/queue.mjs put                  # 문제은행에 넣기, 요청은 「반영완료」
```

- 원장님이 일부만 고치라고 하면 그 틀만 고쳐 `run.py --ids` → `bake.mjs` 다시. 일부만 넣으려면 `put 8054,8055`.
- `put` 은 같은 쌍둥이(`source_key = twin:<원래id>:<n>`)를 다시 넣으면 새로 만들지 않고 고친다.

## 틀 (templates/t<문항id>.py)

| 칸 | 하는 일 |
|---|---|
| `ORIGIN` · `LOCAL_NO` · `EXPECT` | 문항 id · 교재 번호 · **책 정답** |
| `ORIGINAL` | 원래 숫자. 이걸로 돌리면 `EXPECT` 가 그대로 나와야 한다 — 안 나오면 틀이 틀린 것, 그 문항은 통째로 실패 |
| `sample(R)` | **답부터 정하고** 문제 숫자를 거꾸로 맞춘다. 원래와 부호 모양이 달라지거나 지저분하면 `None` |
| `build(P)` | 문제 글(`$…$` 수식) · `math`(수식 평문) · 답 · `answer_tex` · 풀이 줄 · (객관식이면) `choices` |
| `check(M, built)` | **화면에 나가는 그 수식**(`math`)을 sympy 로 다시 읽어 앞에서부터 푼 답. `build` 의 답과 다르면 버린다 |

그 밖에 `run.py` 가 버리는 것: 식에 100 이상의 수, 보기 중복, 원래 문제·앞 쌍둥이와 **답이 같은 것**.
숫자 뒤 조사는 `josa(n, '을/를')` 로 (2를, 3을). 공통 도구는 `common.py`.

## 넣는 값

| 칸 | 값 |
|---|---|
| `book` | `쌍둥이` |
| 학년·학기·단원·`type_code`·`level`·`difficulty`·`step` | 원래 문항 그대로 |
| `local_no` | `쎈861-1` (원래 교재+번호-몇째) |
| `answer_kind` / `answer_text` | 객관식 `choice '①, ④'` · 정수 `number` · 분수·여러 값 `image`(자기채점, 글자 정답) |
| `image_path` / `solution_image_path` | `twin/<원래id>/<n>.png` · `_s.png` |
| `twin_group` | 원래 문항의 묶음 (없으면 원래 문항 id 로 연다) |
| `source_key` / `source_meta` | `twin:<원래id>:<n>` / `source_type: twin_gen`, `origin_id`, `params` |

→ 재출제(쌍둥이 문제) · 교재연계(쌍둥이 붙이기) · 답지가 화면을 고치지 않고 바로 집어 간다.

## 그림

`bake.mjs` — 시험지 분석 학교기출 굽기(`components/exam-analysis/QuestionRender.tsx`)와 같은 양식:
87mm · 200dpi · **가로 685px** · 맑은 고딕 10pt · 수식 mathlive. Edge(headless)로 찍는다.
가로가 685px 이 아니거나 아래가 잘리면 멈춘다. `--disable-lcd-text` 를 빼면 글자 가장자리에 색 무늬가 생긴다.

## 아직 안 되는 것

- 도형·그래프가 있는 문제 (숫자를 바꾸면 그림도 다시 그려야 한다) → `fail`
- 쎈 기준 대략 절반이 대상 (유형 이름으로 보면 계산 위주 60%, 그중 개념 고르기 문제는 또 빠진다)
