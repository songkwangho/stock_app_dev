// 비보유 기준 10점 스코어링 결과 (공용, DB 저장)
export type MarketOpinion = '긍정적' | '중립적' | '부정적';

// 평단가 기반 5단계 판단 (개인화, 런타임 계산)
export type HoldingOpinion = '보유' | '추가매수' | '관망' | '매도';

export interface Stock {
  code: string;
  name: string;
  category: string;
  price: number;
  change?: string;
  change_rate?: string;
  per?: number;
  pbr?: number;
  roe?: number;
  target_price?: number;
  market_opinion?: MarketOpinion;
  last_updated?: string;
}

export interface Holding {
  code: string;
  name: string;
  value: number;
  avgPrice: number;
  currentPrice: number;
  quantity: number;
  holding_opinion?: HoldingOpinion;
  market_opinion?: MarketOpinion;
}

export interface Recommendation {
  code: string;
  name: string;
  category: string;
  reason: string;
  score: number;
  fairPrice: number;
  currentPrice: number;
  per?: number;
  pbr?: number;
  roe?: number;
  targetPrice?: number;
  probability?: number;
  analysis?: string;
  advice?: string;
  market_opinion?: MarketOpinion;
  source?: 'manual' | 'algorithm';
  tossUrl?: string;
  chartPath?: string;
}

export interface ScoringBreakdown {
  valuation: number;
  technical: number;
  supplyDemand: number;
  trend: number;
  total: number;
  per_negative?: boolean;
  low_confidence?: boolean;
  detail?: {
    valuation: { perScore: number; pbrScore: number; pegScore: number };
    technical: { rsiScore: number; macdScore: number; bollingerScore: number; volumeScore: number };
    supplyDemand: { foreignConsecutive: number; instConsecutive: number; foreignScore: number; instScore: number };
    trend: { reason: string };
  };
}

export interface StockDetail {
  code: string;
  name: string;
  price: number;
  per?: number;
  pbr?: number;
  roe?: number;
  targetPrice?: number;
  history: HistoryEntry[];
  investorData?: InvestorEntry[];
  analysis?: string;
  advice?: string;
  market_opinion?: MarketOpinion;
  tossUrl?: string;
  chartPath?: string;
  scoringBreakdown?: ScoringBreakdown;
}

export interface HistoryEntry {
  date: string;
  price: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}

export interface InvestorEntry {
  date: string;
  institution: number;
  foreign: number;
  individual: number;
}

export interface ChartDataPoint {
  name: string;
  price: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  sma5: number | null;
  sma20: number | null;
}

export interface StockSummary {
  code: string;
  name: string;
  category: string;
  reason?: string;
  score?: number;
  fairPrice?: number;
  avgPrice?: number;
  value?: number;
  currentPrice?: number;
  quantity?: number;
  market_opinion?: MarketOpinion;
  price?: number;
}

export interface Alert {
  id: number;
  code: string;
  name: string;
  type: string;
  message: string;
  read: number;
  created_at: string;
}

export interface MarketIndex {
  symbol: string;
  value: number | null;
  change: string;
  changeRate: string;
  positive: boolean;
}

export interface WatchlistItem {
  code: string;
  name: string;
  category: string;
  price: number;
  market_opinion?: MarketOpinion;
  added_at: string;
}

export interface IndicatorDetail {
  indicator: string;
  signal: string;
  description: string;
  color: string;
}

export interface TechnicalIndicators {
  rsi: number | null;
  macd: { macdLine: number; signal: number; histogram: number } | null;
  bollinger: { upper: number; middle: number; lower: number; percentB: number } | null;
  summary: {
    signal: string;
    description: string;
    details: IndicatorDetail[];
  } | null;
}

export interface NewsItem {
  title: string;
  url: string;
  date: string;
  source: string;
}

export interface FinancialData {
  periods: string[];
  financials: { label: string; values: (number | null)[] }[];
}

export interface SectorComparison {
  category: string;
  averages: { per: number; pbr: number; roe: number };
  medians: { per: number; pbr: number; roe: number };
  stocks: (Stock & {
    perVsAvg: number | null;
    pbrVsAvg: number | null;
    roeVsAvg: number | null;
  })[];
}
