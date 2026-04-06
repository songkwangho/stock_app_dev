import { useState, useEffect } from 'react';
import {
  Wallet, TrendingUp, LayoutDashboard, ArrowUpRight, RefreshCw, ArrowRight
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import StatCard from '../components/StatCard';
import { stockApi } from '../api/stockApi';
import type { Holding, StockSummary } from '../types/stock';

interface PortfolioHistoryEntry {
  date: string;
  value: number;
  cost: number;
  profitRate: number;
}

interface DashboardPageProps {
  holdings: Holding[];
  onNavigate: (tab: string) => void;
  onDetailClick: (stock: StockSummary) => void;
}

const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#6366f1', '#ec4899', '#8b5cf6'];

const DashboardPage = ({ holdings, onNavigate, onDetailClick }: DashboardPageProps) => {
  const [portfolioHistory, setPortfolioHistory] = useState<PortfolioHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const data = await stockApi.getHoldingsHistory();
        setPortfolioHistory(data);
      } catch (error) {
        console.error('Failed to fetch portfolio history:', error);
      } finally {
        setHistoryLoading(false);
      }
    };
    if (holdings.length > 0) {
      fetchHistory();
    } else {
      setHistoryLoading(false);
    }
  }, [holdings.length]);

  const portfolioData = holdings.length > 0
    ? holdings.map((h, i) => ({
      name: h.name,
      value: h.value,
      color: COLORS[i % COLORS.length],
    }))
    : [{ name: '보유 종목 없음', value: 100, color: '#1e293b' }];

  const chartData = portfolioHistory.map(d => ({
    date: d.date.slice(4, 6) + '/' + d.date.slice(6, 8),
    value: d.value,
    profitRate: d.profitRate,
  }));

  const totalAsset = holdings.reduce((acc, cur) => acc + (cur.currentPrice * (cur.quantity || 0)), 0);
  const totalCost = holdings.reduce((acc, cur) => acc + (cur.avgPrice * (cur.quantity || 0)), 0);
  const totalPnL = totalAsset - totalCost;
  const avgProfitRate = totalCost > 0 ? (totalPnL / totalCost * 100) : 0;

  const latestHistory = portfolioHistory.length > 0 ? portfolioHistory[portfolioHistory.length - 1] : null;
  const firstHistory = portfolioHistory.length > 1 ? portfolioHistory[0] : null;
  const assetChange = (latestHistory && firstHistory && firstHistory.value > 0)
    ? ((latestHistory.value - firstHistory.value) / firstHistory.value * 100).toFixed(1)
    : null;
  const assetChangePositive = assetChange !== null ? parseFloat(assetChange) >= 0 : true;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <StatCard
          title="총 자산"
          value={`₩${totalAsset.toLocaleString()}`}
          change={assetChange !== null ? `${assetChangePositive ? '+' : ''}${assetChange}%` : undefined}
          positive={assetChangePositive}
          icon={<Wallet size={24} />}
        />
        <StatCard
          title="총 평가 손익 (내가 번/잃은 금액)"
          value={`₩${totalPnL.toLocaleString()}`}
          change={`${avgProfitRate >= 0 ? '+' : ''}${avgProfitRate.toFixed(1)}%`}
          positive={totalPnL >= 0}
          icon={<TrendingUp size={24} />}
        />
        <StatCard
          title="보유 종목수"
          value={holdings.length.toString()}
          icon={<LayoutDashboard size={24} />}
        />
        <StatCard
          title="수익률 (투자 대비 수익)"
          value={`${avgProfitRate >= 0 ? '+' : ''}${avgProfitRate.toFixed(2)}%`}
          positive={avgProfitRate >= 0}
          icon={<ArrowUpRight size={24} />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold">포트폴리오 수익률 추이</h3>
              <span className="text-xs text-slate-500">최근 {portfolioHistory.length}거래일 기준</span>
            </div>
            <div className="h-80 w-full">
              {historyLoading ? (
                <div className="flex items-center justify-center h-full text-slate-500">
                  <RefreshCw className="animate-spin mr-2" size={20} />
                  <span>데이터 로딩 중...</span>
                </div>
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="date" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `₩${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                      formatter={(value: number) => [`₩${value.toLocaleString()}`, '포트폴리오 가치']}
                    />
                    <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-600">
                  <p className="text-sm">보유 종목을 추가하면 수익률 추이가 표시됩니다.</p>
                </div>
              )}
            </div>
          </div>

          {/* Holdings Overview (read-only) + manage link */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold">내 보유 종목</h3>
              <button
                onClick={() => onNavigate('analysis')}
                className="text-xs text-blue-400 font-bold flex items-center space-x-1 transition-colors px-4 py-3 min-h-[44px]"
              >
                <span>포트폴리오 관리</span>
                <ArrowRight size={14} />
              </button>
            </div>
            <div className="max-h-64 overflow-auto space-y-2 pr-2 custom-scrollbar">
              {holdings.map((stock) => {
                const pnlRate = stock.avgPrice ? ((stock.currentPrice - stock.avgPrice) / stock.avgPrice * 100) : 0;
                return (
                  <div
                    key={stock.code}
                    onClick={() => onDetailClick({ ...stock, category: '보유 종목' })}
                    className="flex items-center justify-between p-3 bg-slate-950 rounded-2xl border border-slate-800/50 hover:border-blue-500/30 cursor-pointer transition-all"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center font-bold text-xs text-blue-400">
                        {stock.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <p className="text-sm font-bold">{stock.name}</p>
                          <p className="text-xs text-slate-500 bg-slate-900 px-1.5 rounded">{stock.value}%</p>
                        </div>
                        <div className="flex items-center space-x-2 flex-wrap">
                          <p className="text-xs text-slate-500">평단: ₩{stock.avgPrice?.toLocaleString()}</p>
                          {stock.quantity > 0 && <p className="text-xs text-slate-500">x {stock.quantity}주</p>}
                          <p className={`text-xs font-bold ${pnlRate >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {pnlRate >= 0 ? '+' : ''}{pnlRate.toFixed(1)}%
                          </p>
                          {stock.quantity > 0 && (
                            <p className="text-xs text-slate-500">
                              평가: ₩{(stock.currentPrice * stock.quantity).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {holdings.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-slate-600 text-sm mb-3">아직 보유 종목이 없습니다.</p>
                  <button
                    onClick={() => onNavigate('analysis')}
                    className="text-xs text-blue-400 font-bold transition-colors px-4 py-3 min-h-[44px]"
                  >
                    내 포트폴리오에서 종목 추가하기 →
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6">
          <h3 className="text-lg font-semibold mb-6">자산 배분 현황</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={portfolioData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {portfolioData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3">
            {portfolioData.map((item) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: item.color }}></div>
                  <span className="text-sm text-slate-400">{item.name}</span>
                </div>
                <span className="text-sm font-medium">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
