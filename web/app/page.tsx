export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold text-center mb-8">
          🌦️ 기상특보 현황 대시보드
        </h1>
        <p className="text-center text-lg mb-12">
          실시간 기상특보 현황을 확인하고 개인별 알림 설정을 관리하세요
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          <a
            href="/dashboard"
            className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30"
          >
            <h2 className="mb-3 text-2xl font-semibold">
              📊 특보 현황{" "}
              <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
                →
              </span>
            </h2>
            <p className="m-0 max-w-[30ch] text-sm opacity-50">
              전국 실시간 기상특보 현황을 한눈에 확인하세요
            </p>
          </a>

          <a
            href="/settings"
            className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30"
          >
            <h2 className="mb-3 text-2xl font-semibold">
              ⚙️ 구독 설정{" "}
              <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
                →
              </span>
            </h2>
            <p className="m-0 max-w-[30ch] text-sm opacity-50">
              개인별 알림 설정을 관리하고 맞춤 알림을 받으세요
            </p>
          </a>
        </div>

        <div className="mt-12 text-center text-sm text-gray-500">
          <p>Phase 1 MVP 개발 중...</p>
        </div>
      </div>
    </main>
  );
}
