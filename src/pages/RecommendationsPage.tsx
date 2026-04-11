import { useState, useEffect } from 'react';
import { Zap, RefreshCw, TrendingUp, Layers } from 'lucide-react';
import { stockApi } from '../api/stockApi';
import RecommendedStockCard from '../components/RecommendedStockCard';
import { useNavigationStore } from '../stores/useNavigationStore';
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
          <p className="text-slate-500 text-sm">시장 데이터를 분석해 적정가 대비 저평가된 종목을 선별했어요.</p>
          <p className="text-xs text-yellow-500/80 mt-1">아래 종목들은 알고리즘이 분석한 참고 정보예요. 투자 결정은 항상 본인이 직접 판단해주세요.</p>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            stockApi.getRecommendations().then(data => {
              setRecommendations(data);
            }).catch(error => {
              console.error('Recommendations refresh failed:', error);
            }).finally(() => {
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
            <p className="text-xs text-slate-500 mt-1">추천 종목 수</p>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 text-center">
            <p className="text-2xl font-black text-emerald-400">{categories.length}</p>
            <p className="text-xs text-slate-500 mt-1">업종 분야</p>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 text-center">
            <p className="text-2xl font-black text-yellow-400">
              {Math.round(recommendations.reduce((a, r) => a + r.score, 0) / recommendations.length)}
            </p>
            <p className="text-xs text-slate-500 mt-1">평균 추천 점수</p>
          </div>
        </div>
      )}

      {/* Category Filter Tabs */}
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
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
                className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
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
        // 빈 추천 목록 — 특히 syncAllStocks가 완료되기 전에는 긍정적 market_opinion이 없어 비어있을 수 있음 (14차 P3-2)
        <div className="text-center py-16 bg-slate-900/20 border border-dashed border-slate-800 rounded-3xl px-6">
          <TrendingUp size={40} className="mx-auto text-slate-700 mb-4" />
          <p className="text-slate-300 font-bold mb-2">지금 데이터를 분석 중이에요</p>
          <p className="text-slate-500 text-sm leading-relaxed mb-1">
            하루 1회(오전 8시) 97종목을 분석해 유망 종목을 선정해요.
          </p>
          <p className="text-slate-600 text-xs leading-relaxed">
            첫 실행 시에는 전체 분석이 끝날 때까지 10~15분 정도 걸릴 수 있어요.
          </p>
        </div>
      )}

      {/* 모바일 한정: 전체 종목 보기 */}
      <button
        onClick={() => useNavigationStore.getState().navigateTo('major')}
        className="md:hidden w-full p-4 bg-slate-900/50 hover:bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between transition-colors"
      >
        <div className="flex items-center space-x-3">
          <Layers size={20} className="text-blue-400" />
          <div className="text-left">
            <p className="text-sm font-bold">전체 종목 보기</p>
            <p className="text-xs text-slate-500">8개 섹터별 97종목 한눈에</p>
          </div>
        </div>
        <span className="text-blue-400">→</span>
      </button>
    </div>
  );
};

export default RecommendationsPage;
