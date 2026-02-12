import axios from 'axios';

const API_BASE_URL = 'http://localhost:3001/api';

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
    addHolding: async (stock: { code: string, name: string, avgPrice: number, weight: number }) => {
        const response = await axios.post(`${API_BASE_URL}/holdings`, stock);
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
    }
};
