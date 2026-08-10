import { getFromLocalStorage, saveToLocalStorage } from './utils';

export const QUEUE_RUNTIME_LOCK_KEY = 'bot_dang_bai_queue_runtime_lock';
export const DEFAULT_QUEUE_LOCK_TIMEOUT_MS = 15 * 60_000;

let activeRuntimePromise = null;

const createLockId = () => `queue_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export function getQueueRuntimeLockStatus({ now = Date.now() } = {}) {
  const lock = getFromLocalStorage(QUEUE_RUNTIME_LOCK_KEY, null);
  if (!lock || typeof lock !== 'object') return { locked: false, lock: null };
  const expiresAt = Number(lock.expiresAt || 0);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return { locked: false, lock };
  return { locked: true, lock };
}

export function acquireQueueRuntimeLock({
  now = Date.now(),
  timeoutMs = DEFAULT_QUEUE_LOCK_TIMEOUT_MS,
} = {}) {
  const safeTimeout = Math.max(Number(timeoutMs) || DEFAULT_QUEUE_LOCK_TIMEOUT_MS, 60_000);
  const current = getQueueRuntimeLockStatus({ now });
  if (current.locked) return null;

  const lock = {
    id: createLockId(),
    acquiredAt: new Date(now).toISOString(),
    expiresAt: now + safeTimeout,
  };
  saveToLocalStorage(QUEUE_RUNTIME_LOCK_KEY, lock);

  const confirmed = getFromLocalStorage(QUEUE_RUNTIME_LOCK_KEY, null);
  return confirmed?.id === lock.id ? lock : null;
}

export function releaseQueueRuntimeLock(lockId) {
  if (!lockId) return false;
  const current = getFromLocalStorage(QUEUE_RUNTIME_LOCK_KEY, null);
  if (current?.id !== lockId) return false;
  saveToLocalStorage(QUEUE_RUNTIME_LOCK_KEY, null);
  return getFromLocalStorage(QUEUE_RUNTIME_LOCK_KEY, null) === null;
}

export function withQueueRuntimeLock(task, options = {}) {
  if (activeRuntimePromise) return activeRuntimePromise;
  const lock = acquireQueueRuntimeLock(options);
  if (!lock) return Promise.resolve([]);

  activeRuntimePromise = Promise.resolve()
    .then(task)
    .finally(() => {
      releaseQueueRuntimeLock(lock.id);
      activeRuntimePromise = null;
    });

  return activeRuntimePromise;
}

export function __resetQueueRuntimeLockForTests() {
  activeRuntimePromise = null;
  saveToLocalStorage(QUEUE_RUNTIME_LOCK_KEY, null);
}
