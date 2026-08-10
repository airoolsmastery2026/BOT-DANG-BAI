import {
  QUEUE_RUNTIME_LOCK_KEY,
  __resetQueueRuntimeLockForTests,
  acquireQueueRuntimeLock,
  getQueueRuntimeLockStatus,
  releaseQueueRuntimeLock,
  withQueueRuntimeLock,
} from './queue_runtime_lock';

jest.mock('./utils', () => {
  let store = {};
  return {
    saveToLocalStorage: (key, value) => { store[key] = value; return true; },
    getFromLocalStorage: (key, fallback) => store[key] ?? fallback,
    __resetStorage: () => { store = {}; },
    __setStorage: (key, value) => { store[key] = value; },
  };
});

const utils = require('./utils');

beforeEach(() => {
  utils.__resetStorage();
  __resetQueueRuntimeLockForTests();
});

describe('queue runtime lock', () => {
  test('acquires and releases a runtime lock', () => {
    const now = new Date('2026-08-10T01:00:00.000Z').getTime();
    const lock = acquireQueueRuntimeLock({ now, timeoutMs: 60_000 });
    expect(lock).toBeTruthy();
    expect(getQueueRuntimeLockStatus({ now }).locked).toBe(true);
    expect(releaseQueueRuntimeLock(lock.id)).toBe(true);
    expect(getQueueRuntimeLockStatus({ now }).locked).toBe(false);
  });

  test('does not acquire a second live lock', () => {
    const now = Date.now();
    const first = acquireQueueRuntimeLock({ now, timeoutMs: 60_000 });
    const second = acquireQueueRuntimeLock({ now: now + 1_000, timeoutMs: 60_000 });
    expect(first).toBeTruthy();
    expect(second).toBeNull();
  });

  test('replaces an expired lock', () => {
    const now = Date.now();
    utils.__setStorage(QUEUE_RUNTIME_LOCK_KEY, {
      id: 'expired',
      acquiredAt: new Date(now - 120_000).toISOString(),
      expiresAt: now - 1,
    });
    const lock = acquireQueueRuntimeLock({ now, timeoutMs: 60_000 });
    expect(lock).toBeTruthy();
    expect(lock.id).not.toBe('expired');
  });

  test('shares one in-flight promise for concurrent callers', async () => {
    let runs = 0;
    let release;
    const task = () => {
      runs += 1;
      return new Promise((resolve) => { release = resolve; });
    };

    const first = withQueueRuntimeLock(task);
    const second = withQueueRuntimeLock(task);
    await Promise.resolve();
    expect(runs).toBe(1);
    release(['done']);
    await expect(first).resolves.toEqual(['done']);
    await expect(second).resolves.toEqual(['done']);
    expect(runs).toBe(1);
  });
});
