import { SCHEDULER_HANDOFF_STORAGE_KEY } from './scheduler_handoff';

const MAX_HANDOFF_BYTES = 64 * 1024;
const SUPPORTED_PLATFORMS = new Set(['facebook', 'instagram', 'tiktok']);

function decodeBase64Url(value) {
  if (!value || value.length > MAX_HANDOFF_BYTES * 2) throw new Error('Video OS handoff quá lớn');
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  if (binary.length > MAX_HANDOFF_BYTES) throw new Error('Video OS handoff quá lớn');
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function normalizePlatforms(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((platform) => String(platform || '').trim().toLowerCase())
    .filter((platform) => SUPPORTED_PLATFORMS.has(platform)))];
}

function normalizePublicUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

export function consumeVideoOsHandoff() {
  if (typeof window === 'undefined') return null;

  const rawHash = window.location.hash.replace(/^#\/?/, '');
  const [routePart, queryPart = ''] = rawHash.split('?');
  const params = new URLSearchParams(queryPart);
  const encoded = params.get('videoos');
  if (!encoded) return null;

  // Remove the handoff from the address bar immediately so sensitive or malformed
  // payloads are not retained in browser history, screenshots or copied URLs.
  window.history.replaceState(null, '', `#/${routePart || 'scheduler'}`);

  try {
    const payload = JSON.parse(decodeBase64Url(encoded));
    const campaignId = String(payload?.campaignId || '').trim().slice(0, 160);
    const topic = String(payload?.topic || '').trim().slice(0, 500);
    const platforms = normalizePlatforms(payload?.platforms);
    if (!campaignId || !topic || platforms.length === 0) return null;

    const handoff = {
      campaignId,
      topic,
      platforms,
      publishAt: payload.publishAt || null,
      content: String(payload.content || '').slice(0, 50_000),
      videoUrl: normalizePublicUrl(payload.videoUrl),
      source: 'video-os',
      sourceJobId: String(payload.sourceJobId || campaignId).trim().slice(0, 160),
      handedOffAt: new Date().toISOString(),
    };

    // Never persist access tokens, callback credentials or arbitrary secret fields
    // received through a browser URL. Authentication between systems belongs on a
    // server-to-server channel, not in localStorage.
    window.localStorage.setItem(SCHEDULER_HANDOFF_STORAGE_KEY, JSON.stringify(handoff));
    return handoff;
  } catch {
    return null;
  }
}
