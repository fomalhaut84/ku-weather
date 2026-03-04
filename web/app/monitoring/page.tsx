import { Suspense } from 'react';
import MonitoringContent from './MonitoringContent';
import LoadingSpinner from '@/components/common/LoadingSpinner';

export default function MonitoringPage() {
  return (
    <Suspense fallback={<LoadingSpinner fullScreen message="모니터링 데이터 로딩 중..." />}>
      <MonitoringContent />
    </Suspense>
  );
}
