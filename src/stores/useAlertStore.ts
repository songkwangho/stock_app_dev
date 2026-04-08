import { create } from 'zustand';
import { stockApi } from '../api/stockApi';
import type { Alert } from '../types/stock';

interface AlertState {
  alerts: Alert[];
  unreadCount: number;
}

interface AlertActions {
  fetchAlerts: () => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markAllRead: () => Promise<void>;
  deleteAlert: (id: number) => Promise<void>;
}

export const useAlertStore = create<AlertState & AlertActions>((set, get) => ({
  alerts: [],
  unreadCount: 0,

  fetchAlerts: async () => {
    try {
      const data = await stockApi.getAlerts();
      set({ alerts: data });
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    }
  },

  fetchUnreadCount: async () => {
    try {
      const data = await stockApi.getUnreadAlertCount();
      set({ unreadCount: data.count });
    } catch { /* silent */ }
  },

  markAllRead: async () => {
    try {
      await stockApi.markAlertsRead();
      set({ unreadCount: 0 });
    } catch (error) {
      console.error('Failed to mark alerts read:', error);
    }
  },

  deleteAlert: async (id) => {
    const prev = get().alerts;
    set({ alerts: prev.filter(a => a.id !== id) }); // optimistic
    try {
      await stockApi.deleteAlert(id);
    } catch (error) {
      console.error('Failed to delete alert:', error);
      set({ alerts: prev }); // rollback
    }
  },
}));
