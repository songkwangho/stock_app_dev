import { useState, useEffect } from 'react';
import {
  Wallet, TrendingUp, LayoutDashboard, ArrowUpRight, RefreshCw, ArrowRight
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import StatCard from '../components/StatCard';
import ErrorBanner from '../components/ErrorBanner';
import { stockApi } from '../api/stockApi';
import { getDataFreshnessShort } from '../utils/dataFreshness';
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
  marketIndices?: { symbol: string; value: number | null; changeRate: string; positive: boolean }[];
}

const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#6366f1', '#ec4899', '#8b5cf6'];

const DashboardPage = ({ holdings, onNavigate, onDetailClick, marketIndices = [] }: DashboardPageProps) => {
  const [portfolioHistory, setPortfolioHistory] = useState<PortfolioHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const fetchHistory = async () => {
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      const data = await stockApi.getHoldingsHistory();
      setPortfolioHistory(data);
    } catch (error) {
      console.error('Failed to fetch portfolio history:', error);
      setHistoryError('포트폴리오 추이를 불러오지 못했어요. 네트워크 또는 서버 상태를 확인해 주세요.');
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (holdings.length > 0) {
      fetchHistory();
    } else {
      setHistoryLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings.length]);

  const portfolioData = holdings.length > 0
    ? holdings.map((h, i) => ({
      name: h.name,
      value: h.value,
      color: COLORS[i % COLORS.length],
    }))
    : [{ name: '보유 종목 없음', value: 100, color: '#1e293b' }];

  // 차트용 데이터 변환: "20240115" → "1/15" + 툴팁용 한국어 풀 날짜
  const chartData = portfolioHistory.map(d => ({
    date: parseInt(d.date.slice(4, 6)) + '/' + parseInt(d.date.slice(6, 8)),
    fullDate: `${parseInt(d.date.slice(4, 6))}월 ${parseInt(d.date.slice(6, 8))}일`,
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
      {/* 빈 포트폴리오 CTA (온보딩 진행 중이 아닐 때만 표시) */}
      {holdings.length === 0 && localStorage.getItem('onboarding_done') && (
        <div className="bg-gradient-to-br from-blue-600/10 to-emerald-600/10 border border-blue-500/20 rounded-3xl p-8 text-center">
          <h2 className="text-xl font-bold mb-3">주식 분석을 시작해 보세요!</h2>
          <p className="text-slate-400 text-sm mb-6 leading-relaxed max-w-md mx-auto">
            보유 종목을 추가하면 수익률 추적, 매수/매도 의견, 알림을 받을 수 있어요.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button onClick={() => onNavigate('analysis')} className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-colors">
              종목 추가하기
            </button>
            <button onClick={() => onNavigate('recommendations')} className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-bold transition-colors">
              추천 종목 둘러보기
            </button>
          </div>
        </div>
      )}
      {holdings.length > 0 && (() => {
        const dates = holdings.map(h => (h as unknown as { last_updated?: string }).last_updated).filter(Boolean);
        if (!dates.length) return null;
        const latest = Math.max(...dates.map(d => new Date(d as string).getTime()));
        return <p className="text-xs text-slate-600">마지막 업데이트: {getDataFreshnessShort(new Date(latest).toISOString())}</p>;
      })()}
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
          title="수익률 (투자 대비 수익, 매입가 기준)"
          value={`${avgProfitRate >= 0 ? '+' : ''}${avgProfitRate.toFixed(2)}%`}
          positive={avgProfitRate >= 0}
          icon={<ArrowUpRight size={24} />}
          subtitle={totalCost > 0
            ? `₩${totalCost.toLocaleString()} → ₩${totalAsset.toLocaleString()} (가중 평균)`
            : '투자금액 기준 가중 평균'}
          tooltip={(() => {
            const kospi = marketIndices.find(m => m.symbol === 'KOSPI');
            // KOSPI 데이터 미수신 시 비교 라인 자체를 숨김 (부분 로딩 상태에서 잘못된 비교 방지)
            if (!kospi || !kospi.changeRate) return undefined;
            return {
              label: `오늘 KOSPI ${kospi.positive ? '+' : ''}${kospi.changeRate}`,
              text: 'KOSPI는 오늘 하루 변동률이에요. 내 수익률(매입 이후 전체 기간)과 직접 비교하기 어려워요. 정밀한 같은 기간 비교는 Phase 4 백테스팅 모듈에서 도입돼요.',
            };
          })()}
        />
      </div>

      <ErrorBanner error={historyError} kind="server" onRetry={fetchHistory} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold">포트폴리오 수익률 추이</h3>
              <span className="text-xs text-slate-500">최근 {portfolioHistory.length}거래일 기준</span>
            </div>
            {/* 첫 / 마지막 데이터 포인트의 절대 날짜 표시 — 초보자가 차트 X축 범위를 즉시 파악할 수 있도록 */}
            {chartData.length > 1 && (
              <p className="text-xs text-slate-600 mb-3">
                {chartData[0].fullDate} ~ {chartData[chartData.length - 1].fullDate}
              </p>
            )}
            <div className="h-80 w-full">
              {historyLoading ? (
                <div className="flex items-center justify-center h-full text-slate-500">
                  <RefreshCw className="animate-spin mr-2" size={20} />
                  <span>데이터 로딩 중...</span>
                </div>
              ) : chartData.length > 0 ? (() => {
                // 오늘 수익이 마이너스이면 차트 색상을 빨간색으로 변경 (avgProfitRate 기준)
                const isLoss = avgProfitRate < 0;
                const lineColor = isLoss ? '#ef4444' : '#3b82f6';
                return (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={lineColor} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="date" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `₩${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ''}
                      formatter={(value: number | undefined) => [`₩${(value ?? 0).toLocaleString()}`, '평가금액']}
                    />
                    <Area type="monotone" dataKey="value" stroke={lineColor} strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                  </AreaChart>
                </ResponsiveContainer>
                );
              })() : (
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

      {/* 전체 종목 보기 진입 카드 */}
      <button
        onClick={() => onNavigate('major')}
        className="w-full p-4 bg-slate-900/50 hover:bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between transition-colors text-left"
      >
        <div>
          <p className="text-sm font-bold">전체 종목 보기</p>
          <p className="text-xs text-slate-500 mt-0.5">삼성전자, 현대차 등 97개 주요 종목을 살펴보세요</p>
        </div>
        <span className="text-blue-400">→</span>
      </button>
    </div>
  );
};

export default DashboardPage;
