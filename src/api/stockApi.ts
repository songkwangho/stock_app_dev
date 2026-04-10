import axios from 'axios';
import { useToastStore } from '../stores/useToastStore';
import { getDeviceId } from '../storage/deviceId';

const API_BASE_URL = 'http://localhost:3001/api';

// Attach X-Device-Id header to every request
axios.interceptors.request.use((config) => {
    config.headers['X-Device-Id'] = getDeviceId();
    return config;
});

// Global error toast on API failure
axios.interceptors.response.use(
    (response) => response,
    (error) => {
        // Skip toast for health check (expected to fail sometimes) and search (too noisy)
        const url = error.config?.url || '';
        const silent = url.includes('/health') || url.includes('/search') || url.includes('/unread-count');
        if (!silent) {
            const msg = error.response?.data?.error || '서버와 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.';
            useToastStore.getState().addToast(msg, 'error');
        }
        return Promise.reject(error);
    }
);

export const stockApi = {
    // Get current price
    getCurrentPrice: async (code: string) => {
        const response = await axios.get(`${API_BASE_URL}/stock/${code}`);
        return response.data;
    },

    // Get recommendations from server
    getRecommendations: async () => {
        const response = await axios.get(`${API_BASE_URL}/recommendations`);
        return response.data;
    },

    // Portfolio Management
    getHoldings: async () => {
        const response = await axios.get(`${API_BASE_URL}/holdings`);
        return response.data;
    },
    addHolding: async (stock: { code: string, name: string, avgPrice: number, weight: number, quantity?: number }) => {
        const response = await axios.post(`${API_BASE_URL}/holdings`, stock);
        return response.data;
    },
    updateHolding: async (stock: import('../types/stock').UpdateHoldingPayload) => {
        const response = await axios.put(`${API_BASE_URL}/holdings/${stock.code}`, {
            avgPrice: stock.avgPrice,
            quantity: stock.quantity,
        });
        return response.data;
    },
    deleteHolding: async (code: string) => {
        const response = await axios.delete(`${API_BASE_URL}/holdings/${code}`);
        return response.data;
    },
    // Search Stocks
    searchStocks: async (query: string) => {
        const response = await axios.get(`${API_BASE_URL}/search`, { params: { q: query } });
        return response.data;
    },
    // Get All Stocks
    getAllStocks: async () => {
        const response = await axios.get(`${API_BASE_URL}/stocks`);
        return response.data;
    },
    // Add New Stock
    addStock: async (code: string) => {
        const response = await axios.post(`${API_BASE_URL}/stocks`, { code });
        return response.data;
    },
    // Delete Stock from DB
    deleteStock: async (code: string) => {
        const response = await axios.delete(`${API_BASE_URL}/stocks/${code}`);
        return response.data;
    },
    // Portfolio history (daily aggregated value)
    getHoldingsHistory: async () => {
        const response = await axios.get(`${API_BASE_URL}/holdings/history`);
        return response.data;
    },
    // Stock volatility (std dev of daily returns)
    getVolatility: async (code: string) => {
        const response = await axios.get(`${API_BASE_URL}/stock/${code}/volatility`);
        return response.data;
    },
    // Force refresh stock data (invalidate cache + re-fetch + chart capture)
    refreshStock: async (code: string) => {
        const response = await axios.post(`${API_BASE_URL}/stock/${code}/refresh`);
        return response.data;
    },
    // Alerts
    getAlerts: async () => {
        const response = await axios.get(`${API_BASE_URL}/alerts`);
        return response.data;
    },
    getUnreadAlertCount: async () => {
        const response = await axios.get(`${API_BASE_URL}/alerts/unread-count`);
        return response.data;
    },
    markAlertsRead: async () => {
        const response = await axios.post(`${API_BASE_URL}/alerts/read`);
        return response.data;
    },
    deleteAlert: async (id: number) => {
        const response = await axios.delete(`${API_BASE_URL}/alerts/${id}`);
        return response.data;
    },
    // Market indices
    getMarketIndices: async () => {
        const response = await axios.get(`${API_BASE_URL}/market/indices`);
        return response.data;
    },
    // Watchlist
    getWatchlist: async () => {
        const response = await axios.get(`${API_BASE_URL}/watchlist`);
        return response.data;
    },
    addToWatchlist: async (code: string) => {
        const response = await axios.post(`${API_BASE_URL}/watchlist`, { code });
        return response.data;
    },
    removeFromWatchlist: async (code: string) => {
        const response = await axios.delete(`${API_BASE_URL}/watchlist/${code}`);
        return response.data;
    },
    // Technical indicators
    getIndicators: async (code: string) => {
        const response = await axios.get(`${API_BASE_URL}/stock/${code}/indicators`);
        return response.data;
    },
    // Screener
    screener: async (filters: Record<string, string | number>) => {
        const response = await axios.get(`${API_BASE_URL}/screener`, { params: filters });
        return response.data;
    },
    // Financial statements
    getFinancials: async (code: string) => {
        const response = await axios.get(`${API_BASE_URL}/stock/${code}/financials`);
        return response.data;
    },
    // News
    getNews: async (code: string) => {
        const response = await axios.get(`${API_BASE_URL}/stock/${code}/news`);
        return response.data;
    },
    // Sector comparison
    getSectorComparison: async (category: string) => {
        const response = await axios.get(`${API_BASE_URL}/sector/${encodeURIComponent(category)}/compare`);
        return response.data;
    },
    // Weekly/Monthly chart data
    getChartData: async (code: string, timeframe: 'weekly' | 'monthly') => {
        const response = await axios.get(`${API_BASE_URL}/stock/${code}/chart/${timeframe}`);
        return response.data;
    },
    // Health check
    getHealth: async () => {
        const response = await axios.get(`${API_BASE_URL}/health`, { timeout: 6000 });
        return response.data as { api: boolean; database: boolean; lastSync: string | null };
    }
};
