import { create } from 'zustand';
import { stockApi } from '../api/stockApi';
import type { Holding, MarketOpinion, HoldingOpinion } from '../types/stock';

interface PortfolioState {
  holdings: Holding[];
  isLoading: boolean;
  error: string | null;
}

interface PortfolioActions {
  fetchHoldings: () => Promise<void>;
  addHolding: (stock: { code: string; name: string; value: number; avgPrice: number; quantity?: number }) => Promise<void>;
  updateHolding: (stock: { code: string; name: string; value: number; avgPrice: number; quantity?: number }) => Promise<void>;
  deleteHolding: (code: string) => Promise<void>;
}

export const usePortfolioStore = create<PortfolioState & PortfolioActions>((set, get) => ({
  holdings: [],
  isLoading: false,
  error: null,

  fetchHoldings: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await stockApi.getHoldings();
      const mappedHoldings: Holding[] = data.map((h: Record<string, unknown>) => ({
        code: h.code as string,
        name: h.name as string,
        value: h.weight as number,
        avgPrice: h.avg_price as number,
        currentPrice: h.price as number,
        quantity: (h.quantity as number) || 0,
        holding_opinion: (h.holding_opinion as HoldingOpinion) || undefined,
        market_opinion: (h.market_opinion as MarketOpinion) || undefined,
      }));
      set({ holdings: mappedHoldings, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch holdings:', error);
      set({ isLoading: false, error: 'Failed to fetch holdings' });
    }
  },

  addHolding: async (stock) => {
    set({ isLoading: true, error: null });
    try {
      await stockApi.addHolding({
        code: stock.code,
        name: stock.name,
        avgPrice: stock.avgPrice,
        weight: 0,
        quantity: stock.quantity || 0,
      });
      await get().fetchHoldings();
    } catch (error) {
      console.error('Failed to add holding:', error);
      set({ isLoading: false, error: '종목 추가에 실패했습니다.' });
      throw error;
    }
  },

  updateHolding: async (stock) => {
    set({ isLoading: true, error: null });
    try {
      await stockApi.updateHolding({
        code: stock.code,
        name: stock.name,
        avgPrice: stock.avgPrice,
        weight: 0,
        quantity: stock.quantity || 0,
      });
      await get().fetchHoldings();
    } catch (error) {
      console.error('Failed to update holding:', error);
      set({ isLoading: false, error: '종목 수정에 실패했습니다.' });
      throw error;
    }
  },

  deleteHolding: async (code) => {
    set({ isLoading: true, error: null });
    try {
      await stockApi.deleteHolding(code);
      await get().fetchHoldings();
    } catch (error) {
      console.error('Failed to delete holding:', error);
      set({ isLoading: false, error: '종목 삭제에 실패했습니다.' });
      throw error;
    }
  },
}));
