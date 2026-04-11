import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBannerProps {
  // 페이지/위젯에서 발생한 에러. null이면 렌더링하지 않음
  error: string | null;
  // 네트워크 오류와 일반 서버 오류를 구분하기 위한 힌트 (선택)
  kind?: 'network' | 'server' | 'unknown';
  // 다시 시도 핸들러
  onRetry?: () => void;
}

// 공통 에러 표시 컴포넌트.
// 각 페이지가 따로 에러 UI를 만들지 않고 isLoading + error 상태에 이 컴포넌트를 끼우면 된다.
// PostgreSQL 전환 후 DB 연결 실패 케이스가 늘어나므로 통일된 사용자 안내가 필요하다.
const ErrorBanner = ({ error, kind = 'unknown', onRetry }: ErrorBannerProps) => {
  if (!error) return null;
  const headline =
    kind === 'network' ? '네트워크 연결을 확인해 주세요'
    : kind === 'server' ? '서버에서 데이터를 불러오지 못했어요'
    : '데이터를 불러오지 못했어요';
  return (
    <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 flex items-start space-x-3">
      <AlertTriangle size={18} className="text-red-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-red-300">⚠️ {headline}</p>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">{error}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="shrink-0 flex items-center space-x-1.5 px-3 py-2 min-h-[44px] bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs font-bold rounded-lg transition-colors"
        >
          <RefreshCw size={12} />
          <span>다시 시도</span>
        </button>
      )}
    </div>
  );
};

export default ErrorBanner;
