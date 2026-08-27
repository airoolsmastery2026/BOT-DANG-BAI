const bridge = () => (typeof window !== 'undefined' ? window.dhpDesktop?.publishingWorker : null);

const unwrap = async (promise) => {
  const result = await promise;
  if (result?.ok) return result.data;
  const error = new Error(result?.error?.message || 'Publishing Worker desktop không phản hồi.');
  error.code = result?.error?.code || 'DESKTOP_WORKER_ERROR';
  if (result?.error?.existingJobId) error.existingJobId = result.error.existingJobId;
  throw error;
};

const call = (method, ...args) => {
  const worker = bridge();
  if (!worker || typeof worker[method] !== 'function') {
    throw new Error('Tính năng này cần bản BOT ĐĂNG BÀI cài trên Windows có Publishing Worker tích hợp.');
  }
  return unwrap(worker[method](...args));
};

export const isDesktopPublishingWorkerAvailable = () => Boolean(bridge());
export const getDesktopWorkerHealth = () => call('health');
export const saveDesktopWorkerAccount = (platform, credentials) => call('saveAccount', platform, credentials);
export const verifyDesktopWorkerAccount = (platform) => call('verifyAccount', platform);
export const removeDesktopWorkerAccount = (platform) => call('removeAccount', platform);
export const createDesktopWorkerJob = (job) => call('createJob', job);
export const listDesktopWorkerJobs = () => call('listJobs');
export const processDesktopWorkerJobs = () => call('processJobs');
export const retryDesktopWorkerJob = (jobId) => call('retryJob', jobId);

export const mapWorkerAccounts = (health) => Object.fromEntries(
  (Array.isArray(health?.accounts) ? health.accounts : []).map((account) => [account.platform, account]),
);
