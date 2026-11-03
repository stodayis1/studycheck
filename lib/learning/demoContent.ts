/**
 * 시연 콘텐츠 provider — 지금 화면이 쓰는 것 (043 §3-A)
 *
 * `catalog.ts` 의 상수를 `ContentProvider` 모양으로 감싼 것뿐이다.
 * 내용을 바꾸지 않았다. **운영 모드에서는 이 파일이 쓰이지 않는다.**
 */
import { relationsFor as catalogRelationsFor, ASSETS, PILOT_TYPES, PROBLEMS } from './catalog'
import type { ContentProvider, TypeInfo } from './providers'

export const demoContentProvider: ContentProvider = {
  source: 'demo',

  async listTypes(): Promise<TypeInfo[]> {
    return PILOT_TYPES.map((t) => ({
      typeCode: t.typeCode,
      grade: t.grade,
      chapter: t.chapter,
      title: t.title,
      source: 'demo',
    }))
  },

  async listProblems() {
    return PROBLEMS
  },

  async listAssets() {
    return ASSETS
  },

  async relationsFor(problemId: string) {
    return catalogRelationsFor(problemId)
  },

  async videoCount(): Promise<number> {
    return ASSETS.filter((a) => a.kind === 'video').length
  },
}
