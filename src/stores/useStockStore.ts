import { create } from 'zustand';
import { stockApi } from '../api/stockApi';
import type { Holding, StockSummary } from '../types/stock';

interface StockStore {
  activeTab: string;
  selectedStock: StockSummary | null;
  holdings: Holding[];

  setActiveTab: (tab: string) => void;
  setSelectedStock: (stock: StockSummary | null) => void;
  navigateTo: (tab: string) => void;
  handleDetailClick: (stock: StockSummary) => void;

  fetchHoldings: () => Promise<void>;
  addHolding: (stock: { code: string; name: string; value: number; avgPrice: number; quantity?: number }) => Promise<void>;
  updateHolding: (stock: { code: string; name: string; value: number; avgPrice: number; quantity?: number }) => Promise<void>;
  deleteHolding: (code: string) => Promise<void>;
}

export const useStockStore = create<StockStore>((set, get) => ({
  activeTab: 'dashboard',
  selectedStock: null,
  holdings: [],

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedStock: (stock) => set({ selectedStock: stock }),

  navigateTo: (tab) => set({ activeTab: tab, selectedStock: null }),

  handleDetailClick: (stock) => set({ selectedStock: stock, activeTab: 'detail' }),

  fetchHoldings: async () => {
    try {
      const data = await stockApi.getHoldings();
      const mappedHoldings: Holding[] = data.map((h: Record<string, unknown>) => ({
        code: h.code as string,
        name: h.name as string,
        value: h.weight as number,
        avgPrice: h.avg_price as number,
        currentPrice: h.price as number,
        quantity: (h.quantity as number) || 0,
      }));
      set({ holdings: mappedHoldings });
    } catch (error) {
      console.error('Failed to fetch holdings:', error);
    }
  },

  addHolding: async (stock) => {
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
    }
  },

  updateHolding: async (stock) => {
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
      console.error('Failed to update holding:', error);
    }
  },

  deleteHolding: async (code) => {
    try {
      await stockApi.deleteHolding(code);
      await get().fetchHoldings();
    } catch (error) {
      console.error('Failed to delete holding:', error);
    }
  },
}));
