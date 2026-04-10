import { useState, useEffect } from 'react';
import {
  ArrowLeft, RefreshCw, Trash2, Zap, ShieldCheck, Plus, ArrowUpRight
} from 'lucide-react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, Cell, ReferenceLine
} from 'recharts';
import { stockApi } from '../api/stockApi';
import type { StockSummary, StockDetail, ChartDataPoint, TechnicalIndicators, NewsItem, FinancialData, SectorComparison, HistoryEntry } from '../types/stock';
import ScoringBreakdownPanel from './ScoringBreakdownPanel';
import HelpBottomSheet, { type HelpTermKey } from './HelpBottomSheet';
import { getDataFreshnessLabel } from '../utils/dataFreshness';

interface StockDetailViewProps {
  stock: StockSummary;
  onBack: () => void;
  onAdd: (stock: { code: string; name: string; value: number; avgPrice: number; quantity?: number }) => Promise<void>;
  onUpdate?: (stock: { code: string; name: string; value: number; avgPrice: number; quantity?: number }) => Promise<void>;
}

// Custom candlestick shape for ComposedChart
const CandlestickBar = (props: Record<string, unknown>) => {
  const { x, y, width, height, payload } = props as {
    x: number; y: number; width: number; height: number;
    payload: { open: number; price: number; high: number; low: number; yHigh: number; yLow: number; yOpen: number; yClose: number };
  };
  if (!payload || payload.open === undefined) return null;

  const isUp = payload.price >= payload.open;
  const fill = isUp ? '#10b981' : '#ef4444';
  const bodyTop = isUp ? (y) : (y);
  const bodyHeight = Math.max(1, Math.abs(height));

  // Wick (high-low line)
  const xCenter = x + width / 2;

  return (
    <g>
      <line x1={xCenter} y1={payload.yHigh} x2={xCenter} y2={payload.yLow} stroke={fill} strokeWidth={1} />
      <rect x={x + width * 0.15} y={bodyTop} width={width * 0.7} height={bodyHeight} fill={fill} rx={1} />
    </g>
  );
};

const StockDetailView = ({ stock, onBack, onAdd, onUpdate }: StockDetailViewProps) => {
  const isHolding = stock.category === '보유 종목';

  const [stockDetail, setStockDetail] = useState<StockDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [addForm, setAddForm] = useState({ avgPrice: '0', weight: '5', quantity: '0' });
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ avgPrice: '', quantity: '', weight: '' });
  const [adding, setAdding] = useState(false);
  const [volatility, setVolatility] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [indicators, setIndicators] = useState<TechnicalIndicators | null>(null);
  const [chartType, setChartType] = useState<'line' | 'candle'>('line');
  const [helpTerm, setHelpTerm] = useState<HelpTermKey | null>(null);
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [financials, setFinancials] = useState<FinancialData | null>(null);
  const [sectorData, setSectorData] = useState<SectorComparison | null>(null);
  const [chartTimeframe, setChartTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [extraChartData, setExtraChartData] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        // Phase 1: 핵심 데이터 먼저 (가격 + 차트 + 지표)
        const [data, vol, ind] = await Promise.all([
          stockApi.getCurrentPrice(stock.code),
          stockApi.getVolatility(stock.code),
          stockApi.getIndicators(stock.code),
        ]);
        setStockDetail(data);
        setVolatility(vol.volatility);
        setIndicators(ind);

        // Phase 2: 보조 데이터 지연 로딩 (뉴스 + 재무 + 섹터)
        stockApi.getNews(stock.code).then(setNews).catch(() => {});
        stockApi.getFinancials(stock.code).then(setFinancials).catch(() => {});
        const cat = data?.category || stock.category;
        if (cat) {
          stockApi.getSectorComparison(cat).then(setSectorData).catch(() => {});
        }
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
      setAddForm({ avgPrice: stockDetail.price.toString(), weight: '5', quantity: '0' });
    }
  }, [stockDetail?.price]);

  // Fetch weekly/monthly chart data when timeframe changes
  useEffect(() => {
    if (chartTimeframe !== 'daily') {
      stockApi.getChartData(stock.code, chartTimeframe as 'weekly' | 'monthly')
        .then(setExtraChartData).catch(() => setExtraChartData([]));
    }
  }, [chartTimeframe, stock.code]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <RefreshCw className="animate-spin mr-2" size={20} />
        <span>데이터 분석 중...</span>
      </div>
    );
  }

  const historyData = chartTimeframe === 'daily'
    ? (stockDetail?.history || [])
    : extraChartData;

  const fullChartData: ChartDataPoint[] = historyData.map((d, i, arr) => {
    const sma5 = i >= 4 ? Math.round(arr.slice(i - 4, i + 1).reduce((acc, cur) => acc + cur.price, 0) / 5) : null;
    const sma20 = i >= 19 ? Math.round(arr.slice(i - 19, i + 1).reduce((acc, cur) => acc + cur.price, 0) / 20) : null;
    const formatDate = chartTimeframe === 'monthly'
      ? d.date.slice(2, 4) + '/' + d.date.slice(4, 6)
      : d.date.slice(4, 6) + '/' + d.date.slice(6, 8);
    return {
      name: formatDate,
      price: d.price,
      open: d.open,
      high: d.high,
      low: d.low,
      volume: d.volume,
      sma5,
      sma20,
    };
  });

  const sliceCount = chartTimeframe === 'monthly' ? 12 : 20;
  const chartData = fullChartData.slice(-sliceCount);
  const latest = chartData[chartData.length - 1] || { price: 0, sma5: null, sma20: null, open: 0, high: 0, low: 0, volume: 0 };
  const prev = chartData[chartData.length - 2] || { price: 0, sma5: null, sma20: null };
  const latestPrice = stockDetail?.price || latest.price;

  const trend = (latest.sma5 !== null && latestPrice > latest.sma5) ? '상승' : '하락';
  const profitRate = isHolding && stock.avgPrice ? ((latestPrice - stock.avgPrice) / stock.avgPrice * 100).toFixed(2) : null;

  const computeProbability = (): number => {
    let score = 50;
    const tp = stockDetail?.targetPrice;
    if (tp && latestPrice > 0) {
      const upside = (tp - latestPrice) / latestPrice;
      score += Math.min(20, Math.max(-20, Math.round(upside * 100)));
    }
    if (latest.sma5 !== null && latest.sma20 !== null && latest.sma5 > latest.sma20) score += 10;
    if (latest.sma5 !== null && latestPrice > latest.sma5) score += 5;
    if (latest.price > prev.price) score += 5;
    if (volatility !== null && volatility < 3) score += 5;
    return Math.max(10, Math.min(99, score));
  };

  // Volume chart data with color
  const volumeData = chartData.map(d => ({
    name: d.name,
    volume: d.volume || 0,
    isUp: (d.price || 0) >= (d.open || 0),
  }));

  // Candlestick: we use a bar chart with custom shape
  // We need min/max for Y axis
  const allPrices = chartData.flatMap(d => [d.open || 0, d.high || 0, d.low || 0, d.price || 0]).filter(p => p > 0);
  const priceMin = Math.min(...allPrices) * 0.98;
  const priceMax = Math.max(...allPrices) * 1.02;

  const helpTexts: Record<string, string> = {
    rsi: 'RSI는 주가가 최근 얼마나 올랐는지/내렸는지를 0~100 사이 숫자로 보여줘요. 70 이상이면 "너무 많이 올랐다", 30 이하면 "너무 많이 내렸다"는 뜻이에요.',
    macd: 'MACD는 최근 주가 흐름의 방향을 보여줘요. 막대가 위로 올라가면 상승 힘이 강하고, 아래로 내려가면 하락 힘이 강하다는 신호예요.',
    bollinger: '볼린저밴드는 주가가 평소 움직이는 범위를 보여줘요. 상단에 가까우면 평소보다 많이 올랐고, 하단에 가까우면 많이 내려간 거예요.',
    candle: '빨간 봉은 주가가 내린 날, 초록 봉은 오른 날이에요. 봉의 길이가 길수록 하루 동안 가격이 많이 변했다는 뜻이에요.',
    volume: '거래량은 하루 동안 주식이 얼마나 많이 거래됐는지를 보여줘요. 거래량이 많으면 관심이 많다는 뜻이에요.',
  };

  return (
    <div className="animate-in fade-in slide-in-from-left-4 duration-500 space-y-8">
      <button onClick={onBack} className="flex items-center space-x-2 text-slate-400 hover:text-white transition-colors mb-4 px-4 py-2.5 min-h-[44px]">
        <ArrowLeft size={20} />
        <span>돌아가기</span>
      </button>

      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <span className="px-2 py-1 bg-blue-500/10 text-blue-400 text-xs font-bold rounded uppercase">{stock.category}</span>
              {!isHolding && (
                <button onClick={async () => {
                  if (window.confirm('이 종목을 전체 목록에서 삭제하시겠습니까?')) {
                    try { await stockApi.deleteStock(stock.code); onBack(); } catch { alert('종목 삭제에 실패했습니다.'); }
                  }
                }} className="flex items-center space-x-1 text-slate-500 hover:text-red-500 transition-colors px-4 py-2.5 min-h-[44px]" title="종목 전체 삭제">
                  <Trash2 size={16} />
                  <span className="text-xs">삭제</span>
                </button>
              )}
            </div>
            <h2 className="text-4xl font-bold">{stockDetail?.name || stock.name}</h2>
            <div className="flex items-center space-x-2 mt-1">
              <p className="text-slate-500 font-mono">{stock.code}</p>
              {(stockDetail as unknown as { last_updated?: string })?.last_updated && (
                <span className="text-xs text-slate-600">
                  {getDataFreshnessLabel((stockDetail as unknown as { last_updated: string }).last_updated)}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500 mb-1">현재가</p>
            <div className={`text-4xl font-black ${trend === '상승' ? 'text-emerald-500' : 'text-red-500'}`}>
              ₩{latestPrice.toLocaleString()}
            </div>
            {isHolding && (
              <div className="mt-1 flex items-center space-x-3">
                <p className={`text-sm font-bold ${parseFloat(profitRate || '0') >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  수익률: {profitRate}% (매수가: ₩{stock.avgPrice?.toLocaleString()})
                </p>
                {onUpdate && !editMode && (
                  <button
                    onClick={() => {
                      setEditMode(true);
                      setEditForm({
                        avgPrice: String(stock.avgPrice || ''),
                        quantity: String(stock.quantity || '0'),
                        weight: String(stock.value || '5'),
                      });
                    }}
                    className="text-xs text-blue-400 hover:text-blue-300 font-bold bg-blue-500/10 px-4 py-2.5 min-h-[44px] rounded-lg transition-colors"
                  >
                    보유 정보 수정
                  </button>
                )}
              </div>
            )}
            {isHolding && editMode && onUpdate && (
              <div className="mt-3 p-4 bg-slate-900/50 border border-blue-500/20 rounded-2xl animate-in fade-in duration-200">
                <p className="text-xs text-blue-400 font-bold uppercase tracking-widest mb-3">보유 정보 수정</p>
                <div className="flex items-end space-x-3">
                  <div className="flex-1">
                    <label className="text-xs text-slate-500 mb-1 block">매수가 (원)</label>
                    <input
                      type="number"
                      value={editForm.avgPrice}
                      onChange={(e) => setEditForm({ ...editForm, avgPrice: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-slate-500 mb-1 block">수량 (주)</label>
                    <input
                      type="number"
                      value={editForm.quantity}
                      onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="w-24">
                    <label className="text-xs text-slate-500 mb-1 block">비중 (%)</label>
                    <input
                      type="number"
                      value={editForm.weight}
                      onChange={(e) => setEditForm({ ...editForm, weight: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <button
                    onClick={async () => {
                      await onUpdate({
                        code: stock.code,
                        name: stock.name,
                        avgPrice: parseInt(editForm.avgPrice),
                        quantity: parseInt(editForm.quantity || '0'),
                        value: parseInt(editForm.weight || '5'),
                      });
                      setEditMode(false);
                    }}
                    className="px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-colors min-h-[44px]"
                  >
                    저장
                  </button>
                  <button
                    onClick={() => setEditMode(false)}
                    className="px-4 py-3 text-slate-500 hover:text-white text-sm rounded-xl transition-colors min-h-[44px]"
                  >
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">

            {/* Toss Chart Capture */}
            <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800/50">
              <h3 className="text-lg font-semibold mb-6 flex items-center justify-between">
                <span>토스증권 실시간 차트 캡처</span>
                <span className="text-xs text-slate-500 font-normal">Toss Securities Original Chart</span>
              </h3>
              {stockDetail?.chartPath ? (
                <div className="w-full rounded-xl overflow-hidden border border-slate-800 mb-6">
                  <img src={`http://localhost:3001${stockDetail.chartPath}`} alt="Toss Chart" className="w-full h-auto object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </div>
              ) : (
                <div className="w-full h-48 bg-slate-900/50 rounded-xl flex flex-col items-center justify-center border border-dashed border-slate-800 mb-6 text-slate-600">
                  <RefreshCw className="animate-spin mb-2" size={24} />
                  <p className="text-xs">차트 이미지를 캡처 중입니다...</p>
                </div>
              )}
            </div>

            {/* Candlestick + Volume Chart */}
            <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800/50">
              <h3 className="text-lg font-semibold mb-2 flex items-center justify-between">
                <span>주가 차트</span>
                <div className="flex items-center space-x-1">
                  <button onClick={() => setChartType(chartType === 'line' ? 'candle' : 'line')}
                    className="px-3 py-2.5 min-h-[44px] rounded-lg text-xs font-bold bg-slate-800 text-slate-400 hover:text-white transition-colors mr-2">
                    {chartType === 'line' ? '캔들 차트' : '라인 차트'}
                  </button>
                  {(['daily', 'weekly', 'monthly'] as const).map(tf => (
                    <button key={tf} onClick={() => setChartTimeframe(tf)}
                      className={`px-4 py-2.5 min-h-[44px] rounded-lg text-xs font-bold transition-colors ${
                        chartTimeframe === tf ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}>
                      {tf === 'daily' ? '일봉' : tf === 'weekly' ? '주봉' : '월봉'}
                    </button>
                  ))}
                </div>
              </h3>
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 mb-4 text-xs text-blue-300 leading-relaxed">
                {chartType === 'line'
                  ? '파란선(5일 평균)과 노란선(20일 평균)을 보세요. 주가가 파란선 위에 있으면 좋은 신호예요.'
                  : helpTexts.candle}
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} domain={[priceMin, priceMax]} tickFormatter={(v) => `₩${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '12px' }}
                      formatter={(value: number | undefined, name: string | undefined) => {
                        const labels: Record<string, string> = { price: '종가', open: '시가', high: '고가', low: '저가', sma5: '5일 평균', sma20: '20일 평균' };
                        return [`₩${value?.toLocaleString() || '---'}`, labels[name || ''] || name || ''];
                      }} />
                    <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px' }} />
                    {chartType === 'candle' ? (
                      <Bar dataKey="price" name="종가" shape={<CandlestickBar />} isAnimationActive={false}>
                        {chartData.map((entry, index) => (
                          <Cell key={index} fill={(entry.price || 0) >= (entry.open || 0) ? '#10b981' : '#ef4444'} />
                        ))}
                      </Bar>
                    ) : (
                      <Line type="monotone" dataKey="price" name="종가" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    )}
                    <Line type="monotone" dataKey="sma5" name="5일 평균" stroke="#10b981" strokeWidth={1} dot={false} strokeDasharray="5 5" />
                    <Line type="monotone" dataKey="sma20" name="20일 평균" stroke="#f59e0b" strokeWidth={1} dot={false} strokeDasharray="3 3" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Volume Bar */}
              <h4 className="text-sm font-semibold mt-6 mb-2 flex items-center space-x-2">
                <span className="text-slate-400">거래량</span>
              </h4>
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 mb-3 text-xs text-blue-300 leading-relaxed">
                {helpTexts.volume}
              </div>
              <div className="h-24 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={volumeData}>
                    <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} hide />
                    <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Bar dataKey="volume" isAnimationActive={false}>
                      {volumeData.map((entry, index) => (
                        <Cell key={index} fill={entry.isUp ? '#10b98140' : '#ef444440'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-5 bg-slate-950/30 rounded-2xl border border-slate-800">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">PER (주가수익비율)</h4>
                  <button onClick={() => setHelpTerm('per')} className="text-slate-600 hover:text-blue-400 text-xs min-w-[24px] min-h-[24px] flex items-center justify-center" aria-label="PER 도움말">[?]</button>
                </div>
                <p className={`text-xl font-bold ${stockDetail?.per && stockDetail.per < 0 ? 'text-yellow-400' : 'text-white'}`}>
                  {stockDetail?.per ? (stockDetail.per < 0 ? '적자' : `${stockDetail.per}배`) : '---'}
                </p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {stockDetail?.per && stockDetail.per < 0
                    ? '현재 이익이 마이너스인 기업이에요'
                    : stockDetail?.per && stockDetail.per < 15
                    ? '업종 평균보다 저렴한 편이에요'
                    : stockDetail?.per && stockDetail.per < 30
                    ? '적정 수준이에요'
                    : stockDetail?.per ? '고평가 구간이에요' : '데이터 없음'}
                </p>
                {/* 업종별 PER 맥락 안내 — 초보자가 단순 숫자만 보고 판단하지 않도록 */}
                {(() => {
                  const cat = stockDetail?.category || stock.category;
                  let hint = '';
                  if (cat?.includes('기술') || cat?.includes('IT')) {
                    hint = 'IT 기업은 PER 20~40배도 정상이에요. 성장성을 함께 봐야 해요.';
                  } else if (cat?.includes('금융') || cat?.includes('지주')) {
                    hint = '금융 기업은 PER 5~15배가 일반적이에요. 단순히 낮다고 저평가는 아니에요.';
                  } else if (cat?.includes('바이오') || cat?.includes('헬스')) {
                    hint = '바이오 기업은 R&D 투자로 일시 적자가 많아요. 부실로 단정하지 마세요.';
                  } else if (cat?.includes('에너지') || cat?.includes('소재')) {
                    hint = '에너지·소재는 원자재 가격에 따라 PER이 출렁여요.';
                  }
                  if (!hint) return null;
                  return (
                    <p className="text-[11px] text-blue-400/80 mt-2 leading-relaxed border-t border-slate-800/50 pt-2">
                      💡 {hint}
                    </p>
                  );
                })()}
              </div>
              <div className="p-5 bg-slate-950/30 rounded-2xl border border-slate-800">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">PBR (주가순자산비율)</h4>
                  <button onClick={() => setHelpTerm('pbr')} className="text-slate-600 hover:text-blue-400 text-xs min-w-[24px] min-h-[24px] flex items-center justify-center" aria-label="PBR 도움말">[?]</button>
                </div>
                <p className="text-xl font-bold text-white">{stockDetail?.pbr ? `${stockDetail.pbr}배` : '---'}</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {stockDetail?.pbr && stockDetail.pbr <= 1
                    ? '자산 대비 저평가 상태예요'
                    : stockDetail?.pbr && stockDetail.pbr <= 3
                    ? '적정 수준이에요'
                    : stockDetail?.pbr ? '자산 대비 비싼 편이에요' : '데이터 없음'}
                </p>
              </div>
              <div className="p-5 bg-slate-950/30 rounded-2xl border border-slate-800">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">ROE (자기자본이익률)</h4>
                  <button onClick={() => setHelpTerm('roe')} className="text-slate-600 hover:text-blue-400 text-xs min-w-[24px] min-h-[24px] flex items-center justify-center" aria-label="ROE 도움말">[?]</button>
                </div>
                <p className="text-xl font-bold text-white">{stockDetail?.roe ? `${stockDetail.roe}%` : '---'}</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {stockDetail?.roe
                    ? `자기자본으로 ${stockDetail.roe}%를 벌었어요. ${stockDetail.roe >= 15 ? '우량 기업이에요!' : stockDetail.roe >= 10 ? '양호한 수준이에요' : '개선이 필요해요'}`
                    : '데이터 없음'}
                </p>
              </div>
              <div className="p-5 bg-slate-950/30 rounded-2xl border border-slate-800">
                <h4 className="text-xs font-bold mb-1 text-slate-500 uppercase tracking-widest">목표가</h4>
                <p className="text-xl font-bold text-emerald-400">{stockDetail?.targetPrice ? `₩${stockDetail.targetPrice.toLocaleString()}` : '---'}</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {stockDetail?.targetPrice && stockDetail?.price
                    ? stockDetail.price < stockDetail.targetPrice
                      ? `애널리스트 목표가 기준 현재가 대비 +${((stockDetail.targetPrice - stockDetail.price) / stockDetail.price * 100).toFixed(0)}%`
                      : '현재가가 목표가에 도달했어요'
                    : '증권사 애널리스트 평균 예상가'}
                </p>
              </div>
            </div>

            {/* 초보자 친화적 보조지표 패널 */}
            {indicators?.summary && (
              <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800/50">
                <h3 className="text-lg font-semibold mb-4">기술적 지표 종합 분석</h3>

                {/* 종합 신호 - 큰 카드 */}
                <div className={`p-5 rounded-2xl mb-6 border ${
                  indicators.summary.signal === '긍정적' ? 'bg-emerald-500/5 border-emerald-500/20' :
                  indicators.summary.signal === '주의' ? 'bg-red-500/5 border-red-500/20' :
                  'bg-blue-500/5 border-blue-500/20'
                }`}>
                  <div className="flex items-center space-x-3 mb-2">
                    <span className={`text-2xl font-black ${
                      indicators.summary.signal === '긍정적' ? 'text-emerald-400' :
                      indicators.summary.signal === '주의' ? 'text-red-400' : 'text-blue-400'
                    }`}>{indicators.summary.signal}</span>
                    <span className="text-xs text-slate-500">종합 기술적 신호</span>
                  </div>
                  <p className="text-sm text-slate-400 leading-relaxed">{indicators.summary.description}</p>
                </div>

                {/* 개별 지표 카드들 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {indicators.summary.details.map((detail) => {
                    const termKey: HelpTermKey | null = detail.indicator === 'RSI' ? 'rsi' : detail.indicator === 'MACD' ? 'macd' : detail.indicator === '볼린저밴드' ? 'bollinger' : null;
                    return (
                    <div key={detail.indicator} className="p-4 bg-slate-900/50 rounded-xl border border-slate-800/50">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-bold text-slate-300">{detail.indicator}</h4>
                        {termKey && (
                          <button onClick={() => setHelpTerm(termKey)} className="text-slate-600 hover:text-blue-400 text-xs min-w-[24px] min-h-[24px] flex items-center justify-center" aria-label={`${detail.indicator} 도움말`}>[?]</button>
                        )}
                      </div>
                      <p className={`text-lg font-black mb-1 ${
                        detail.color === 'green' ? 'text-emerald-400' :
                        detail.color === 'red' ? 'text-red-400' : 'text-blue-400'
                      }`}>{detail.signal}</p>
                      <p className="text-xs text-slate-500 leading-relaxed">{detail.description}</p>
                      <div className="mt-3 p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg text-xs text-blue-300 leading-relaxed">
                        {helpTexts[detail.indicator === 'RSI' ? 'rsi' : detail.indicator === 'MACD' ? 'macd' : 'bollinger']}
                      </div>
                      {/* Numeric values */}
                      <div className="mt-2 pt-2 border-t border-slate-800/50">
                        {detail.indicator === 'RSI' && indicators.rsi !== null && (
                          <div className="flex items-center space-x-2">
                            <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${indicators.rsi > 70 ? 'bg-red-500' : indicators.rsi < 30 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                                style={{ width: `${indicators.rsi}%` }} />
                            </div>
                            <span className="text-xs font-bold text-slate-400">{indicators.rsi}</span>
                          </div>
                        )}
                        {detail.indicator === 'MACD' && indicators.macd && (
                          <p className="text-xs text-slate-600">MACD {indicators.macd.macdLine.toLocaleString()} / 시그널 {indicators.macd.signal.toLocaleString()}</p>
                        )}
                        {detail.indicator === '볼린저밴드' && indicators.bollinger && (
                          <div className="flex items-center space-x-2">
                            <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${indicators.bollinger.percentB > 80 ? 'bg-red-500' : indicators.bollinger.percentB < 20 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                                style={{ width: `${Math.max(2, Math.min(100, indicators.bollinger.percentB))}%` }} />
                            </div>
                            <span className="text-xs font-bold text-slate-400">{indicators.bollinger.percentB}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>

                {/* 변동성 */}
                <div className="mt-4 p-4 bg-slate-900/50 rounded-xl border border-slate-800/50 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-300 mb-1">가격 변동성</h4>
                    <p className="text-xs text-slate-500">숫자가 클수록 가격이 많이 움직여요</p>
                  </div>
                  <p className="text-xl font-bold">{volatility !== null ? `±${volatility}%` : '---'}</p>
                </div>
              </div>
            )}

            {/* Investor Trading Trends */}
            {stockDetail?.investorData && stockDetail.investorData.length > 0 && (
              <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800/50">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold">투자자별 매매동향</h3>
                  <button onClick={() => setHelpTerm('supplyDemand')} className="text-slate-600 hover:text-blue-400 text-xs min-w-[24px] min-h-[24px] flex items-center justify-center" aria-label="수급 도움말">[?]</button>
                </div>
                <p className="text-xs text-slate-500 mb-1">최근 10거래일 동안 개인·외국인·기관이 주식을 사고판 양을 보여줘요</p>
                <p className="text-xs text-slate-600 mb-4">외국인·기관이 함께 매수하면 긍정적 신호로 보는 경우가 많아요. 단, 단기 흐름만으로 판단하지 마세요.</p>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stockDetail.investorData.slice(-10).map((d) => ({
                      ...d, name: d.date.slice(4, 6) + '/' + d.date.slice(6, 8),
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v > 0 ? '+' : ''}${Math.round(v / 1000)}k`} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }} />
                      <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px' }} />
                      <ReferenceLine y={0} stroke="#334155" />
                      <Bar dataKey="individual" name="개인 투자자 (일반인)" fill="#facc15" />
                      <Bar dataKey="foreign" name="외국인 투자자 (해외)" fill="#ec4899" />
                      <Bar dataKey="institution" name="기관 투자자 (회사·펀드)" fill="#6366f1" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Financial Statements */}
            {financials && financials.financials.length > 0 && (
              <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800/50">
                <h3 className="text-lg font-semibold mb-2">분기별 실적</h3>
                <p className="text-xs text-slate-500 mb-1">최근 분기별 매출과 이익 추이예요. 꾸준히 늘어나면 좋은 신호!</p>
                <p className="text-xs text-slate-600 mb-4">단위: 억 원 (네이버 증권 기준). 1조 = 10,000억</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-800">
                        <th className="text-left py-2 px-3 text-xs text-slate-500 font-bold">구분</th>
                        {financials.periods.slice(0, 5).map(p => (
                          <th key={p} className="text-right py-2 px-3 text-xs text-slate-500 font-bold">{p}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {financials.financials.map(row => (
                        <tr key={row.label} className="border-b border-slate-800/30">
                          <td className="py-2.5 px-3 text-slate-300 font-semibold">{row.label}</td>
                          {row.values.slice(0, 5).map((v, i) => {
                            const prev = i > 0 ? row.values[i - 1] : null;
                            const isGrowing = v !== null && prev !== null && v > prev;
                            // 1조(10,000억) 이상은 "X조 Y,YYY억"으로, 그 외는 "N,NNN억"
                            let formatted = '---';
                            if (v !== null) {
                              const abs = Math.abs(v);
                              const sign = v < 0 ? '-' : '';
                              if (abs >= 10000) {
                                const jo = Math.floor(abs / 10000);
                                const eok = abs % 10000;
                                formatted = `${sign}${jo}조${eok > 0 ? ` ${eok.toLocaleString()}억` : ''}`;
                              } else {
                                formatted = `${sign}${abs.toLocaleString()}억`;
                              }
                            }
                            return (
                              <td key={i} className={`text-right py-2.5 px-3 ${v === null ? 'text-slate-600' : isGrowing ? 'text-emerald-400' : 'text-slate-300'}`}>
                                {formatted}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Sector Comparison */}
            {sectorData && sectorData.stocks.length > 1 && (
              <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800/50">
                <h3 className="text-lg font-semibold mb-2">같은 업종 비교</h3>
                <p className="text-xs text-slate-500 mb-4">
                  <span className="text-blue-400 font-bold">{sectorData.category}</span> 업종 중앙값과 비교해요.
                  PER이 중앙값보다 낮고 ROE가 높으면 좋아요!
                </p>
                <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-slate-900/50 rounded-xl border border-slate-800/50">
                  <div className="text-center">
                    <p className="text-xs text-slate-500 mb-1">업종 중앙값 PER</p>
                    <p className="text-sm font-bold text-blue-400">{sectorData.medians.per}배</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-500 mb-1">업종 중앙값 PBR</p>
                    <p className="text-sm font-bold text-blue-400">{sectorData.medians.pbr}배</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-500 mb-1">업종 중앙값 ROE</p>
                    <p className="text-sm font-bold text-blue-400">{sectorData.medians.roe}%</p>
                  </div>
                </div>
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-950">
                      <tr className="border-b border-slate-800">
                        <th className="text-left py-2 px-3 text-xs text-slate-500 font-bold">종목</th>
                        <th className="text-right py-2 px-3 text-xs text-slate-500 font-bold">PER</th>
                        <th className="text-right py-2 px-3 text-xs text-slate-500 font-bold">PBR</th>
                        <th className="text-right py-2 px-3 text-xs text-slate-500 font-bold">ROE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sectorData.stocks.map(s => {
                        const isCurrent = s.code === stock.code;
                        return (
                          <tr key={s.code} className={`border-b border-slate-800/30 ${isCurrent ? 'bg-blue-600/10' : ''}`}>
                            <td className="py-2 px-3">
                              <span className={isCurrent ? 'text-blue-400 font-bold' : 'text-slate-300'}>{s.name}</span>
                              {isCurrent && <span className="text-xs text-blue-500 ml-1">← 현재</span>}
                            </td>
                            <td className="text-right py-2 px-3">
                              <span className="text-slate-300">{s.per || '---'}</span>
                              {s.perVsAvg !== null && (
                                <span className={`text-xs ml-1 ${s.perVsAvg < 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                                  ({s.perVsAvg > 0 ? '+' : ''}{s.perVsAvg}%)
                                </span>
                              )}
                            </td>
                            <td className="text-right py-2 px-3">
                              <span className="text-slate-300">{s.pbr || '---'}</span>
                            </td>
                            <td className="text-right py-2 px-3">
                              <span className="text-slate-300">{s.roe ? `${s.roe}%` : '---'}</span>
                              {s.roeVsAvg !== null && (
                                <span className={`text-xs ml-1 ${s.roeVsAvg > 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                                  ({s.roeVsAvg > 0 ? '+' : ''}{s.roeVsAvg}%)
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* News (Phase 2 지연 로딩) */}
            {news === null && (
              <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800/50 animate-pulse">
                <div className="h-4 bg-slate-800 rounded w-24 mb-4"></div>
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <div key={i} className="h-12 bg-slate-800/50 rounded-xl"></div>)}
                </div>
              </div>
            )}
            {news !== null && news.length > 0 && (
              <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800/50">
                <h3 className="text-lg font-semibold mb-2">최신 뉴스</h3>
                <p className="text-xs text-slate-500 mb-4">이 종목과 관련된 최근 뉴스예요. 투자 전 꼭 확인해보세요!</p>
                <div className="space-y-3">
                  {news.map((item, i) => (
                    <a key={i} href={item.url} target="_blank" rel="noopener noreferrer"
                      className="block p-3 bg-slate-900/50 rounded-xl border border-slate-800/50 hover:border-blue-500/30 hover:bg-slate-900 transition-all group">
                      <p className="text-sm text-slate-200 group-hover:text-blue-400 transition-colors leading-relaxed mb-1">
                        {item.title}
                      </p>
                      <div className="flex items-center space-x-2 text-xs text-slate-600">
                        <span>{item.source}</span>
                        <span>·</span>
                        <span>{item.date}</span>
                        <ArrowUpRight size={12} className="opacity-0 group-hover:opacity-100 text-blue-400 transition-opacity" />
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Sidebar */}
          <div className="space-y-6">
            <div className="bg-blue-600/10 border border-blue-500/20 rounded-2xl p-6">
              <h3 className="text-lg font-bold mb-4 text-blue-400 flex items-center space-x-2">
                <Zap size={18} />
                <span>종합 전망 & 상세 분석</span>
              </h3>

              <div className="space-y-6 text-sm text-slate-300 leading-relaxed mb-6">
                <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 mb-4">
                  <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 font-bold">종합 의견</p>
                  <div className="flex items-center space-x-3 flex-wrap gap-y-2">
                    {/* Market Opinion (시장 기준) */}
                    <div className="flex items-center space-x-1.5">
                      <span className={`text-lg font-black px-3 py-1 rounded-lg inline-flex items-center space-x-1 ${
                        stockDetail?.market_opinion === '긍정적' ? 'bg-emerald-500/10 text-emerald-500' :
                        stockDetail?.market_opinion === '부정적' ? 'bg-red-500/10 text-red-500' : 'bg-slate-500/10 text-slate-400'
                      }`}>
                        <span>{stockDetail?.market_opinion || '분석 중'}</span>
                        <span className="text-sm">📊</span>
                      </span>
                      <span className="text-xs text-slate-500">시장 분석</span>
                    </div>
                    {/* Holding Opinion (보유 기준, 보유 시에만) — 명령어 → 상태 라벨 변환 */}
                    {isHolding && stock.avgPrice && (() => {
                      const ho = (stockDetail as unknown as { holding_opinion?: string })?.holding_opinion || '보유';
                      const display = ho === '매도' ? '주의 필요' : ho === '추가매수' ? '추가 검토' : ho;
                      return (
                        <div className="flex items-center space-x-1.5">
                          <span className={`text-lg font-black px-3 py-1 rounded-lg border ${
                            ho === '매도' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                            ho === '관망' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                            ho === '추가매수' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                            'bg-blue-500/10 text-blue-400 border-blue-500/20'
                          }`}>{display}</span>
                          <span className="text-xs text-slate-500">보유 전략</span>
                        </div>
                      );
                    })()}
                  </div>
                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                    알고리즘 분석 결과로, 이것은 투자 추천이 아니에요. 점수와 의견은 참고용으로만 봐주세요.
                  </p>
                </div>

                {/* Scoring Breakdown Visualization */}
                {stockDetail?.scoringBreakdown && (
                  <ScoringBreakdownPanel breakdown={stockDetail.scoringBreakdown} />
                )}

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

                <p className="text-xs text-slate-600 mt-4 pt-3 border-t border-slate-800/50 leading-relaxed">
                  이 분석은 참고용이며 실제 투자 성과를 보장하지 않습니다. 모든 투자에는 원금 손실 위험이 있습니다.
                </p>

                {stockDetail?.tossUrl && (
                  <div className="mt-6 pt-6 border-t border-slate-800">
                    <a href={stockDetail.tossUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between p-4 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded-xl transition-all group">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold">T</div>
                        <div>
                          <p className="text-xs font-bold text-white">토스증권 차트 보기</p>
                          <p className="text-xs text-slate-500">실시간 차트와 커뮤니티 반응 확인</p>
                        </div>
                      </div>
                      <ArrowUpRight size={16} className="text-slate-500 group-hover:text-blue-400 transition-all" />
                    </a>
                  </div>
                )}
              </div>

              {!isHolding && stock.fairPrice && (
                <div className="flex justify-between items-center p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20 mb-6">
                  <div>
                    <p className="text-xs text-emerald-500 uppercase tracking-widest mb-0.5">AI 추천 매수 적정가</p>
                    <p className="text-xl font-black text-white">₩{stock.fairPrice.toLocaleString()}</p>
                  </div>
                  <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400"><Zap size={20} fill="currentColor" /></div>
                </div>
              )}

              {!isHolding && (
                <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-6 mb-6">
                  <h4 className="text-sm font-bold mb-4 flex items-center space-x-2">
                    <Plus size={16} className="text-blue-400" />
                    <span>내 포트폴리오에 추가</span>
                  </h4>
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs text-slate-500 mb-1 uppercase tracking-widest block font-bold">매수가 (₩)</label>
                        <input type="number" title="매수가" value={addForm.avgPrice}
                          onChange={(e) => setAddForm({ ...addForm, avgPrice: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 mb-1 uppercase tracking-widest block font-bold">수량 (주)</label>
                        <input type="number" title="수량" value={addForm.quantity}
                          onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 mb-1 uppercase tracking-widest block font-bold">비중 (%)</label>
                        <input type="number" title="비중" value={addForm.weight}
                          onChange={(e) => setAddForm({ ...addForm, weight: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                      </div>
                    </div>
                    {addForm.quantity !== '0' && addForm.avgPrice !== '0' && (
                      <p className="text-xs text-slate-500">
                        총 투자금액: ₩{(parseInt(addForm.quantity || '0') * parseInt(addForm.avgPrice || '0')).toLocaleString()}
                      </p>
                    )}
                    <button onClick={async () => {
                      setAdding(true);
                      try {
                        await onAdd({ code: stock.code, name: stockDetail?.name || stock.name,
                          avgPrice: parseInt(addForm.avgPrice), value: parseInt(addForm.weight),
                          quantity: parseInt(addForm.quantity || '0') });
                        onBack();
                      } catch (err) { console.error('Failed to add:', err); } finally { setAdding(false); }
                    }} disabled={adding}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50 min-h-[44px]">
                      {adding ? '추가 중...' : '포트폴리오 등록'}
                    </button>
                  </div>
                </div>
              )}

              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 mb-6">
                <p className="text-xs text-slate-500 mb-1 uppercase tracking-widest text-center italic">Probability</p>
                <div className="text-3xl font-black text-center text-white">{computeProbability()}%</div>
                <p className="text-xs text-slate-500 text-center mt-1">상승 예측 확률</p>
              </div>

              <button onClick={async () => {
                setRefreshing(true);
                try {
                  const [data, vol, ind] = await Promise.all([
                    stockApi.refreshStock(stock.code), stockApi.getVolatility(stock.code), stockApi.getIndicators(stock.code)
                  ]);
                  setStockDetail(data); setVolatility(vol.volatility); setIndicators(ind);
                } catch (error) { console.error('Refresh failed:', error); } finally { setRefreshing(false); }
              }} disabled={refreshing}
                className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 flex items-center justify-center space-x-2">
                {refreshing && <RefreshCw className="animate-spin" size={14} />}
                <span>{refreshing ? '업데이트 중...' : '실시간 데이터 업데이트'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      <HelpBottomSheet termKey={helpTerm} onClose={() => setHelpTerm(null)} />
    </div>
  );
};

export default StockDetailView;
