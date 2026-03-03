import { Suspense } from 'react';
import DashboardContent from './DashboardContent';
import LoadingSpinner from '@/components/common/LoadingSpinner';

export default function DashboardPage() {
  return (
    <Suspense fallback={<LoadingSpinner fullScreen message="특보 현황 로딩 중..." />}>
      <DashboardContent />
    </Suspense>
  );
}
