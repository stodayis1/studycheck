import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 스터디체크에서 학생정보를 수정/삭제(퇴원처리)했을 때, 연동된 OPS(sumath-admin) 학생 레코드에도
// 동일하게 반영하기 위한 연동 API. 두 앱은 DB가 완전히 분리되어 있어서 서비스롤 키로 직접 연결한다.
// ops_student_id로 연결이 안 된 학생(OPS 등록 이전부터 있던 학생 등)은 조용히 스킵.
export async function POST(req: NextRequest) {
  try {
    const url = process.env.OPS_SUPABASE_URL
    const key = process.env.OPS_SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      return NextResponse.json({ ok: false, error: 'OPS 연동 키(OPS_SUPABASE_URL / OPS_SUPABASE_SERVICE_ROLE_KEY)가 설정되지 않았어요.' }, { status: 200 })
    }

    const { opsStudentId, fields, teacherName } = await req.json()
    if (!opsStudentId) return NextResponse.json({ ok: true, skipped: true })

    const ops = createClient(url, key)
    const data: Record<string, any> = {}
    if (fields && typeof fields === 'object') {
      if ('name' in fields) data.name = fields.name || null
      if ('school' in fields) data.school = fields.school || null
      if ('grade' in fields) data.grade = fields.grade || null
      if ('parent_name' in fields) data.parent_name = fields.parent_name || null
      if ('parent_phone' in fields) data.parent_phone = fields.parent_phone || null
      if ('class_time' in fields) data.class_time = fields.class_time || null
      if ('is_active' in fields) data.active = fields.is_active
      // OPS 학생목록 카드는 class_time 텍스트가 아니라 schedule_days 배열로 요일을 표시하므로
      // 이걸 빼먹으면 시간표를 바꿔도 OPS 화면엔 예전 요일이 그대로 남는 문제가 있었다.
      if ('schedule_days' in fields) data.schedule_days = Array.isArray(fields.schedule_days) ? fields.schedule_days : null
      if ('weekly_sessions' in fields) data.weekly_sessions = fields.weekly_sessions ?? null
    }

    // 담당강사 자유텍스트(콤마 구분 가능) -> OPS profiles.id 매핑. 첫 번째 이름만 사용.
    if (teacherName !== undefined) {
      const firstName = String(teacherName || '').split(/[,，、]/)[0].trim()
      if (firstName) {
        const { data: prof } = await ops.from('profiles').select('id').eq('name', firstName).maybeSingle()
        if (prof) data.teacher_id = prof.id
      }
    }

    if (Object.keys(data).length === 0) return NextResponse.json({ ok: true, skipped: true })
    data.updated_at = new Date().toISOString()

    const { error } = await ops.from('students').update(data).eq('id', opsStudentId)
    if (error) return NextResponse.json({ ok: false, error: 'OPS 동기화 실패: ' + error.message }, { status: 200 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || '서버 오류' }, { status: 200 })
  }
}
