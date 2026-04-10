import { useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import StockSearchInput from './StockSearchInput';
import { useWatchlistStore } from '../stores/useWatchlistStore';
import type { StockSummary } from '../types/stock';

interface WatchlistContentProps {
  onDetailClick: (stock: StockSummary) => void;
}

const WatchlistContent = ({ onDetailClick }: WatchlistContentProps) => {
  const { items, fetchWatchlist, addToWatchlist, removeFromWatchlist } = useWatchlistStore();

  useEffect(() => {
    fetchWatchlist();
  }, [fetchWatchlist]);

  return (
    <div className="space-y-4">
      <StockSearchInput
        placeholder="관심종목 추가 (종목명/코드 검색)"
        onSelect={async (s) => {
          try { await addToWatchlist(s.code); } catch {}
        }}
      />
      {items.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map(item => (
            <div key={item.code} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 flex items-center justify-between group">
              <div className="cursor-pointer" onClick={() => onDetailClick({ code: item.code, name: item.name, category: item.category })}>
                <p className="font-bold group-hover:text-blue-400 transition-colors">{item.name}</p>
                <p className="text-xs text-slate-500 font-mono">{item.code}</p>
                <p className="text-sm font-bold mt-1">{item.price ? `₩${item.price.toLocaleString()}` : '---'}</p>
              </div>
              <div className="flex items-center space-x-2">
                {item.market_opinion && (
                  <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
                    item.market_opinion === '긍정적' ? 'bg-emerald-500/10 text-emerald-400' :
                    item.market_opinion === '부정적' ? 'bg-red-500/10 text-red-400' : 'bg-slate-500/10 text-slate-400'
                  }`}>{item.market_opinion}</span>
                )}
                <button onClick={() => removeFromWatchlist(item.code)}
                  className="p-2 text-red-400/60 hover:text-red-400 min-w-[44px] min-h-[44px] flex items-center justify-center">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 bg-slate-900/20 border border-dashed border-slate-800 rounded-3xl">
          <p className="text-3xl mb-4">👀</p>
          <p className="text-slate-300 font-bold text-lg mb-2">관심 종목이 없어요</p>
          <p className="text-slate-500 text-sm">마음에 드는 종목을 추가하면 한 곳에서 볼 수 있어요</p>
        </div>
      )}
    </div>
  );
};

export default WatchlistContent;
