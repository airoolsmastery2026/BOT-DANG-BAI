'use strict';

const PERSON_URN = /^urn:li:person:([^:]+)$/i;
const ORGANIZATION_URN = /^urn:li:organization:(\d+)$/i;

function createRemoteError(response, body, fallback) {
  const error = new Error(body?.message || body?.errorDetails?.message || fallback || `LinkedIn HTTP ${response.status}`);
  error.code = body?.code || body?.status || `HTTP_${response.status}`;
  error.retryable = response.status === 429 || response.status >= 500;
  return error;
}

async function readJson(response, fallback) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw createRemoteError(response, body, fallback);
  return body;
}

function createLinkedInAdapter({ fetchImpl = fetch, timeoutMs = 30_000, apiVersion = '202606' } = {}) {
  const version = /^\d{6}$/.test(String(apiVersion || '').trim())
    ? String(apiVersion).trim()
    : '202606';

  const headers = (accessToken, { versioned = true } = {}) => ({
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Restli-Protocol-Version': '2.0.0',
    ...(versioned ? { 'Linkedin-Version': version } : {}),
  });

  const verify = async (credentials) => {
    const authorUrn = String(credentials.authorUrn || '').trim();
    const person = authorUrn.match(PERSON_URN);
    const organization = authorUrn.match(ORGANIZATION_URN);
    if (!person && !organization) throw new Error('LinkedIn Author URN không hợp lệ.');

    if (person) {
      const response = await fetchImpl('https://api.linkedin.com/v2/me', {
        headers: headers(credentials.accessToken, { versioned: false }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const data = await readJson(response, 'LinkedIn member verify failed.');
      if (String(data?.id || '') !== person[1]) {
        throw new Error('LinkedIn token không khớp Person URN trong vault.');
      }
      const name = [data?.localizedFirstName, data?.localizedLastName].filter(Boolean).join(' ').trim();
      return { platform: 'linkedin', ok: true, account: { id: authorUrn, name: name || authorUrn } };
    }

    const response = await fetchImpl(`https://api.linkedin.com/rest/organizations/${encodeURIComponent(organization[1])}`, {
      headers: headers(credentials.accessToken),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await readJson(response, 'LinkedIn organization verify failed.');
    if (String(data?.id || '') !== organization[1]) {
      throw new Error('LinkedIn token không khớp Organization URN trong vault.');
    }
    return {
      platform: 'linkedin',
      ok: true,
      account: { id: authorUrn, name: data?.localizedName || data?.name || authorUrn },
    };
  };

  const publish = async (job, credentials) => {
    const response = await fetchImpl('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: headers(credentials.accessToken),
      body: JSON.stringify({
        author: credentials.authorUrn,
        commentary: job.content,
        visibility: 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await readJson(response, 'LinkedIn publish failed.');
    const externalPostId = response.headers.get('x-restli-id') || data?.id || null;
    return { success: true, externalPostId, publishedAt: new Date().toISOString() };
  };

  return { publish, verify };
}

module.exports = {
  ORGANIZATION_URN,
  PERSON_URN,
  createLinkedInAdapter,
};
