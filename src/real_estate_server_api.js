const request = async (baseUrl, apiKey, path, options = {}) => {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-API-Key': apiKey } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.errors?.join(' ') || `HTTP ${response.status}`);
  return payload;
};

export const getRealEstateHealth = (baseUrl) => request(baseUrl, '', '/health');

export const getListings = (baseUrl, apiKey, filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value !== '' && value != null) params.set(key, value); });
  const query = params.toString();
  return request(baseUrl, apiKey, `/api/real-estate/listings${query ? `?${query}` : ''}`);
};

export const getListingStats = (baseUrl, apiKey) => request(baseUrl, apiKey, '/api/real-estate/stats');
export const createListing = (baseUrl, apiKey, listing) => request(baseUrl, apiKey, '/api/real-estate/listings', { method: 'POST', body: JSON.stringify(listing) });
export const updateListing = (baseUrl, apiKey, id, listing) => request(baseUrl, apiKey, `/api/real-estate/listings/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(listing) });
export const deleteListing = (baseUrl, apiKey, id) => request(baseUrl, apiKey, `/api/real-estate/listings/${encodeURIComponent(id)}`, { method: 'DELETE' });
