export function getDeviceId(req) {
    return req.headers['x-device-id'] || null;
}

export function requireDeviceId(req, res) {
    const deviceId = getDeviceId(req);
    if (!deviceId) {
        res.status(400).json({ error: 'X-Device-Id header is required' });
        return null;
    }
    return deviceId;
}
