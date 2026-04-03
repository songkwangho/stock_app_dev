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
  addHolding: (stock: { code: string; name: string; value: number; avgPrice: number }) => Promise<void>;
  deleteHolding: (index: number) => Promise<void>;
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
      }));
      set({ holdings: mappedHoldings });
    } catch (error) {
      console.error('Failed to fetch holdings:', error);
    }
  },

  addHolding: async (stock) => {
    try {
      const added = await stockApi.addHolding({
        code: stock.code,
        name: stock.name,
        avgPrice: stock.avgPrice,
        weight: stock.value,
      });
      set((state) => ({
        holdings: [
          ...state.holdings,
          {
            code: added.code,
            name: added.name,
            value: added.weight,
            avgPrice: added.avg_price,
            currentPrice: added.price,
          },
        ],
      }));
    } catch (error) {
      console.error('Failed to add holding:', error);
    }
  },

  deleteHolding: async (index) => {
    const { holdings } = get();
    const stockToDelete = holdings[index];
    try {
      await stockApi.deleteHolding(stockToDelete.code);
      set((state) => ({
        holdings: state.holdings.filter((_, i) => i !== index),
      }));
    } catch (error) {
      console.error('Failed to delete holding:', error);
    }
  },
}));
