import { useState, useEffect } from 'react';
import { PlusCircle, ShieldCheck, Settings, RefreshCw, User } from 'lucide-react';
import { stockApi } from '../api/stockApi';
import StockSearchInput from '../components/StockSearchInput';

declare const __APP_VERSION__: string;

interface HealthStatus {
  api: boolean;
  database: boolean;
  lastSync: string | null;
}

interface SettingsPageProps {
  nickname: string;
  onNicknameChange: (name: string) => void;
}

const SettingsPage = ({ nickname, onNicknameChange }: SettingsPageProps) => {
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  const checkHealth = async () => {
    setHealthLoading(true);
    try {
      const data = await stockApi.getHealth();
      setHealth(data);
    } catch {
      setHealth({ api: false, database: false, lastSync: null });
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  const handleAddStock = async (stock: { code: string; name: string }) => {
    setMessage(null);
    try {
      const result = await stockApi.addStock(stock.code);
      setMessage({ type: 'success', text: `종목 ${result.name} (${result.code})이 성공적으로 추가되었습니다.` });
      setResetKey(k => k + 1);
    } catch (error: unknown) {
      console.error('Failed to add stock:', error);
      const axiosError = error as { response?: { data?: { error?: string } } };
      setMessage({ type: 'error', text: axiosError.response?.data?.error || '종목 추가에 실패했습니다.' });
    }
  };

  const apiOk = health?.api ?? false;
  const dbOk = health?.database ?? false;
  const lastSyncText = health?.lastSync
    ? new Date(health.lastSync).toLocaleString('ko-KR')
    : '확인 불가';

  return (
    <div className="max-w-2xl animate-in slide-in-from-bottom-4 duration-500">
      <h2 className="text-2xl font-bold mb-4">API & 계정 설정</h2>
      <p className="text-sm text-slate-400 mb-8 leading-relaxed">
        앱에서 사용하는 데이터 연결 상태를 확인하고, 새로운 종목을 추가할 수 있는 페이지입니다.
      </p>

      <div className="space-y-6">
        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8">
          <div className="flex items-center space-x-3 mb-6">
            <PlusCircle className="text-blue-400" size={24} />
            <h3 className="text-lg font-semibold">종목 수동 추가</h3>
          </div>

          <p className="text-sm text-slate-400 mb-6 leading-relaxed">
            관심 있는 종목을 검색해서 추가하면, 자동으로 주가·재무지표·기술적 분석 데이터를 수집하기 시작합니다.
            추가된 종목은 대시보드와 추천 탭에서 확인할 수 있어요.
          </p>

          <StockSearchInput
            placeholder="추가할 종목명을 검색하세요 (예: 삼성전자)"
            onSelect={handleAddStock}
            resetKey={resetKey}
            className="mb-4"
          />

          {message && (
            <div className={`p-4 rounded-2xl text-sm font-medium ${message.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}>
              {message.text}
            </div>
          )}
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <ShieldCheck className="text-emerald-400" size={24} />
              <h3 className="text-lg font-semibold">데이터 연결 상태</h3>
            </div>
            <button
              onClick={checkHealth}
              disabled={healthLoading}
              className="text-xs text-blue-400 active:text-blue-300 flex items-center space-x-1 px-3 py-2 min-h-[44px] rounded-xl border border-slate-800 active:bg-slate-800"
            >
              <RefreshCw size={14} className={healthLoading ? 'animate-spin' : ''} />
              <span>상태 확인</span>
            </button>
          </div>

          <p className="text-sm text-slate-400 mb-4 leading-relaxed">
            주가, 재무제표, 투자자 매매동향 등의 데이터를 네이버 증권에서 자동으로 가져옵니다. 별도 가입이나 인증키 없이 바로 사용 가능합니다.
          </p>

          {healthLoading ? (
            <div className="flex items-center justify-center py-8 text-slate-500 text-sm">
              <RefreshCw size={16} className="animate-spin mr-2" />
              연결 상태를 확인하고 있습니다...
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-950 rounded-2xl border border-slate-800 min-h-[52px]">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-slate-300">네이버 증권 API</span>
                  <span className="text-xs text-slate-500">실시간 주가 데이터 소스</span>
                </div>
                <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${apiOk ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                  {apiOk ? '정상 연결됨' : '연결 실패'}
                </span>
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-950 rounded-2xl border border-slate-800 min-h-[52px]">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-slate-300">로컬 데이터베이스</span>
                  <span className="text-xs text-slate-500">종목·히스토리·분석 결과 저장소</span>
                </div>
                <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${dbOk ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                  {dbOk ? '정상' : '오류'}
                </span>
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-950 rounded-2xl border border-slate-800 min-h-[52px]">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-slate-300">마지막 데이터 갱신</span>
                  <span className="text-xs text-slate-500">매일 오전 8시 자동 업데이트</span>
                </div>
                <span className="text-xs font-bold px-3 py-1.5 bg-blue-500/10 text-blue-400 rounded-full">
                  {lastSyncText}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8">
          <div className="flex items-center space-x-3 mb-6">
            <User className="text-blue-400" size={24} />
            <h3 className="text-lg font-semibold">내 프로필</h3>
          </div>
          <p className="text-sm text-slate-400 mb-4 leading-relaxed">
            앱에서 표시할 이름을 설정하세요. 비워두면 기본값 "투자자"로 표시됩니다.
          </p>
          <div className="flex items-center space-x-3">
            <input
              type="text"
              placeholder="닉네임 입력 (예: 김투자)"
              value={nickname}
              onChange={(e) => onNicknameChange(e.target.value)}
              maxLength={10}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
            />
            <span className="text-xs text-slate-600 shrink-0">{nickname.length}/10</span>
          </div>
        </div>

        <div className="p-6 border border-slate-800 rounded-3xl flex items-center justify-between text-slate-500">
          <div className="flex items-center space-x-3">
            <Settings size={20} />
            <span className="text-sm">현재 버전: v{__APP_VERSION__}</span>
          </div>
          <button
            onClick={checkHealth}
            className="text-blue-400 text-sm active:underline px-4 py-3 min-h-[44px] active:opacity-70"
          >
            연결 상태 재확인
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
