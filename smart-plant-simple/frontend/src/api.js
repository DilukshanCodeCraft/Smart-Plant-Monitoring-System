const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }

  return payload;
}

export const api = {
  getOverview: () => request('/overview'),
  getLatestBatch: () => request('/readings/latest'),
  getBatchReadings: (params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.set(key, String(value));
      }
    });

    const suffix = query.toString() ? `?${query.toString()}` : '';
    return request(`/readings${suffix}`);
  },
  getRoundReadings: (params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.set(key, String(value));
      }
    });

    const suffix = query.toString() ? `?${query.toString()}` : '';
    return request(`/rounds${suffix}`);
  },
  sendDeviceCommand: (target, state) => request(`/device/${target}/${state}`)
};
