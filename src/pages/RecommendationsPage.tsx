import { useState, useEffect } from 'react';
import { Zap, RefreshCw, TrendingUp } from 'lucide-react';
import { stockApi } from '../api/stockApi';
import RecommendedStockCard from '../components/RecommendedStockCard';
import type { Recommendation, StockSummary } from '../types/stock';

interface RecommendationsPageProps {
  onDetailClick: (stock: StockSummary) => void;
}

const RecommendationsPage = ({ onDetailClick }: RecommendationsPageProps) => {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  useEffect(() => {
    const fetchRecommendations = async () => {
      try {
        const data = await stockApi.getRecommendations();
        setRecommendations(data);
      } catch (error) {
        console.error('Failed to fetch recommendations:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchRecommendations();
  }, []);

  const categories = Array.from(new Set(recommendations.map(r => r.category)));
  const filtered = activeCategory
    ? recommendations.filter(r => r.category === activeCategory)
    : recommendations;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <RefreshCw className="animate-spin mr-2" size={20} />
        <span>유망 종목 분석 중...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">오늘의 유망 종목</h2>
          <p className="text-slate-500 text-sm">시장 데이터를 분석해 상승 여력이 있는 종목을 추천해요.</p>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            stockApi.getRecommendations().then(data => {
              setRecommendations(data);
              setLoading(false);
            });
          }}
          className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-500 transition-colors flex items-center space-x-2 shrink-0"
        >
          <Zap size={14} />
          <span>업데이트</span>
        </button>
      </div>

      {/* Summary Stats */}
      {recommendations.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 text-center">
            <p className="text-2xl font-black text-blue-400">{recommendations.length}</p>
            <p className="text-[10px] text-slate-500 mt-1">추천 종목 수</p>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 text-center">
            <p className="text-2xl font-black text-emerald-400">{categories.length}</p>
            <p className="text-[10px] text-slate-500 mt-1">업종 분야</p>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 text-center">
            <p className="text-2xl font-black text-yellow-400">
              {Math.round(recommendations.reduce((a, r) => a + r.score, 0) / recommendations.length)}
            </p>
            <p className="text-[10px] text-slate-500 mt-1">평균 추천 점수</p>
          </div>
        </div>
      )}

      {/* Category Filter Tabs */}
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeCategory === null
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
            }`}
          >
            전체 ({recommendations.length})
          </button>
          {categories.map(cat => {
            const count = recommendations.filter(r => r.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeCategory === cat
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                }`}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Cards Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map(stock => (
            <RecommendedStockCard key={stock.code} stock={stock} onDetailClick={onDetailClick} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-slate-900/20 border border-dashed border-slate-800 rounded-3xl">
          <TrendingUp size={40} className="mx-auto text-slate-700 mb-4" />
          <p className="text-slate-500 mb-2">현재 추천할 종목이 없어요.</p>
          <p className="text-slate-600 text-sm">시장 상황이 변하면 자동으로 업데이트됩니다.</p>
        </div>
      )}
    </div>
  );
};

export default RecommendationsPage;
