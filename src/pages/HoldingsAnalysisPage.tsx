import { TrendingUp } from 'lucide-react';
import type { Holding, StockSummary } from '../types/stock';

interface HoldingsAnalysisPageProps {
  holdings: Holding[];
  onDetailClick: (stock: StockSummary) => void;
}

const HoldingsAnalysisPage = ({ holdings, onDetailClick }: HoldingsAnalysisPageProps) => {
  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold mb-2">보유 종목 전망 분석</h2>
        <p className="text-slate-500 text-sm">현재 보유 중인 종목들에 대한 통계적 추세 및 향후 전망을 전문적으로 분석합니다.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {holdings.map((stock, idx) => {
          const profit = stock.currentPrice && stock.avgPrice ? (stock.currentPrice - stock.avgPrice) : 0;
          const profitRate = stock.avgPrice ? (profit / stock.avgPrice * 100).toFixed(2) : '0';

          return (
            <div key={idx} className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 hover:border-blue-500/30 transition-all group">
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 rounded-2xl bg-slate-950 flex items-center justify-center font-bold text-lg text-blue-400 border border-slate-800">
                    {stock.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">{stock.name}</h3>
                    <p className="text-xs text-slate-500 font-mono">{stock.code}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">수익률</p>
                  <p className={`text-xl font-black ${parseFloat(profitRate) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {parseFloat(profitRate) >= 0 ? '+' : ''}{profitRate}%
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/50">
                  <p className="text-[10px] text-slate-500 mb-1">매수가</p>
                  <p className="text-sm font-bold">₩{stock.avgPrice?.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/50">
                  <p className="text-[10px] text-slate-500 mb-1">현재가</p>
                  <p className="text-sm font-bold">₩{(stock.currentPrice !== undefined && stock.currentPrice !== null) ? stock.currentPrice.toLocaleString() : '---'}</p>
                </div>
              </div>

              <button
                onClick={() => onDetailClick({ ...stock, category: '보유 종목' })}
                className="w-full py-3 bg-slate-950 hover:bg-blue-600 text-slate-300 hover:text-white border border-slate-800 hover:border-blue-500 rounded-2xl text-xs font-bold transition-all flex items-center justify-center space-x-2"
              >
                <TrendingUp size={14} />
                <span>상세 분석 및 차트 보기</span>
              </button>
            </div>
          );
        })}
      </div>

      {holdings.length === 0 && (
        <div className="text-center py-20 bg-slate-900/20 border border-dashed border-slate-800 rounded-3xl">
          <p className="text-slate-500">분석할 보유 종목이 없습니다. 대시보드에서 종목을 추가해 주세요.</p>
        </div>
      )}
    </div>
  );
};

export default HoldingsAnalysisPage;
