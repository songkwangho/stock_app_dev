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
          {/* algorithm 추천은 score=50 placeholder라 평균을 왜곡 → manual 추천만 평균 (15차 5-2) */}
          {(() => {
            const manual = recommendations.filter(r => r.source === 'manual');
            const avg = manual.length > 0
              ? Math.round(manual.reduce((a, r) => a + r.score, 0) / manual.length)
              : null;
            return (
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 text-center">
                <p className="text-2xl font-black text-yellow-400">
                  {avg !== null ? avg : '—'}
                </p>
                <p className="text-xs text-slate-500 mt-1">전문가 선정 평균 점수</p>
              </div>
            );
          })()}
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
      ) : (() => {
        // 16차 5-3: 현재 시간(KST) 기준으로 "왜 지금 없는지" 구체적으로 안내.
        //   오전 8시 이전 → 분석이 아직 시작 안 됨
        //   오전 8~9시대 → 분석 진행 중
        //   그 이후 → 오늘 매력 종목이 없는 것일 가능성
        // 17차 버그-3: 기존 `Date.now() + (getTimezoneOffset() + 9 * 60) * 60000`는
        // getTimezoneOffset()이 UTC 기준 음수 오프셋(KST는 -540)을 반환하므로 UTC 환경(Render)에서만 우연히 맞고
        // 다른 시간대의 클라이언트에서는 hour가 어긋남. Intl API로 Asia/Seoul hour를 직접 산출.
        const hour = parseInt(
            new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', hour12: false }).format(new Date()),
            10
        );
        let headline = '지금 매력적인 종목이 없어요';
        let body = '오늘 시장 상황에서는 긍정적인 종목이 없어요. 내일 다시 확인해보세요.';
        if (hour < 8) {
            const hoursUntil = 8 - hour;
            headline = '오늘 분석은 오전 8시부터 시작해요';
            body = `약 ${hoursUntil}시간 후 결과가 나와요.`;
        } else if (hour < 10) {
            headline = '지금 데이터를 분석 중이에요';
            body = '97종목 분석이 끝날 때까지 10~15분 정도 걸려요. 잠시 후 다시 확인해주세요.';
        }
        return (
          <div className="text-center py-16 bg-slate-900/20 border border-dashed border-slate-800 rounded-3xl px-6">
            <TrendingUp size={40} className="mx-auto text-slate-700 mb-4" />
            <p className="text-slate-300 font-bold mb-2">{headline}</p>
            <p className="text-slate-500 text-sm leading-relaxed">{body}</p>
          </div>
        );
      })()}

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
