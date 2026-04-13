import { useState, useEffect } from 'react';
import { RefreshCw, Trash2, X } from 'lucide-react';
import { stockApi } from '../api/stockApi';
import ErrorBanner from '../components/ErrorBanner';
import type { Stock, StockSummary } from '../types/stock';

interface MajorStocksPageProps {
  onDetailClick: (stock: StockSummary) => void;
}

const CATEGORY_ORDER = [
  '기술/IT',
  '바이오/헬스케어',
  '자동차/모빌리티',
  '에너지/소재',
  '금융/지주',
  '소비재/서비스',
  '엔터테인먼트/미디어',
  '조선/기계/방산',
];

const MajorStocksPage = ({ onDetailClick }: MajorStocksPageProps) => {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 종목 삭제 확인 모달 — 보유·관심·알림 cascade 삭제 위험을 사용자에게 명시
  const [pendingDelete, setPendingDelete] = useState<Stock | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchStocks = async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await stockApi.getAllStocks();
      setStocks(data);
    } catch (err) {
      console.error('Failed to fetch stocks:', err);
      setError('종목 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStocks();
  }, []);

  const requestDelete = (e: React.MouseEvent, stock: Stock) => {
    e.stopPropagation();
    setPendingDelete(stock);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await stockApi.deleteStock(pendingDelete.code);
      setPendingDelete(null);
      fetchStocks();
    } catch (err) {
      console.error('Delete failed:', err);
      setError('종목 삭제에 실패했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <RefreshCw className="animate-spin mr-2" size={20} />
        <span>전체 종목 현황 로드 중...</span>
      </div>
    );
  }

  return (
    <div className="space-y-12 animate-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold mb-2">주요 종목 현황</h2>
        <p className="text-slate-500 text-sm">업종별 주요 종목의 실시간 시세와 추세를 한눈에 확인하세요.</p>
        {/* 17차 5-3: ▲/▼ 등락률 기준 명시 — 초보자는 기간 기준을 모름 */}
        <p className="text-slate-600 text-xs mt-2">※ ▲/▼ 등락률은 <span className="text-slate-400 font-bold">전일 종가 대비</span> 변동분이에요.</p>
      </div>

      <ErrorBanner error={error} kind="server" onRetry={fetchStocks} />

      {/* 종목 삭제 확인 모달 — cascade로 보유·관심·알림 데이터까지 함께 사라짐을 명시 */}
      {pendingDelete && (
        <div className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-bold text-white">{pendingDelete.name}을(를) 삭제할까요?</h3>
              <button onClick={() => setPendingDelete(null)} className="text-slate-500 hover:text-white p-2 min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="닫기">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
              이 종목에 연결된 <span className="text-red-300 font-bold">보유 내역, 관심 종목, 알림</span>이 모두 사라져요.
              이 작업은 되돌릴 수 없어요.
            </p>
            <div className="flex space-x-3 pt-2">
              <button
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold rounded-xl transition-colors disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50"
              >
                {deleting ? '삭제 중...' : '삭제할게요'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-12">
        {CATEGORY_ORDER.map(category => {
          const categoryStocks = stocks.filter(s => s.category === category);
          if (categoryStocks.length === 0) return null;

          return (
            <div key={category} className="space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <span className="w-1.5 h-6 bg-blue-600 rounded-full"></span>
                <span>{category}</span>
                <span className="text-xs font-normal text-slate-500 ml-2">({categoryStocks.length}종목)</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {categoryStocks.map(stock => (
                  <div
                    key={stock.code}
                    onClick={() => onDetailClick(stock)}
                    className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 hover:bg-slate-900 hover:border-blue-500/30 transition-all cursor-pointer group relative"
                  >
                    <button
                      onClick={(e) => requestDelete(e, stock)}
                      className="absolute top-2 right-2 p-2 min-w-[32px] min-h-[32px] text-slate-500 hover:text-red-500 transition-all z-10"
                      title="종목 삭제"
                      aria-label={`${stock.name} 삭제`}
                    >
                      <Trash2 size={14} />
                    </button>
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-sm font-bold group-hover:text-blue-400 transition-colors pr-6">{stock.name}</p>
                      <span className="text-xs text-slate-500 font-mono">{stock.code}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div>
                        <p className="text-lg font-black">{stock.price?.toLocaleString()}원</p>
                        {/* 16차 5-5 / 17차 버그-5: 등락률 placeholder 방어 ("0", "-0.00" 엣지 포함) */}
                        {stock.change_rate && !['0', '0.00', '+0.00', '-0.00'].includes(stock.change_rate) && (() => {
                          const rate = parseFloat(stock.change_rate);
                          const up = rate > 0;
                          return (
                            <p className={`text-xs font-bold mt-0.5 ${up ? 'text-emerald-500' : rate < 0 ? 'text-red-500' : 'text-slate-500'}`}>
                              {up ? '▲' : rate < 0 ? '▼' : ''} {stock.change_rate}%
                            </p>
                          );
                        })()}
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${stock.market_opinion === '긍정적' ? 'bg-emerald-500/10 text-emerald-500' :
                          stock.market_opinion === '부정적' ? 'bg-red-500/10 text-red-500' : 'bg-slate-500/10 text-slate-400'
                          }`}>
                          {stock.market_opinion || '중립적'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MajorStocksPage;
