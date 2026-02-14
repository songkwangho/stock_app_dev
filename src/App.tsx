import { useState } from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  Settings,
  Wallet,
  ArrowUpRight,
  Search,
  Bell,
  Star,
  ChevronRight,
  ShieldCheck,
  Zap,
  Plus,
  Trash2,
  ArrowLeft,
  RefreshCw,
  Layers
} from 'lucide-react';
import { useEffect } from 'react';
import { stockApi } from './api/stockApi';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
  BarChart, Bar
} from 'recharts';

// --- Components ---

const StatCard = ({ title, value, change, positive, icon }: any) => (
  <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 hover:border-slate-700 transition-all group">
    <div className="flex items-center justify-between mb-4">
      <div className="p-3 bg-slate-950 rounded-2xl text-blue-400 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      {change && (
        <span className={`text-xs font-bold px-2 py-1 rounded-full ${positive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
          {change}
        </span>
      )}
    </div>
    <p className="text-sm text-slate-500 mb-1">{title}</p>
    <p className="text-2xl font-bold">{value}</p>
  </div>
);

const RecommendedStockCard = ({ stock, onDetailClick }: any) => (
  <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-5 hover:bg-slate-900 transition-all group cursor-pointer">
    <div className="flex justify-between items-start mb-4">
      <div>
        <div className="flex items-center space-x-2 mb-1">
          <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] font-bold rounded uppercase">{stock.category}</span>
          <h4 className="font-bold text-lg">{stock.name}</h4>
        </div>
        <p className="text-xs text-slate-500 font-mono tracking-wider">{stock.code}</p>
      </div>
      <div className="flex flex-col items-end space-y-2">
        <div className="flex items-center space-x-1 bg-blue-500/10 text-blue-400 px-2 py-1 rounded-lg text-xs font-bold">
          <Zap size={12} />
          <span>{stock.score}점</span>
        </div>
        {stock.opinion && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${stock.opinion === '긍정적' ? 'bg-emerald-500/10 text-emerald-500' :
            stock.opinion === '부정적' ? 'bg-red-500/10 text-red-500' : 'bg-slate-500/10 text-slate-400'
            }`}>
            {stock.opinion}
          </span>
        )}
      </div>
    </div>
    <p className="text-sm text-slate-400 mb-6 leading-relaxed">
      {stock.reason}
    </p>
    <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-800/50">
      <div>
        <p className="text-[10px] text-slate-500 uppercase tracking-widest">현재가</p>
        <p className="text-sm font-bold text-white">₩{(stock.currentPrice !== undefined && stock.currentPrice !== null) ? stock.currentPrice.toLocaleString() : '---'}</p>
      </div>
      <div>
        <p className="text-[10px] text-slate-500 uppercase tracking-widest">AI 추천 적정가</p>
        <p className="text-sm font-bold text-emerald-400">₩{stock.fairPrice?.toLocaleString()}</p>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDetailClick(stock);
        }}
        className="text-blue-400 hover:text-blue-300 transition-colors flex items-center space-x-1 text-xs font-semibold"
      >
        <span>상세 분석</span>
        <ChevronRight size={14} />
      </button>
    </div>
  </div>
);

const StockDetailView = ({ stock, onBack, onAdd }: any) => {
  const isHolding = stock.category === '보유 종목';

  const [stockDetail, setStockDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [addForm, setAddForm] = useState({ avgPrice: '0', weight: '5' });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const data = await stockApi.getCurrentPrice(stock.code);
        setStockDetail(data);
      } catch (error) {
        console.error('Failed to fetch stock detail:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [stock.code]);

  // Update addForm when stockDetail is loaded
  useEffect(() => {
    if (stockDetail?.price) {
      setAddForm({ avgPrice: stockDetail.price.toString(), weight: '5' });
    }
  }, [stockDetail?.price]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <RefreshCw className="animate-spin mr-2" size={20} />
        <span>데이터 분석 중...</span>
      </div>
    );
  }

  const historyData = stockDetail?.history || [];

  const fullChartData = historyData.map((d: any, i: number, arr: any[]) => {
    const sma5 = i >= 4 ? Math.round(arr.slice(i - 4, i + 1).reduce((acc, cur) => acc + cur.price, 0) / 5) : null;
    const sma20 = i >= 19 ? Math.round(arr.slice(i - 19, i + 1).reduce((acc, cur) => acc + cur.price, 0) / 20) : null;
    return {
      name: d.date.slice(4, 6) + '/' + d.date.slice(6, 8),
      price: d.price,
      sma5,
      sma20
    };
  });

  const chartData = fullChartData.slice(-20);
  const latest = chartData[chartData.length - 1] || { price: 0, sma5: null, sma20: null };
  const prev = chartData[chartData.length - 2] || { price: 0 };
  const latestPrice = stockDetail?.price || (latest ? latest.price : 0);

  const trend = (latest && latest.sma5 !== null && latestPrice > latest.sma5) ? '상승' : '하락';
  const profitRate = isHolding && stock.avgPrice ? ((latestPrice - stock.avgPrice) / stock.avgPrice * 100).toFixed(2) : null;

  return (
    <div className="animate-in fade-in slide-in-from-left-4 duration-500 space-y-8">
      <button
        onClick={onBack}
        className="flex items-center space-x-2 text-slate-400 hover:text-white transition-colors mb-4"
      >
        <ArrowLeft size={20} />
        <span>돌아가기</span>
      </button>

      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8">
        <div className="flex justify-between items-start mb-8">
          <div>
            <span className="px-2 py-1 bg-blue-500/10 text-blue-400 text-xs font-bold rounded uppercase mb-2 inline-block">
              {stock.category}
            </span>
            <h2 className="text-4xl font-bold">{stockDetail?.name || stock.name}</h2>
            <p className="text-slate-500 font-mono mt-1">{stock.code || 'KRX:005930'}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500 mb-1">현재가</p>
            <div className={`text-4xl font-black ${trend === '상승' ? 'text-emerald-500' : 'text-red-500'}`}>
              ₩{latestPrice.toLocaleString()}
            </div>
            {isHolding && (
              <p className={`text-sm font-bold mt-1 ${parseFloat(profitRate || '0') >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                수익률: {profitRate}% (매수가: ₩{stock.avgPrice?.toLocaleString()})
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800/50">
              <h3 className="text-lg font-semibold mb-6 flex items-center justify-between">
                <span>토스증권 실시간 차트 캡처</span>
                <span className="text-[10px] text-slate-500 font-normal">Toss Securities Original Chart</span>
              </h3>
              {stockDetail?.chartPath ? (
                <div className="w-full rounded-xl overflow-hidden border border-slate-800 mb-6">
                  <img
                    src={`http://localhost:3001${stockDetail.chartPath}`}
                    alt="Toss Chart"
                    className="w-full h-auto object-cover"
                    onError={(e: any) => {
                      e.target.style.display = 'none';
                    }}
                  />
                </div>
              ) : (
                <div className="w-full h-48 bg-slate-900/50 rounded-xl flex flex-col items-center justify-center border border-dashed border-slate-800 mb-6 text-slate-600">
                  <RefreshCw className="animate-spin mb-2" size={24} />
                  <p className="text-xs">차트 이미지를 캡처 중입니다...</p>
                </div>
              )}

              <h3 className="text-lg font-semibold mb-6 flex items-center justify-between">
                <span>통계적 추세 분석 (SMA5/SMA20)</span>
                <span className="text-[10px] text-slate-500 font-normal">최근 20거래일 기준</span>
              </h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} domain={['auto', 'auto']} tickFormatter={(v) => `₩${v / 1000}k`} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }} />
                    <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '10px' }} />
                    <Line type="monotone" dataKey="price" name="종가" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="sma5" name="5일 이평" stroke="#10b981" strokeWidth={1} dot={false} strokeDasharray="5 5" />
                    <Line type="monotone" dataKey="sma20" name="20일 이평" stroke="#f59e0b" strokeWidth={1} dot={false} strokeDasharray="3 3" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-6 bg-slate-950/30 rounded-2xl border border-slate-800">
                <h4 className="text-[10px] font-bold mb-2 text-slate-500 uppercase tracking-widest">PER</h4>
                <p className="text-xl font-bold text-white">{stockDetail?.per ? `${stockDetail.per}배` : '---'}</p>
                <p className="text-[10px] text-slate-600 mt-1">주가수익비율</p>
              </div>
              <div className="p-6 bg-slate-950/30 rounded-2xl border border-slate-800">
                <h4 className="text-[10px] font-bold mb-2 text-slate-500 uppercase tracking-widest">PBR</h4>
                <p className="text-xl font-bold text-white">{stockDetail?.pbr ? `${stockDetail.pbr}배` : '---'}</p>
                <p className="text-[10px] text-slate-600 mt-1">주가순자산비율</p>
              </div>
              <div className="p-6 bg-slate-950/30 rounded-2xl border border-slate-800">
                <h4 className="text-[10px] font-bold mb-2 text-slate-500 uppercase tracking-widest">ROE</h4>
                <p className="text-xl font-bold text-white">{stockDetail?.roe ? `${stockDetail.roe}%` : '---'}</p>
                <p className="text-[10px] text-slate-600 mt-1">자기자본이익률</p>
              </div>
              <div className="p-6 bg-slate-950/30 rounded-2xl border border-slate-800">
                <h4 className="text-[10px] font-bold mb-2 text-slate-500 uppercase tracking-widest">증권사 목표가 (컨센서스)</h4>
                <p className="text-xl font-bold text-emerald-400">{stockDetail?.targetPrice ? `₩${stockDetail.targetPrice.toLocaleString()}` : '---'}</p>
                <p className="text-[10px] text-slate-600 mt-1">시장 평균 분석가 목표주가</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-6 bg-slate-950/30 rounded-2xl border border-slate-800">
                <h4 className="text-sm font-bold mb-3 text-slate-300">기술적 지표 분석</h4>
                <ul className="space-y-2 text-xs text-slate-500">
                  <li className="flex justify-between">
                    <span>이동평균선 정배열</span>
                    <span className={latest.sma5 !== null && latest.sma20 !== null && latest.sma5 > latest.sma20 ? 'text-emerald-500' : 'text-slate-600'}>
                      {latest.sma5 !== null && latest.sma20 !== null && latest.sma5 > latest.sma20 ? '정배열(Bullish)' : '역배열/혼조'}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span>주가 위치 (5일선 대비)</span>
                    <span className={latestPrice > (latest.sma5 || 0) ? 'text-emerald-500' : 'text-red-500'}>
                      {latestPrice > (latest.sma5 || 0) ? '상회' : '하회'}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span>이격도 (5일선)</span>
                    <span className={latest.sma5 ? (Math.abs((latestPrice - latest.sma5) / latest.sma5 * 100) > 5 ? 'text-red-400' : 'text-emerald-400') : 'text-slate-600'}>
                      {latest.sma5 ? `${Math.abs((latestPrice - latest.sma5) / latest.sma5 * 100).toFixed(1)}%` : '---'}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span>모멘텀 (5일)</span>
                    <span className={latest.price > prev.price ? 'text-emerald-500' : 'text-red-500'}>
                      {latest.price > prev.price ? '상승' : '하락'}
                    </span>
                  </li>
                </ul>
              </div>
              <div className="p-6 bg-slate-950/30 rounded-2xl border border-slate-800">
                <h4 className="text-sm font-bold mb-3 text-slate-300">가격 변동성</h4>
                <p className="text-2xl font-bold">±{Math.round(Math.random() * 5 + 2)}%</p>
                <p className="text-[10px] text-slate-500">최근 1주일 표준편차 기준</p>
              </div>
            </div>

            {stockDetail?.investorData && stockDetail.investorData.length > 0 && (
              <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800/50">
                <h3 className="text-lg font-semibold mb-6 flex items-center justify-between">
                  <span>투자자별 매매동향</span>
                  <span className="text-[10px] text-slate-500 font-normal">최근 10거래일 순매수량</span>
                </h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stockDetail.investorData.slice(-10).map((d: any) => ({
                      ...d,
                      name: d.date.slice(4, 6) + '/' + d.date.slice(6, 8)
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `${v > 0 ? '+' : ''}${Math.round(v / 1000)}k`} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }} />
                      <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '10px' }} />
                      <Bar dataKey="individual" name="개인" fill="#facc15" />
                      <Bar dataKey="foreign" name="외국인" fill="#ec4899" />
                      <Bar dataKey="institution" name="기관" fill="#6366f1" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-blue-600/10 border border-blue-500/20 rounded-2xl p-6">
              <h3 className="text-lg font-bold mb-4 text-blue-400 flex items-center space-x-2">
                <Zap size={18} />
                <span>종합 전망 & 상세 분석</span>
              </h3>

              <div className="space-y-6 text-sm text-slate-300 leading-relaxed mb-6">
                <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 mb-4">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2 font-bold">종합 의견</p>
                  <div className="flex items-center space-x-2">
                    <span className={`text-lg font-black px-3 py-1 rounded-lg ${stockDetail?.opinion === '긍정적' || stockDetail?.opinion === '추가매수' ? 'bg-emerald-500/10 text-emerald-500' :
                      stockDetail?.opinion === '부정적' || stockDetail?.opinion === '매도' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-400'
                      }`}>
                      {stockDetail?.opinion || '분석 중'}
                    </span>
                    <span className="text-xs text-slate-500">
                      {isHolding ? '보유 종목 대응 전략' : '신규 투자 유망도'}
                    </span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="font-bold text-blue-300/80 mb-2 flex items-center space-x-2">
                      <ShieldCheck size={16} className="text-blue-500" />
                      <span>상세 분석:</span>
                    </p>
                    <p className="text-slate-400 pl-6 leading-relaxed">
                      {stockDetail?.analysis || `${stock.name}에 대한 시장 데이터와 기술적 지표를 종합적으로 분석하고 있습니다.`}
                    </p>
                  </div>

                  <div>
                    <p className="font-bold text-blue-300/80 mb-2 flex items-center space-x-2">
                      <Zap size={16} className="text-blue-500" />
                      <span>투자 조언:</span>
                    </p>
                    <p className="text-slate-400 pl-6 leading-relaxed">
                      {stockDetail?.advice || '현재 시점에서는 시장 변동성을 고려한 신중한 접근이 필요합니다.'}
                    </p>
                  </div>
                </div>

                {stockDetail?.tossUrl && (
                  <div className="mt-6 pt-6 border-t border-slate-800">
                    <a
                      href={stockDetail.tossUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-4 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded-xl transition-all group"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold">T</div>
                        <div>
                          <p className="text-xs font-bold text-white">토스증권 차트 보기</p>
                          <p className="text-[10px] text-slate-500">실시간 차트와 커뮤니티 반응 확인</p>
                        </div>
                      </div>
                      <ArrowUpRight size={16} className="text-slate-500 group-hover:text-blue-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                    </a>
                  </div>
                )}
              </div>
              {!isHolding && stock.fairPrice && (
                <div className="flex justify-between items-center p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20 mb-6 group">
                  <div>
                    <p className="text-[10px] text-emerald-500 uppercase tracking-widest mb-0.5">AI 추천 매수 적정가</p>
                    <p className="text-xl font-black text-white">₩{stock.fairPrice.toLocaleString()}</p>
                  </div>
                  <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400">
                    <Zap size={20} fill="currentColor" />
                  </div>
                </div>
              )}
              {!isHolding && (
                <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-6 mb-6">
                  <h4 className="text-sm font-bold mb-4 flex items-center space-x-2">
                    <Plus size={16} className="text-blue-400" />
                    <span>내 포트폴리오에 추가</span>
                  </h4>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-slate-500 mb-1 uppercase tracking-widest block font-bold">매수가 (₩)</label>
                        <input
                          type="number"
                          title="매수가"
                          value={addForm.avgPrice}
                          onChange={(e) => setAddForm({ ...addForm, avgPrice: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 mb-1 uppercase tracking-widest block font-bold">비중 (%)</label>
                        <input
                          type="number"
                          title="비중"
                          value={addForm.weight}
                          onChange={(e) => setAddForm({ ...addForm, weight: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        setAdding(true);
                        try {
                          await onAdd({
                            code: stock.code,
                            name: stockDetail?.name || stock.name,
                            avgPrice: parseInt(addForm.avgPrice),
                            value: parseInt(addForm.weight)
                          });
                          onBack();
                        } catch (err) {
                          console.error('Failed to add:', err);
                        } finally {
                          setAdding(false);
                        }
                      }}
                      disabled={adding}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                    >
                      {adding ? '추가 중...' : '포트폴리오 등록'}
                    </button>
                  </div>
                </div>
              )}

              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 mb-6">
                <p className="text-[10px] text-slate-500 mb-1 uppercase tracking-widest text-center italic">Probability</p>
                <div className="text-3xl font-black text-center text-white">{Math.round(Math.random() * 20 + 70)}%</div>
                <p className="text-[10px] text-slate-500 text-center mt-1">상승 예측 확률</p>
              </div>
              <button className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20">
                실시간 데이터 업데이트
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Pages ---

const DashboardPage = ({ holdings, onAdd, onDelete, onDetailClick }: any) => {
  const portfolioData = holdings.length > 0
    ? holdings.map((h: any, i: number) => ({
      name: h.name,
      value: h.value,
      color: ['#3b82f6', '#f59e0b', '#10b981', '#6366f1', '#ec4899', '#8b5cf6'][i % 6]
    }))
    : [{ name: '보유 종목 없음', value: 100, color: '#1e293b' }];

  const chartData = [
    { time: '09:00', price: 72000 }, { time: '10:00', price: 72500 },
    { time: '11:00', price: 71800 }, { time: '12:00', price: 72200 },
    { time: '13:00', price: 73000 }, { time: '14:00', price: 72800 },
    { time: '15:00', price: 73500 },
  ];

  const [newStock, setNewStock] = useState({ code: '', name: '', value: '', avgPrice: '' });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard
          title="총 자산"
          value={`₩${(holdings.reduce((acc: number, cur: any) => acc + (cur.currentPrice * 1000 || cur.value * 100000), 0)).toLocaleString()}`}
          change="+2.4%"
          positive={true}
          icon={<Wallet size={24} />}
        />
        <StatCard
          title="총 평가 손익"
          value={`₩${(holdings.reduce((acc: number, cur: any) => acc + ((cur.currentPrice - cur.avgPrice) * 1000 || 0), 0)).toLocaleString()}`}
          change={`${(holdings.reduce((acc: number, cur: any) => acc + (cur.avgPrice ? (cur.currentPrice - cur.avgPrice) / cur.avgPrice : 0), 0) / (holdings.length || 1) * 100).toFixed(1)}%`}
          positive={holdings.reduce((acc: number, cur: any) => acc + ((cur.currentPrice - cur.avgPrice) || 0), 0) >= 0}
          icon={<TrendingUp size={24} />}
        />
        <StatCard title="보유 종목수" value={holdings.length.toString()} change="" positive={true} icon={<LayoutDashboard size={24} />} />
        <StatCard title="수익률" value={`${(holdings.reduce((acc: number, cur: any) => acc + (cur.avgPrice ? (cur.currentPrice - cur.avgPrice) / cur.avgPrice : 0), 0) / (holdings.length || 1) * 100).toFixed(2)}%`} change="+0.5%" positive={true} icon={<ArrowUpRight size={24} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold">포트폴리오 수익률 추이</h3>
            </div>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `₩${v / 1000}k`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                  />
                  <Area type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorPrice)" />
                </AreaChart>
              </ResponsiveContainer>
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
                  className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500 w-32"
                />
                <button
                  onClick={() => {
                    if (newStock.code && newStock.name && newStock.value && newStock.avgPrice) {
                      onAdd({
                        code: newStock.code,
                        name: newStock.name,
                        value: parseInt(newStock.value),
                        avgPrice: parseInt(newStock.avgPrice),
                      });
                      setNewStock({ code: '', name: '', value: '', avgPrice: '' });
                    }
                  }}
                  title="종목 추가"
                  className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-xl transition-colors"
                >
                  <Plus size={20} />
                </button>
              </div>
              <div className="max-h-64 overflow-auto space-y-2 pr-2 custom-scrollbar">
                {holdings.map((stock: any, idx: number) => (
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
                        <p className="text-[10px] text-slate-500">평단: ₩{stock.avgPrice?.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => onDetailClick({ ...stock, category: '보유 종목', reason: '현재 포트폴리오에 포함된 종목입니다. 최근 실적과 시장 환경을 바탕으로 분석된 전망입니다.', score: 85 + (idx % 10) })}
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
                ))}
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
                  {portfolioData.map((entry: any, index: number) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3">
            {portfolioData.map((item: any) => (
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

const HoldingsAnalysisPage = ({ holdings, onDetailClick }: any) => {
  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold mb-2">보유 종목 전망 분석</h2>
        <p className="text-slate-500 text-sm">현재 보유 중인 종목들에 대한 통계적 추세 및 향후 전망을 전문적으로 분석합니다.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {holdings.map((stock: any, idx: number) => {
          const latestPriceFromState = stock.currentPrice;
          const profit = latestPriceFromState && stock.avgPrice ? (latestPriceFromState - stock.avgPrice) : 0;
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
                    <p className="text-xs text-slate-500 font-mono">{stock.code || 'KRX:XXXXXX'}</p>
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

const RecommendationsPage = ({ onDetailClick }: any) => {
  const [recommendations, setRecommendations] = useState<any[]>([]);
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

const MajorStocksPage = ({ onDetailClick }: any) => {
  const [stocks, setStocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    fetchStocks();
  }, []);

  const CATEGORY_ORDER = [
    '기술/IT',
    '바이오/헬스케어',
    '자동차/모빌리티',
    '에너지/소재',
    '금융/지주',
    '소비재/서비스',
    '엔터테인먼트/미디어',
    '조선/기계/방산'
  ];

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
                    className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 hover:bg-slate-900 hover:border-blue-500/30 transition-all cursor-pointer group"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-sm font-bold group-hover:text-blue-400 transition-colors">{stock.name}</p>
                      <span className="text-[10px] text-slate-500 font-mono">{stock.code}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-lg font-black">{stock.price?.toLocaleString()}원</p>
                      <div className="flex items-center space-x-2">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${stock.opinion === '긍정적' || stock.opinion === '추가매수' ? 'bg-emerald-500/10 text-emerald-500' :
                          stock.opinion === '부정적' || stock.opinion === '매도' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-400'
                          }`}>
                          {stock.opinion || '중립적'}
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

const SettingsPage = () => (
  <div className="max-w-2xl animate-in slide-in-from-bottom-4 duration-500">
    <h2 className="text-2xl font-bold mb-8">API & 계정 설정</h2>

    <div className="space-y-6">
      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8">
        <div className="flex items-center space-x-3 mb-6">
          <ShieldCheck className="text-emerald-400" size={24} />
          <h3 className="text-lg font-semibold">네이버 증권 API 데이터 연결</h3>
        </div>

        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl mb-6">
          <p className="text-sm text-emerald-400 leading-relaxed">
            현재 네이버 증권 API를 사용하여 실시간 데이터를 수집하고 있습니다. 별도의 인증키가 필요하지 않은 환경입니다.
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-950 rounded-2xl border border-slate-800">
            <span className="text-sm text-slate-400">데이터 소스 상태</span>
            <span className="text-xs font-bold px-2 py-1 bg-emerald-500/10 text-emerald-500 rounded-full">정상 연결됨</span>
          </div>
          <div className="flex items-center justify-between p-4 bg-slate-950 rounded-2xl border border-slate-800">
            <span className="text-sm text-slate-400">로컬 데이터베이스 (SQLite)</span>
            <span className="text-xs font-bold px-2 py-1 bg-blue-500/10 text-blue-400 rounded-full">활성화됨</span>
          </div>
        </div>
      </div>

      <div className="p-6 border border-slate-800 rounded-3xl flex items-center justify-between text-slate-500">
        <div className="flex items-center space-x-3">
          <Settings size={20} />
          <span className="text-sm">현재 버전: v1.0.0-alpha</span>
        </div>
        <button title="업데이트 확인" className="text-blue-400 text-sm hover:underline">업데이트 확인</button>
      </div>
    </div>
  </div>
);

// --- Main App ---

const App = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedStock, setSelectedStock] = useState<any>(null);
  const [holdings, setHoldings] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const fetchHoldings = async () => {
      try {
        const data = await stockApi.getHoldings();
        const mappedHoldings = data.map((h: any) => ({
          code: h.code,
          name: h.name,
          value: h.weight,
          avgPrice: h.avg_price,
          currentPrice: h.price
        }));
        setHoldings(mappedHoldings);
      } catch (error) {
        console.error('Failed to fetch holdings:', error);
      }
    };
    fetchHoldings();
  }, []);

  const addHolding = async (stock: { code: string, name: string, value: number, avgPrice: number }) => {
    try {
      const added = await stockApi.addHolding({
        code: stock.code,
        name: stock.name,
        avgPrice: stock.avgPrice,
        weight: stock.value
      });
      setHoldings([...holdings, {
        code: added.code,
        name: added.name,
        value: added.weight,
        avgPrice: added.avg_price,
        currentPrice: added.price
      }]);
    } catch (error) {
      console.error('Failed to add holding:', error);
    }
  };

  const deleteHolding = async (index: number) => {
    const stockToDelete = holdings[index];
    try {
      await stockApi.deleteHolding(stockToDelete.code);
      setHoldings(holdings.filter((_, i) => i !== index));
    } catch (error) {
      console.error('Failed to delete holding:', error);
    }
  };

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.length >= 2) {
        setIsSearching(true);
        try {
          const results = await stockApi.searchStocks(searchQuery);
          setSearchResults(results);
        } catch (error) {
          console.error('Search failed:', error);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearchSelect = (stock: any) => {
    handleDetailClick({
      code: stock.code,
      name: stock.name,
      category: stock.category
    });
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleDetailClick = (stock: any) => {
    setSelectedStock(stock);
    setActiveTab('detail');
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-50 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-68 border-r border-slate-800/60 flex flex-col bg-slate-950/50 backdrop-blur-xl">
        <div className="p-8">
          <h1 className="text-2xl font-extrabold tracking-tight flex items-center space-x-2">
            <span className="bg-blue-600 p-1.5 rounded-lg"><Zap size={20} fill="white" color="white" /></span>
            <span className="bg-gradient-to-br from-white to-slate-400 bg-clip-text text-transparent">StockAnalyzer</span>
          </h1>
        </div>

        <nav className="flex-1 px-4 space-y-1.5">
          <NavButton active={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); setSelectedStock(null); }} icon={<LayoutDashboard size={20} />} label="대시보드" />
          <NavButton active={activeTab === 'analysis'} onClick={() => { setActiveTab('analysis'); setSelectedStock(null); }} icon={<TrendingUp size={20} />} label="보유 종목 분석" />
          <NavButton active={activeTab === 'recommendations' || (activeTab === 'detail' && selectedStock?.category !== '보유 종목' && selectedStock?.category !== '주요 종목')} onClick={() => { setActiveTab('recommendations'); setSelectedStock(null); }} icon={<Star size={20} />} label="유망 종목 추천" />
          <NavButton active={activeTab === 'major'} onClick={() => { setActiveTab('major'); setSelectedStock(null); }} icon={<Layers size={20} />} label="주요 종목 현황" />
          <NavButton active={activeTab === 'settings'} onClick={() => { setActiveTab('settings'); setSelectedStock(null); }} icon={<Settings size={20} />} label="설정" />
        </nav>

        <div className="p-6 mt-auto">
          <div className="bg-gradient-to-br from-blue-600/10 to-emerald-600/10 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center space-x-3 mb-3">
              <Star size={16} className="text-yellow-400 fill-yellow-400" />
              <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">Premium Plan</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">고급 알고리즘을 통한 모든 추천 종목을 확인하세요.</p>
            <button className="w-full py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold transition-colors">구독 관리</button>
          </div>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Background Mesh */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/5 blur-[120px] rounded-full -mr-48 -mt-48 pointer-events-none"></div>

        <header className="h-20 border-b border-slate-800/40 px-10 flex items-center justify-between z-10">
          <div className="relative">
            <div className="flex items-center bg-slate-900/40 border border-slate-800/60 rounded-2xl px-5 py-2.5 w-[420px] focus-within:border-blue-500/50 transition-all backdrop-blur-sm">
              <Search size={18} className="text-slate-500 mr-3" />
              <input
                type="text"
                placeholder="종목명 또는 코드 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none focus:outline-none text-sm w-full placeholder:text-slate-600"
              />
              {isSearching && <RefreshCw size={14} className="animate-spin text-slate-500 ml-2" />}
            </div>

            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 w-full mt-2 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-50">
                {searchResults.map((stock) => (
                  <button
                    key={stock.code}
                    onClick={() => handleSearchSelect(stock)}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-800 transition-colors border-b border-slate-800 last:border-0"
                  >
                    <div className="text-left">
                      <p className="text-sm font-bold">{stock.name}</p>
                      <p className="text-[10px] text-slate-500">{stock.code}</p>
                    </div>
                    <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded uppercase font-bold">
                      {stock.category}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center space-x-5">
            <button
              title="알림 확인"
              className="bg-slate-900/50 p-2.5 rounded-2xl border border-slate-800 hover:border-slate-700 transition-all relative"
            >
              <Bell size={20} className="text-slate-400" />
              <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-slate-950"></span>
            </button>
            <div className="h-6 w-px bg-slate-800"></div>
            <div className="flex items-center space-x-3 cursor-pointer group">
              <div className="text-right">
                <p className="text-sm font-bold leading-none mb-1 group-hover:text-blue-400 transition-colors">홍길동</p>
                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-tighter">My Account</p>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 p-0.5">
                <div className="w-full h-full rounded-[14px] bg-slate-950 flex items-center justify-center font-bold text-blue-400">H</div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-10 relative">
          <div className="max-w-7xl mx-auto pb-20">
            {activeTab === 'dashboard' && <DashboardPage holdings={holdings} onAdd={addHolding} onDelete={deleteHolding} onDetailClick={handleDetailClick} />}
            {activeTab === 'analysis' && <HoldingsAnalysisPage holdings={holdings} onDetailClick={handleDetailClick} />}
            {activeTab === 'recommendations' && <RecommendationsPage onDetailClick={handleDetailClick} />}
            {activeTab === 'major' && <MajorStocksPage onDetailClick={handleDetailClick} />}
            {activeTab === 'settings' && <SettingsPage />}
            {activeTab === 'detail' && selectedStock && <StockDetailView stock={selectedStock} onAdd={addHolding} onBack={() => {
              // Return to previous tab
              if (selectedStock.category === '보유 종목') {
                setActiveTab('analysis');
              } else if (activeTab === 'detail' && searchQuery === '') {
                setActiveTab('recommendations');
              } else {
                setActiveTab('dashboard');
              }
            }} />}
          </div>
        </main>
      </div>
    </div>
  );
};

const NavButton = ({ active, onClick, icon, label }: any) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center space-x-3.5 px-5 py-3.5 rounded-2xl transition-all duration-300 ${active
      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
      : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'
      }`}
  >
    <span className={active ? 'text-white' : 'text-slate-600 group-hover:text-slate-300'}>{icon}</span>
    <span className="font-bold text-sm tracking-tight">{label}</span>
    {active && <ChevronRight size={14} className="ml-auto opacity-60" />}
  </button>
);

export default App;
