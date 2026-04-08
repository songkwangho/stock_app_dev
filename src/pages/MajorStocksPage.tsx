import { useState, useEffect } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { stockApi } from '../api/stockApi';
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

  const fetchStocks = async () => {
    try {
      const data = await stockApi.getAllStocks();
      setStocks(data);
    } catch (error) {
      console.error('Failed to fetch stocks:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStocks();
  }, []);

  const handleDelete = async (e: React.MouseEvent, code: string) => {
    e.stopPropagation();
    if (!window.confirm('이 종목을 목록에서 삭제하시겠습니까?')) return;
    try {
      await stockApi.deleteStock(code);
      fetchStocks();
    } catch (error) {
      console.error('Delete failed:', error);
      alert('삭제에 실패했습니다.');
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
      </div>

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
                      onClick={(e) => handleDelete(e, stock.code)}
                      className="absolute top-2 right-2 p-1.5 text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all z-10"
                      title="종목 삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-sm font-bold group-hover:text-blue-400 transition-colors pr-6">{stock.name}</p>
                      <span className="text-xs text-slate-500 font-mono">{stock.code}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-lg font-black">{stock.price?.toLocaleString()}원</p>
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
