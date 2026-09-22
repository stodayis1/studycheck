import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },

  // ── 브라우저로 나가는 코드 감추기 ────────────────────────────────────────
  // Next.js는 production 빌드에서 이미 코드를 압축·변수명 뭉개기(minify)까지 해준다.
  // 여기서 더하는 것은 두 가지다.

  // 1) 소스맵을 내보내지 않는다. 소스맵이 나가면 minify가 무의미해지고 원본 코드가 그대로
  //    복원된다. Next.js 기본값도 false지만, 누가 실수로 켜지 않도록 명시해 둔다.
  productionBrowserSourceMaps: false,

  // 2) production 번들에서 console.* 를 제거한다. 개발 중 남긴 로그로 내부 구조·id·쿼리가
  //    새어 나가는 걸 막는다. console.error는 장애 추적에 필요하므로 남긴다.
  compiler: {
    removeConsole: {
      exclude: ['error'],
    },
  },
}

export default nextConfig
