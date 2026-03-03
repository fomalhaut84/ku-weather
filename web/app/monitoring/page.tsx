import { Suspense } from 'react';
import MonitoringContent from './MonitoringContent';

export default function MonitoringPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-4 text-gray-600">모니터링 데이터 로딩 중...</p>
        </div>
      </div>
    }>
      <MonitoringContent />
    </Suspense>
  );
}
