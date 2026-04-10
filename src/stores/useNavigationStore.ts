import { create } from 'zustand';
import type { StockSummary } from '../types/stock';

interface NavigationState {
  activeTab: string;
  selectedStock: StockSummary | null;
  previousTab: string;
  pendingFocus: string | null; // 페이지 진입 시 포커스할 요소 식별자 (예: 'add-holding-search')
}

interface NavigationActions {
  navigateTo: (tab: string, options?: { focus?: string }) => void;
  handleDetailClick: (stock: StockSummary) => void;
  goBack: () => void;
  consumePendingFocus: () => string | null;
}

export const useNavigationStore = create<NavigationState & NavigationActions>((set, get) => ({
  activeTab: 'dashboard',
  selectedStock: null,
  previousTab: 'dashboard',
  pendingFocus: null,

  navigateTo: (tab, options) => set({ activeTab: tab, selectedStock: null, pendingFocus: options?.focus ?? null }),

  consumePendingFocus: () => {
    const focus = get().pendingFocus;
    if (focus) set({ pendingFocus: null });
    return focus;
  },

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
