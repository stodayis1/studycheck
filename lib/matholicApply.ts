/**
 * 정해진 대로 **실제로 넣는 곳** — 화면과 스크립트가 같이 쓴다.
 *
 * 원장님 2026-11-07 「붙여넣기 하는 그 과정자체도 불필요하지 않겠니」.
 * 판단은 `lib/matholicPlan.ts`(planRow), 넣기는 여기. 둘 다 한 벌만 둔다 —
 * 두 벌이 되면 규칙을 한쪽만 고치고 조용히 어긋난다.
 *
 * ★ DB 손잡이(`db`)를 **받아서** 쓴다. 화면은 브라우저 supabase(로그인한 선생님 권한),
 *   스크립트는 service_role 손잡이를 넘긴다 — 넣는 코드는 똑같다.
 * ★ 한 건이 실패해도 나머지는 계속 간다. 실패한 것은 이름을 남긴다.
 */
import { unitNameBeside } from './worksheetTitle'
import {
  parseWorksheetTitle, gradeFromCourse, isWrongNote, wrongNoteFix, levelForInsert, worksheetTypeOf,
} from './matholic'
import type { MatholicPlan } from './matholicPlan'

/** supabase-js 손잡이 (브라우저·서버 공용). 필요한 것은 `from` 하나뿐이다. */
export interface MatholicDb { from(table: string): any }

export interface ApplyResult {
  /** 학습일지 데일리테스트 칸에 적은 수 */
  daily: number
  /** 평가관리 코어테스트로 넣은 수 */
  core: number
  /** 평가관리 진단평가로 넣은 수 */
  exam: number
  /** 이미 있던 학습지의 점수를 채운 수 */
  filled: number
  /** 학습지를 새로 만든 수 */
  created: number
  /** 실패한 줄 — 「이름 날짜 점수 — 까닭」 */
  failed: string[]
}

export async function applyPlans(
  db: MatholicDb,
  plans: MatholicPlan[],
  opts: { teacherName?: string | null; books: string[] },
): Promise<ApplyResult> {
  const { teacherName = null, books } = opts
  let daily = 0, core = 0, exam = 0, filled = 0, created = 0
  const failed: string[] = []

  for (const p of plans) {
    const who = p.students.find((s) => s.id === p.studentId)
    const label = `${p.row.student} ${p.row.date} ${p.row.score}점`
    try {
      if (p.mode === 'daily' && p.sessionId) {
        // 학습일지의 데일리테스트 점수. 수업 기록은 **만들지 않는다** — 없으면 건너뛴다.
        // (출결·학부모 브리핑이 수업 기록을 보고 돌기 때문에 함부로 만들면 안 된다.)
        const { error } = await db.from('class_sessions')
          .update({ daily_test_score: p.row.score }).eq('id', p.sessionId)
        if (error) throw new Error(error.message)
        daily++
      } else if (p.mode === 'core' && p.studentId && p.coreRound) {
        // 평가관리의 코어테스트. 점수는 백분율로 적는다 (화면이 그렇게 쓰고 있다 — 만점 100).
        const { error } = await db.from('exams').insert({
          student_id: p.studentId, exam_type: '코어테스트', exam_date: p.row.date,
          title: p.coreRound, score: p.row.score, total_score: 100,
          teacher_name: teacherName,
        })
        if (error) throw new Error(error.message)
        core++
      } else if (p.mode === 'exam' && p.studentId) {
        // 평가관리의 진단평가. 선생님들이 손으로 넣는 꼴과 **똑같이** 넣는다 —
        //   unit_name = 단원 이름 · level = 단계 · total_score = 100 (점수는 백분율).
        // ★ 제목을 그대로 memo 에 남긴다 — 단원을 못 읽은 줄도 어디서 온 것인지 보여야 한다.
        // ★ 재시험은 **두 줄 다** 남긴다 (원장님 2026-11-07). 같은 날 같은 시험을 두 번
        //   봤으면 두 줄이 들어간다. 이미 DB 에 있는 것만 planRow 가 'done' 으로 걸러 준다.
        const { error } = await db.from('exams').insert({
          student_id: p.studentId, exam_type: '진단평가', exam_date: p.row.date,
          unit_name: p.exam?.unitName ?? null, level: p.exam?.level ?? null,
          score: p.row.score, total_score: 100,
          teacher_name: teacherName,
          memo: ['매쓰홀릭', p.row.right != null ? `${p.row.right}/${p.row.total}` : '', p.row.title]
            .filter(Boolean).join(' · '),
        })
        if (error) throw new Error(error.message)
        exam++
      } else if (p.mode === 'fill' && p.wsId) {
        // ★ status 는 scored 까지만. passed 로 올리면 초등 70점 미만이 트리거에 막힌다.
        const { error } = await db.from('student_worksheets')
          .update({ score: p.row.score, status: 'scored', submitted_at: `${p.row.date}T12:00:00+09:00` })
          .eq('id', p.wsId)
        if (error) throw new Error(error.message)
        filled++
      } else if (p.mode === 'new' && p.studentId) {
        // ★ 단원과 레벨을 **칸에 제대로** 넣는다. 제목을 통째로 unit_name 에 넣으면
        //   레벨 현황판(학년 × 단원 표)과 초등 70점 규칙이 조용히 멈춘다.
        const t = parseWorksheetTitle(p.row.title)
        // 개념 사전에서 찾아낸 단원이 있으면 **그 이름으로** 넣는다 — 그래야 레벨 현황판에서
        // 같은 단원끼리 모인다. 선생님이 소개념 이름으로 쓰셔도 대단원까지 함께 들어간다.
        const u = p.unit
        // ★ 두 칸에 **같은 값**을 넣지 않는다 (원장님 2026-10-31 「전범위 전범위로 나온다」).
        const unitCell = u?.chapter ?? t.unit ?? p.row.course ?? '매쓰홀릭'
        let unitNameCell = unitNameBeside(unitCell, u?.subChapter ?? t.unitName ?? p.row.title) || null
        let levelCell = p.row.level
        // ★ 오답 학습지 — 제목에 「오답학습지」를 넣고 레벨은 직전 레벨학습지와 같게
        //   (원장님 2026-11-02). 학부모 브리핑과 레벨 현황판이 이 두 칸만 읽는다.
        if (isWrongNote(p.row)) {
          const fixed = wrongNoteFix(unitNameCell ?? unitCell, p.row.level, p.prevLevel ?? null)
          unitNameCell = fixed.unitName
          levelCell = fixed.level
        }
        // ★ 레벨 칸은 비울 수 없다 (NOT NULL). 못 찾으면 Lv1 — 읽어 보기 화면에도
        //   그렇게 적어 두었다. 비워 보내면 그 줄이 통째로 안 들어간다.
        const 레벨 = levelForInsert(levelCell)
        const { error } = await db.from('student_worksheets').insert({
          student_id: p.studentId, subject: '수학',
          // 제목에 학년이 적혀 있으면 그걸 쓰고, 없으면 학생의 학년으로 메운다.
          // ★ 학년 칸도 **비울 수 없다**(NOT NULL, 기본값 없음).
          grade_level: t.gradeLevel ?? gradeFromCourse(p.row.course)?.grade ?? who?.grade ?? '미정',
          semester: t.semester ?? gradeFromCourse(p.row.course)?.semester ?? null,
          unit: unitCell,
          unit_name: unitNameCell,
          current_level: 레벨,
          // 레벨학습지(main) · 오답유사(similar) · 쌍둥이(twin).
          // 교재연계로 낸 것은 쌍둥이다 (원장님 2026-10-30).
          worksheet_type: worksheetTypeOf(p.row, books),
          status: 'scored', score: p.row.score,
          assigned_at: `${p.row.date}T12:00:00+09:00`,
          submitted_at: `${p.row.date}T12:00:00+09:00`,
          // 어디서 온 것인지 남긴다 — 되돌릴 때 이 글자로 찾는다.
          memo: ['매쓰홀릭',
            t.round ? `${t.round}차` : '',
            p.row.right != null ? `${p.row.right}/${p.row.total}` : ''].filter(Boolean).join(' '),
        })
        if (error) throw new Error(error.message)
        created++
      }
    } catch (e: any) { failed.push(`${label} — ${e?.message ?? '실패'}`) }
  }

  return { daily, core, exam, filled, created, failed }
}
