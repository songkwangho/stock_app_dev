import { useState, useEffect } from 'react';
import {
  Wallet, TrendingUp, LayoutDashboard, ArrowUpRight, Plus, Trash2, RefreshCw
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
  onAdd: (stock: { code: string; name: string; value: number; avgPrice: number }) => Promise<void>;
  onDelete: (index: number) => Promise<void>;
  onDetailClick: (stock: StockSummary) => void;
}

const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#6366f1', '#ec4899', '#8b5cf6'];

const DashboardPage = ({ holdings, onAdd, onDelete, onDetailClick }: DashboardPageProps) => {
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

  // Compute real stats
  const totalAsset = holdings.reduce((acc, cur) => acc + (cur.currentPrice * cur.value), 0);
  const totalCost = holdings.reduce((acc, cur) => acc + (cur.avgPrice * cur.value), 0);
  const totalPnL = totalAsset - totalCost;
  const avgProfitRate = totalCost > 0 ? (totalPnL / totalCost * 100) : 0;

  // Compute change from portfolio history (latest vs first)
  const latestHistory = portfolioHistory.length > 0 ? portfolioHistory[portfolioHistory.length - 1] : null;
  const firstHistory = portfolioHistory.length > 1 ? portfolioHistory[0] : null;
  const assetChange = (latestHistory && firstHistory && firstHistory.value > 0)
    ? ((latestHistory.value - firstHistory.value) / firstHistory.value * 100).toFixed(1)
    : null;
  const assetChangePositive = assetChange !== null ? parseFloat(assetChange) >= 0 : true;

  const [newStock, setNewStock] = useState({ code: '', name: '', value: '', avgPrice: '', quantity: '' });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard
          title="총 자산"
          value={`₩${totalAsset.toLocaleString()}`}
          change={assetChange !== null ? `${assetChangePositive ? '+' : ''}${assetChange}%` : undefined}
          positive={assetChangePositive}
          icon={<Wallet size={24} />}
        />
        <StatCard
          title="총 평가 손익"
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
          title="수익률"
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
              <span className="text-[10px] text-slate-500">최근 20거래일 기준</span>
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

          <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold">내 보유 종목 관리</h3>
            </div>
            <div className="space-y-4">
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="종목 코드 (직접 입력)"
                  value={newStock.code}
                  onChange={(e) => setNewStock({ ...newStock, code: e.target.value })}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500 w-32"
                />
                <input
                  type="text"
                  placeholder="종목명"
                  value={newStock.name}
                  onChange={(e) => setNewStock({ ...newStock, name: e.target.value })}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500 w-full"
                />
                <input
                  type="number"
                  placeholder="비중 (%)"
                  value={newStock.value}
                  onChange={(e) => setNewStock({ ...newStock, value: e.target.value })}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500 w-24"
                />
                <input
                  type="number"
                  placeholder="매수가"
                  value={newStock.avgPrice}
                  onChange={(e) => setNewStock({ ...newStock, avgPrice: e.target.value })}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500 w-28"
                />
                <input
                  type="number"
                  placeholder="수량"
                  value={newStock.quantity}
                  onChange={(e) => setNewStock({ ...newStock, quantity: e.target.value })}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500 w-20"
                />
                <button
                  onClick={() => {
                    if (newStock.code && newStock.name && newStock.value && newStock.avgPrice) {
                      onAdd({
                        code: newStock.code,
                        name: newStock.name,
                        value: parseInt(newStock.value),
                        avgPrice: parseInt(newStock.avgPrice),
                        quantity: parseInt(newStock.quantity || '0'),
                      });
                      setNewStock({ code: '', name: '', value: '', avgPrice: '', quantity: '' });
                    }
                  }}
                  title="종목 추가"
                  className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-xl transition-colors"
                >
                  <Plus size={20} />
                </button>
              </div>
              <div className="max-h-64 overflow-auto space-y-2 pr-2 custom-scrollbar">
                {holdings.map((stock, idx) => {
                  const pnlRate = stock.avgPrice ? ((stock.currentPrice - stock.avgPrice) / stock.avgPrice * 100) : 0;
                  return (
                    <div key={idx} className="flex items-center justify-between p-3 bg-slate-950 rounded-2xl border border-slate-800/50 group">
                      <div className="flex items-center space-x-4">
                        <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center font-bold text-xs text-blue-400">
                          {stock.name.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <p className="text-sm font-bold">{stock.name}</p>
                            <p className="text-[10px] text-slate-500 bg-slate-900 px-1.5 rounded">{stock.value}%</p>
                          </div>
                          <div className="flex items-center space-x-2 flex-wrap">
                            <p className="text-[10px] text-slate-500">평단: ₩{stock.avgPrice?.toLocaleString()}</p>
                            {stock.quantity > 0 && <p className="text-[10px] text-slate-500">× {stock.quantity}주</p>}
                            <p className={`text-[10px] font-bold ${pnlRate >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                              {pnlRate >= 0 ? '+' : ''}{pnlRate.toFixed(1)}%
                            </p>
                            {stock.quantity > 0 && (
                              <p className="text-[10px] text-slate-500">
                                평가: ₩{(stock.currentPrice * stock.quantity).toLocaleString()}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => onDetailClick({
                            ...stock,
                            category: '보유 종목',
                          })}
                          className="text-[10px] font-bold text-blue-400 bg-blue-400/10 px-2 py-1 rounded-lg hover:bg-blue-400 hover:text-white transition-all"
                        >
                          퀵 분석
                        </button>
                        <button
                          onClick={() => onDelete(idx)}
                          className="text-slate-600 hover:text-red-400 p-2 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
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
