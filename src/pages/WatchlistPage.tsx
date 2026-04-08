import { useState, useEffect } from 'react';
import { RefreshCw, Trash2, TrendingUp } from 'lucide-react';
import { stockApi } from '../api/stockApi';
import StockSearchInput from '../components/StockSearchInput';
import type { WatchlistItem, StockSummary } from '../types/stock';

interface WatchlistPageProps {
  onDetailClick: (stock: StockSummary) => void;
}

const WatchlistPage = ({ onDetailClick }: WatchlistPageProps) => {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetKey, setResetKey] = useState(0);

  const fetchWatchlist = async () => {
    try {
      const data = await stockApi.getWatchlist();
      setItems(data);
    } catch (error) {
      console.error('Failed to fetch watchlist:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWatchlist();
  }, []);

  const handleAdd = async (stock: { code: string }) => {
    try {
      await stockApi.addToWatchlist(stock.code);
      setResetKey(k => k + 1);
      fetchWatchlist();
    } catch (error) {
      console.error('Failed to add to watchlist:', error);
      alert('종목 추가에 실패했습니다.');
    }
  };

  const handleRemove = async (e: React.MouseEvent, code: string) => {
    e.stopPropagation();
    const prev = items;
    setItems(items.filter(i => i.code !== code)); // optimistic
    try {
      await stockApi.removeFromWatchlist(code);
    } catch (error) {
      console.error('Failed to remove from watchlist:', error);
      setItems(prev); // rollback on failure
      alert('삭제에 실패했습니다. 다시 시도해 주세요.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <RefreshCw className="animate-spin mr-2" size={20} />
        <span>관심종목 불러오는 중...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold mb-2">관심종목</h2>
        <p className="text-slate-500 text-sm">매수하지 않았지만 눈여겨보고 싶은 종목들을 모아 관리하세요.</p>
      </div>

      {/* Add Section */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6">
        <p className="text-xs text-slate-500 mb-3">종목명을 검색해서 관심종목에 추가하세요</p>
        <StockSearchInput
          placeholder="종목명을 입력하세요 (예: 삼성전자)"
          onSelect={handleAdd}
          resetKey={resetKey}
          className="w-full"
        />
      </div>

      {/* Watchlist Grid */}
      {items.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(item => (
            <div
              key={item.code}
              onClick={() => onDetailClick(item)}
              className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 hover:bg-slate-900 hover:border-blue-500/30 transition-all cursor-pointer group relative"
            >
              <button
                onClick={(e) => handleRemove(e, item.code)}
                className="absolute top-3 right-3 min-h-[44px] px-3 py-2 flex items-center gap-1 text-slate-400 hover:text-red-500 transition-all rounded-lg"
                title="관심종목 제거"
              >
                <Trash2 size={16} />
                <span className="text-xs font-medium">삭제</span>
              </button>

              <div className="mb-3">
                <div className="flex items-center space-x-2 mb-1">
                  <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-xs font-bold rounded uppercase">
                    {item.category || '미분류'}
                  </span>
                </div>
                <h4 className="text-lg font-bold group-hover:text-blue-400 transition-colors">{item.name}</h4>
                <p className="text-xs text-slate-500 font-mono">{item.code}</p>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-800/50">
                <div>
                  <p className="text-xs text-slate-500">현재가</p>
                  <p className="text-lg font-black">{item.price ? `₩${item.price.toLocaleString()}` : '---'}</p>
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
                  item.market_opinion === '긍정적' ? 'bg-emerald-500/10 text-emerald-500' :
                  item.market_opinion === '부정적' ? 'bg-red-500/10 text-red-500' :
                  'bg-slate-500/10 text-slate-400'
                }`} title={
                  item.market_opinion === '긍정적' ? '현재 저평가 상태로 매수 기회일 수 있어요' :
                  item.market_opinion === '부정적' ? '하락 추세이거나 고평가 상태예요' :
                  '뚜렷한 방향 없이 보합 상태예요'
                }>
                  {item.market_opinion || '중립적'}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-slate-900/20 border border-dashed border-slate-800 rounded-3xl">
          <TrendingUp size={40} className="mx-auto text-slate-700 mb-4" />
          <p className="text-slate-500 mb-2">관심종목이 없습니다.</p>
          <p className="text-slate-600 text-sm">위에서 종목 코드를 입력해 추가해보세요.</p>
        </div>
      )}
    </div>
  );
};

export default WatchlistPage;
