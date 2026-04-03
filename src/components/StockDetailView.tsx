import { useState, useEffect } from 'react';
import {
  ArrowLeft, RefreshCw, Trash2, Zap, ShieldCheck, Plus, ArrowUpRight
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar
} from 'recharts';
import { stockApi } from '../api/stockApi';
import type { StockSummary, StockDetail, ChartDataPoint } from '../types/stock';

interface StockDetailViewProps {
  stock: StockSummary;
  onBack: () => void;
  onAdd: (stock: { code: string; name: string; value: number; avgPrice: number }) => Promise<void>;
}

const StockDetailView = ({ stock, onBack, onAdd }: StockDetailViewProps) => {
  const isHolding = stock.category === '보유 종목';

  const [stockDetail, setStockDetail] = useState<StockDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [addForm, setAddForm] = useState({ avgPrice: '0', weight: '5' });
  const [adding, setAdding] = useState(false);
  const [volatility, setVolatility] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const [data, vol] = await Promise.all([
          stockApi.getCurrentPrice(stock.code),
          stockApi.getVolatility(stock.code),
        ]);
        setStockDetail(data);
        setVolatility(vol.volatility);
      } catch (error) {
        console.error('Failed to fetch stock detail:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [stock.code]);

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

  const fullChartData: ChartDataPoint[] = historyData.map((d, i, arr) => {
    const sma5 = i >= 4 ? Math.round(arr.slice(i - 4, i + 1).reduce((acc, cur) => acc + cur.price, 0) / 5) : null;
    const sma20 = i >= 19 ? Math.round(arr.slice(i - 19, i + 1).reduce((acc, cur) => acc + cur.price, 0) / 20) : null;
    return {
      name: d.date.slice(4, 6) + '/' + d.date.slice(6, 8),
      price: d.price,
      sma5,
      sma20,
    };
  });

  const chartData = fullChartData.slice(-20);
  const latest = chartData[chartData.length - 1] || { price: 0, sma5: null, sma20: null };
  const prev = chartData[chartData.length - 2] || { price: 0, sma5: null, sma20: null };
  const latestPrice = stockDetail?.price || latest.price;

  const trend = (latest.sma5 !== null && latestPrice > latest.sma5) ? '상승' : '하락';
  const profitRate = isHolding && stock.avgPrice ? ((latestPrice - stock.avgPrice) / stock.avgPrice * 100).toFixed(2) : null;

  const computeProbability = (): number => {
    let score = 50;
    // Target price upside
    const tp = stockDetail?.targetPrice;
    if (tp && latestPrice > 0) {
      const upside = (tp - latestPrice) / latestPrice;
      score += Math.min(20, Math.max(-20, Math.round(upside * 100)));
    }
    // SMA alignment bonus
    if (latest.sma5 !== null && latest.sma20 !== null && latest.sma5 > latest.sma20) score += 10;
    // Price above SMA5
    if (latest.sma5 !== null && latestPrice > latest.sma5) score += 5;
    // Momentum
    if (latest.price > prev.price) score += 5;
    // Low volatility bonus
    if (volatility !== null && volatility < 3) score += 5;
    return Math.max(10, Math.min(99, score));
  };

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
            <div className="flex items-center space-x-3 mb-2">
              <span className="px-2 py-1 bg-blue-500/10 text-blue-400 text-xs font-bold rounded uppercase">
                {stock.category}
              </span>
              {!isHolding && (
                <button
                  onClick={async () => {
                    if (window.confirm('이 종목을 전체 목록에서 삭제하시겠습니까?')) {
                      try {
                        await stockApi.deleteStock(stock.code);
                        onBack();
                      } catch (error) {
                        console.error('Failed to delete stock:', error);
                        alert('종목 삭제에 실패했습니다.');
                      }
                    }
                  }}
                  className="text-slate-500 hover:text-red-500 transition-colors p-1"
                  title="종목 전체 삭제"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            <h2 className="text-4xl font-bold">{stockDetail?.name || stock.name}</h2>
            <p className="text-slate-500 font-mono mt-1">{stock.code}</p>
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
            {/* Charts Section */}
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
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
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

            {/* Metrics Grid */}
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

            {/* Technical Analysis */}
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
                <p className="text-2xl font-bold">{volatility !== null ? `±${volatility}%` : '---'}</p>
                <p className="text-[10px] text-slate-500">최근 5거래일 일간수익률 표준편차</p>
              </div>
            </div>

            {/* Investor Trading Trends */}
            {stockDetail?.investorData && stockDetail.investorData.length > 0 && (
              <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800/50">
                <h3 className="text-lg font-semibold mb-6 flex items-center justify-between">
                  <span>투자자별 매매동향</span>
                  <span className="text-[10px] text-slate-500 font-normal">최근 10거래일 순매수량</span>
                </h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stockDetail.investorData.slice(-10).map((d) => ({
                      ...d,
                      name: d.date.slice(4, 6) + '/' + d.date.slice(6, 8),
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

          {/* Right Sidebar - Analysis */}
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
                            value: parseInt(addForm.weight),
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
                <div className="text-3xl font-black text-center text-white">{computeProbability()}%</div>
                <p className="text-[10px] text-slate-500 text-center mt-1">상승 예측 확률</p>
              </div>
              <button
                onClick={async () => {
                  setRefreshing(true);
                  try {
                    const [data, vol] = await Promise.all([
                      stockApi.refreshStock(stock.code),
                      stockApi.getVolatility(stock.code),
                    ]);
                    setStockDetail(data);
                    setVolatility(vol.volatility);
                  } catch (error) {
                    console.error('Refresh failed:', error);
                  } finally {
                    setRefreshing(false);
                  }
                }}
                disabled={refreshing}
                className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                {refreshing && <RefreshCw className="animate-spin" size={14} />}
                <span>{refreshing ? '업데이트 중...' : '실시간 데이터 업데이트'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StockDetailView;
