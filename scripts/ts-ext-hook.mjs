// lib/ 안의 파일들은 서로를 확장자 없이 부른다(`./polishGuard`). Next 는 그걸 알아서
// 찾아 주지만 node 로 직접 돌릴 때는 못 찾는다. 못 찾은 상대경로에만 `.ts` 를 붙여 본다.
// ★ lib 코드는 손대지 않는다 — 배포되는 코드를 스크립트 편의 때문에 바꾸면 안 된다.
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context)
  } catch (err) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      return next(specifier + '.ts', context)
    }
    throw err
  }
}
