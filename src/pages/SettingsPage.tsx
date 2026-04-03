import { useState } from 'react';
import { PlusCircle, ShieldCheck, Settings, RefreshCw, Plus } from 'lucide-react';
import { stockApi } from '../api/stockApi';

const SettingsPage = () => {
  const [newStockCode, setNewStockCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleAddStock = async () => {
    if (!newStockCode.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      const result = await stockApi.addStock(newStockCode.trim());
      setMessage({ type: 'success', text: `종목 ${result.name} (${result.code})이 성공적으로 추가되었습니다.` });
      setNewStockCode('');
    } catch (error: unknown) {
      console.error('Failed to add stock:', error);
      const axiosError = error as { response?: { data?: { error?: string } } };
      setMessage({ type: 'error', text: axiosError.response?.data?.error || '종목 추가에 실패했습니다. 코드를 확인해주세요.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl animate-in slide-in-from-bottom-4 duration-500">
      <h2 className="text-2xl font-bold mb-8">API & 계정 설정</h2>

      <div className="space-y-6">
        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8">
          <div className="flex items-center space-x-3 mb-6">
            <PlusCircle className="text-blue-400" size={24} />
            <h3 className="text-lg font-semibold">종목 수동 추가</h3>
          </div>

          <p className="text-sm text-slate-400 mb-6 leading-relaxed">
            DB에 없는 신규 종목을 추가하여 실시간 분석을 시작할 수 있습니다. 종목 코드(6자리)를 입력하세요.
          </p>

          <div className="flex space-x-3 mb-4">
            <input
              type="text"
              placeholder="종목 코드 입력 (예: 005930)"
              value={newStockCode}
              onChange={(e) => setNewStockCode(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-5 py-3 text-sm focus:border-blue-500/50 outline-none transition-all"
            />
            <button
              onClick={handleAddStock}
              disabled={loading || !newStockCode.trim()}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white font-bold py-3 px-8 rounded-2xl text-sm transition-all flex items-center"
            >
              {loading ? <RefreshCw className="animate-spin mr-2" size={16} /> : <Plus size={16} className="mr-2" />}
              추가하기
            </button>
          </div>

          {message && (
            <div className={`p-4 rounded-2xl text-xs font-medium ${message.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}>
              {message.text}
            </div>
          )}
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8">
          <div className="flex items-center space-x-3 mb-6">
            <ShieldCheck className="text-emerald-400" size={24} />
            <h3 className="text-lg font-semibold">네이버 증권 API 데이터 연결</h3>
          </div>

          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl mb-6">
            <p className="text-sm text-emerald-400 leading-relaxed">
              현재 네이버 증권 API를 사용하여 실시간 데이터를 수집하고 있습니다. 별도의 인증키가 필요하지 않은 환경입니다.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-950 rounded-2xl border border-slate-800">
              <span className="text-sm text-slate-400">데이터 소스 상태</span>
              <span className="text-xs font-bold px-2 py-1 bg-emerald-500/10 text-emerald-500 rounded-full">정상 연결됨</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-950 rounded-2xl border border-slate-800">
              <span className="text-sm text-slate-400">로컬 데이터베이스 (SQLite)</span>
              <span className="text-xs font-bold px-2 py-1 bg-blue-500/10 text-blue-400 rounded-full">활성화됨</span>
            </div>
          </div>
        </div>

        <div className="p-6 border border-slate-800 rounded-3xl flex items-center justify-between text-slate-500">
          <div className="flex items-center space-x-3">
            <Settings size={20} />
            <span className="text-sm">현재 버전: v1.0.0-alpha</span>
          </div>
          <button title="업데이트 확인" className="text-blue-400 text-sm hover:underline">업데이트 확인</button>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
