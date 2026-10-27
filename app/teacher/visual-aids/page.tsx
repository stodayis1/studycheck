import { Header } from '@/components/common/Header'

// 말로 설명하기 힘든 공간·입체 단원을 3D로 돌려 보는 수업 자료 모음.
// 자료 자체는 public/visual/*.html (three.js 한 장짜리 페이지)이고, 여기서는 단원별로 모아 새 탭으로 연다.
// 새 자료를 만들면 해당 단원에 href 를 채우면 된다. 단원 이름은 2022 개정 기준(초3~6은 출판사마다 조금 다름).

type Unit = { unit: string; what: string; href?: string }
type Stage = { stage: string; units: Unit[] }

const STAGES: Stage[] = [
  {
    stage: '초등',
    units: [
      { unit: '4-1 평면도형의 이동', what: '밀기·뒤집기·돌리기, 목표 모양 맞히기', href: '/visual/idong.html' },
      { unit: '5-2 직육면체', what: '정육면체 전개도 11가지 접기, 마주 보는 면 맞히기', href: '/visual/jeongyukmyeonche.html' },
      { unit: '6-1 각기둥과 각뿔', what: '밑면과 옆면, 전개도, 면·모서리·꼭짓점 수', href: '/visual/dagakhyeong.html' },
      { unit: '6-2 공간과 입체 · 쌓기나무', what: '위·앞·옆에서 본 모양, 층별 모양, 최소·최대 개수', href: '/visual/ssakgi.html' },
      { unit: '6-2 원기둥, 원뿔, 구', what: '원기둥·원뿔 전개도 펴기, 겉넓이와 부피', href: '/visual/geotneolbi.html' },
    ],
  },
  {
    stage: '중1-2',
    units: [
      { unit: '기본 도형 · 위치 관계', what: '꼬인 위치, 직선과 평면·평면과 평면의 위치 관계', href: '/visual/wichi.html' },
      { unit: '입체도형의 성질 · 다면체와 정다면체', what: '정다면체가 다섯 가지뿐인 이유, 전개도 접기, 면·모서리·꼭짓점 세기', href: '/visual/dagakhyeong.html' },
      { unit: '입체도형의 성질 · 회전체', what: '평면도형을 회전축 둘레로 돌려 회전체 만들기, 회전축을 품은 단면·수직인 단면', href: '/visual/hoijeon.html' },
      { unit: '입체도형의 겉넓이와 부피', what: '기둥·뿔·뿔대·구, 원뿔 전개도의 부채꼴', href: '/visual/geotneolbi.html' },
    ],
  },
  {
    stage: '중2',
    units: [
      { unit: '중2 도형의 닮음', what: '닮은 입체도형의 겉넓이 비·부피 비', href: '/visual/darmeum.html' },
      { unit: '중2 피타고라스 정리 활용', what: '입체 겉면을 따라가는 최단 거리 (직육면체·원기둥·원뿔)', href: '/visual/choedan.html' },
    ],
  },
  {
    stage: '고등',
    units: [
      { unit: '기하 · 공간도형', what: '삼수선의 정리, 이면각, 정사영', href: '/visual/gonggan-dohyeong.html' },
      { unit: '기하 · 공간좌표', what: '좌표공간의 점·대칭점·거리, 구의 방정식', href: '/visual/gonggan-jwapyo.html' },
      { unit: '미적분 · 입체의 부피', what: '단면의 넓이로 부피 구하기, 얇은 조각으로 다가가기', href: '/visual/ipche-bupi.html' },
    ],
  },
]

export default function VisualAidsPage() {
  const ready = STAGES.flatMap((s) => s.units).filter((u) => u.href).length
  return (
    <div>
      <Header title="수업 시각화" subtitle={`입체·공간 단원 3D 자료 · ${ready}개 준비됨`} />
      <div className="px-4 py-4 space-y-5 md:px-6 max-w-3xl mx-auto">
        <p className="text-xs text-gray-500 leading-relaxed">
          누르면 새 탭에서 열려요. 끌어서 돌리고, 휠이나 두 손가락으로 확대할 수 있어요. 수업 화면(TV·태블릿)에 띄워 쓰세요.
        </p>
        {STAGES.map((s) => (
          <section key={s.stage} className="space-y-2">
            <h2 className="text-[11px] font-bold tracking-wider px-1" style={{ color: '#6b7280' }}>{s.stage}</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {s.units.map((u) =>
                u.href ? (
                  <a key={u.unit} href={u.href} target="_blank" rel="noopener"
                    className="rounded-2xl border bg-white p-4 flex gap-3 items-start transition-shadow hover:shadow-md"
                    style={{ borderColor: '#9FE1CB' }}>
                    <i className="ti ti-cube text-xl shrink-0" style={{ color: '#0F6E56' }} />
                    <div className="min-w-0">
                      <div className="text-sm font-bold" style={{ color: '#085041' }}>{u.unit}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{u.what}</div>
                    </div>
                    <i className="ti ti-external-link text-sm ml-auto shrink-0" style={{ color: '#0F6E56' }} />
                  </a>
                ) : (
                  <div key={u.unit} className="rounded-2xl border border-dashed border-gray-200 p-4 flex gap-3 items-start">
                    <i className="ti ti-cube text-xl shrink-0 text-gray-300" />
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-gray-400">{u.unit}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{u.what}</div>
                    </div>
                    <span className="text-[10px] text-gray-400 ml-auto shrink-0">준비 중</span>
                  </div>
                ),
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
