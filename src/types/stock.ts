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
  opinion?: string;
  last_updated?: string;
}

export interface Holding {
  code: string;
  name: string;
  value: number;
  avgPrice: number;
  currentPrice: number;
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
  opinion?: string;
  tossUrl?: string;
  chartPath?: string;
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
  opinion?: string;
  tossUrl?: string;
  chartPath?: string;
}

export interface HistoryEntry {
  date: string;
  price: number;
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
  opinion?: string;
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
