import { SCHEDULER_HANDOFF_STORAGE_KEY } from './scheduler_handoff';

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function consumeVideoOsHandoff() {
  if (typeof window === 'undefined') return null;

  const rawHash = window.location.hash.replace(/^#\/?/, '');
  const [routePart, queryPart = ''] = rawHash.split('?');
  const params = new URLSearchParams(queryPart);
  const encoded = params.get('videoos');
  if (!encoded) return null;

  try {
    const payload = JSON.parse(decodeBase64Url(encoded));
    const campaignId = String(payload?.campaignId || '').trim();
    const topic = String(payload?.topic || '').trim();
    const platforms = Array.isArray(payload?.platforms) ? payload.platforms : [];
    if (!campaignId || !topic || platforms.length === 0) return null;

    const handoff = {
      campaignId,
      topic,
      platforms,
      publishAt: payload.publishAt || null,
      content: String(payload.content || ''),
      videoUrl: String(payload.videoUrl || ''),
      source: 'video-os',
      sourceJobId: String(payload.sourceJobId || campaignId),
      sourceAccessToken: String(payload.sourceAccessToken || ''),
      sourceCallbackUrl: String(payload.sourceCallbackUrl || ''),
      handedOffAt: new Date().toISOString(),
    };

    window.localStorage.setItem(SCHEDULER_HANDOFF_STORAGE_KEY, JSON.stringify(handoff));
    window.history.replaceState(null, '', `#/${routePart || 'scheduler'}`);
    return handoff;
  } catch {
    return null;
  }
}
