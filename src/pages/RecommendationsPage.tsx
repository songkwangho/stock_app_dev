import { useState, useEffect } from 'react';
import { Zap, RefreshCw } from 'lucide-react';
import { stockApi } from '../api/stockApi';
import RecommendedStockCard from '../components/RecommendedStockCard';
import type { Recommendation, StockSummary } from '../types/stock';

interface RecommendationsPageProps {
  onDetailClick: (stock: StockSummary) => void;
}

const RecommendationsPage = ({ onDetailClick }: RecommendationsPageProps) => {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <RefreshCw className="animate-spin mr-2" size={20} />
        <span>유망 종목 분석 중...</span>
      </div>
    );
  }

  return (
    <div className="space-y-12 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">오늘의 유망 종목</h2>
          <p className="text-slate-500 text-sm">실시간 시장 데이터를 기반으로 알고리즘이 추천하는 투자 유망 종목입니다.</p>
        </div>
        <div className="flex space-x-2">
          <button className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-semibold hover:bg-slate-800 transition-colors">
            필터 설정
          </button>
          <button
            onClick={() => {
              setLoading(true);
              stockApi.getRecommendations().then(data => {
                setRecommendations(data);
                setLoading(false);
              });
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-500 transition-colors flex items-center space-x-2"
          >
            <Zap size={14} />
            <span>분석 업데이트</span>
          </button>
        </div>
      </div>

      {categories.map(category => (
        <div key={category} className="space-y-6">
          <div className="flex items-center space-x-4">
            <h3 className="text-lg font-bold text-white border-l-4 border-blue-600 pl-4">{category}</h3>
            <div className="flex-1 h-px bg-slate-800"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recommendations.filter(r => r.category === category).map(stock => (
              <RecommendedStockCard key={stock.code} stock={stock} onDetailClick={onDetailClick} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default RecommendationsPage;
