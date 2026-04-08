const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const cache = {};

export function getCached(key) {
    const entry = cache[key];
    if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
        return entry.data;
    }
    return null;
}

export function setCache(key, data) {
    cache[key] = { data, timestamp: Date.now() };
}

export function invalidateCache(key) {
    delete cache[key];
}

export { CACHE_TTL };
