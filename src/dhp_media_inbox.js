const baseUrl = () => String(process.env.REACT_APP_DHP_MEDIA_INGRESS_URL || '').replace(/\/$/, '');
const token = () => String(process.env.REACT_APP_DHP_MEDIA_INGRESS_TOKEN || '').trim();

const request = async (path, options = {}) => {
  if (!baseUrl()) throw new Error('Chưa cấu hình REACT_APP_DHP_MEDIA_INGRESS_URL.');
  if (!token()) throw new Error('Chưa cấu hình REACT_APP_DHP_MEDIA_INGRESS_TOKEN.');

  const response = await fetch(`${baseUrl()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token()}`,
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `DHP Media Ingress lỗi HTTP ${response.status}`);
  return payload;
};

export const fetchPendingMediaPackages = async () => {
  const payload = await request('/v1/media/packages?status=pending');
  return Array.isArray(payload.data) ? payload.data : [];
};

export const acknowledgeMediaPackage = async (packageId, postId) => {
  const payload = await request(`/v1/media/packages/${encodeURIComponent(packageId)}/ack`, {
    method: 'POST',
    body: JSON.stringify({ postId }),
  });
  return payload.data;
};
