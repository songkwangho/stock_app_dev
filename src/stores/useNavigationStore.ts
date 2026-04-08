import { create } from 'zustand';
import type { StockSummary } from '../types/stock';

interface NavigationState {
  activeTab: string;
  selectedStock: StockSummary | null;
  previousTab: string;
}

interface NavigationActions {
  navigateTo: (tab: string) => void;
  handleDetailClick: (stock: StockSummary) => void;
  goBack: () => void;
}

export const useNavigationStore = create<NavigationState & NavigationActions>((set, get) => ({
  activeTab: 'dashboard',
  selectedStock: null,
  previousTab: 'dashboard',

  navigateTo: (tab) => set({ activeTab: tab, selectedStock: null }),

  handleDetailClick: (stock) => set((state) => ({
    previousTab: state.activeTab,
    selectedStock: stock,
    activeTab: 'detail',
  })),

  goBack: () => {
    const { previousTab, selectedStock } = get();
    if (selectedStock?.category === '보유 종목') {
      set({ activeTab: 'analysis', selectedStock: null });
    } else {
      set({
        activeTab: previousTab === 'detail' ? 'dashboard' : previousTab,
        selectedStock: null,
      });
    }
  },
}));
