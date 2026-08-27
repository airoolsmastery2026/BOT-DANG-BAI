import {
  createDesktopWorkerJob,
  getDesktopWorkerHealth,
  isDesktopPublishingWorkerAvailable,
  mapWorkerAccounts,
  saveDesktopWorkerAccount,
} from './desktop_publishing_worker';

afterEach(() => {
  delete window.dhpDesktop;
});

test('detects the narrow desktop publishing bridge', async () => {
  window.dhpDesktop = {
    publishingWorker: {
      health: jest.fn().mockResolvedValue({ ok: true, data: { status: 'ok', accounts: [] } }),
    },
  };

  expect(isDesktopPublishingWorkerAvailable()).toBe(true);
  await expect(getDesktopWorkerHealth()).resolves.toMatchObject({ status: 'ok' });
});

test('passes account and job payloads through typed bridge methods', async () => {
  const saveAccount = jest.fn().mockResolvedValue({ ok: true, data: { configured: true } });
  const createJob = jest.fn().mockResolvedValue({ ok: true, data: { id: 'job-1' } });
  window.dhpDesktop = { publishingWorker: { saveAccount, createJob } };

  const credentials = { accessToken: 'secret-token', boardId: '123456789' };
  await expect(saveDesktopWorkerAccount('pinterest', credentials)).resolves.toEqual({ configured: true });
  await expect(createDesktopWorkerJob({ content: 'Pin', platforms: ['pinterest'] })).resolves.toEqual({ id: 'job-1' });
  expect(saveAccount).toHaveBeenCalledWith('pinterest', credentials);
  expect(createJob).toHaveBeenCalledWith({ content: 'Pin', platforms: ['pinterest'] });
});

test('preserves worker error codes without exposing a generic IPC surface', async () => {
  window.dhpDesktop = {
    publishingWorker: {
      health: jest.fn().mockResolvedValue({
        ok: false,
        error: { message: 'Tài khoản chưa xác minh', code: 'ACCOUNT_NOT_VERIFIED' },
      }),
    },
  };

  await expect(getDesktopWorkerHealth()).rejects.toMatchObject({
    message: 'Tài khoản chưa xác minh',
    code: 'ACCOUNT_NOT_VERIFIED',
  });
});

test('maps public worker account metadata by platform', () => {
  expect(mapWorkerAccounts({
    accounts: [
      { platform: 'linkedin', configured: true, ready: true },
      { platform: 'youtube', configured: true, ready: false },
    ],
  })).toEqual({
    linkedin: { platform: 'linkedin', configured: true, ready: true },
    youtube: { platform: 'youtube', configured: true, ready: false },
  });
});
