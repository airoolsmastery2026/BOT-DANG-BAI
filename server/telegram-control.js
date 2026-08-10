'use strict';

const crypto = require('crypto');
const {
  buildCommandId,
  isPrivateChat,
  isRoleAllowed,
  parseOperatorMap,
  parseTelegramCommand,
} = require('./telegram-control-runtime');

const BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
const OPERATORS = parseOperatorMap(process.env.TELEGRAM_CONTROL_OPERATORS);
const PUBLISHING_URL = String(process.env.DHP_PUBLISHING_CONTROL_URL || 'http://127.0.0.1:8792').trim().replace(/\/$/, '');
const PUBLISHING_TOKEN = String(process.env.DHP_PUBLISHING_CONTROL_TOKEN || '').trim();
const WEBSITE_URL = String(process.env.DHP_WEBSITE_BASE_URL || '').trim().replace(/\/$/, '');
const WEBSITE_SERVICE_TOKEN = String(process.env.TELEGRAM_WEBSITE_SERVICE_TOKEN || '').trim();
const POLL_TIMEOUT_SECONDS = Math.min(Math.max(Number(process.env.TELEGRAM_POLL_TIMEOUT_SECONDS || 25), 5), 50);
const ALLOW_GROUPS = String(process.env.TELEGRAM_CONTROL_ALLOW_GROUPS || 'false').toLowerCase() === 'true';
const DROP_PENDING_ON_START = String(process.env.TELEGRAM_DROP_PENDING_ON_START || 'true').toLowerCase() !== 'false';

if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is required');
if (!PUBLISHING_TOKEN) throw new Error('DHP_PUBLISHING_CONTROL_TOKEN is required');
if (OPERATORS.size === 0) throw new Error('TELEGRAM_CONTROL_OPERATORS must contain at least one authorized numeric user ID');

let stopping = false;

const telegramApi = async (method, body, timeoutSeconds = POLL_TIMEOUT_SECONDS + 10) => {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Math.max(timeoutSeconds, 5) * 1000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    const description = String(payload.description || '').trim();
    throw new Error(description ? `Telegram ${method}: ${description}` : `Telegram ${method} failed (HTTP ${response.status})`);
  }
  return payload.result;
};

const sendMessage = (chatId, text) => telegramApi('sendMessage', {
  chat_id: chatId,
  text: String(text || '').slice(0, 4000),
});

const callPublishing = async (spec, commandId) => {
  const response = await fetch(`${PUBLISHING_URL}${spec.path}`, {
    method: spec.method,
    headers: {
      Authorization: `Bearer ${PUBLISHING_TOKEN}`,
      'X-DHP-Source-Service': 'telegram-control',
      'X-DHP-Request-Id': crypto.randomUUID(),
      ...(spec.method === 'POST' ? { 'Idempotency-Key': commandId } : {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || payload.error || `Publishing Control HTTP ${response.status}`);
  }
  return payload.data;
};

const writeAudit = async ({ commandId, operatorId, operatorRole, command, status }) => {
  if (!WEBSITE_URL || !WEBSITE_SERVICE_TOKEN) return false;
  const response = await fetch(`${WEBSITE_URL}/api/v1/audit/control-commands`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WEBSITE_SERVICE_TOKEN}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': commandId,
      'X-DHP-Request-Id': crypto.randomUUID(),
      'X-DHP-Source-Service': 'telegram-control',
    },
    body: JSON.stringify({
      eventType: 'control.command.executed',
      commandId,
      operatorId,
      operatorRole,
      targetService: 'publishing-bot',
      command,
      status,
      occurredAt: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok && response.status !== 409) throw new Error(`Website audit HTTP ${response.status}`);
  return true;
};

const formatResult = (spec, data) => {
  if (spec.command === 'publishing.health') {
    return [
      `Publishing Bot: ${data?.status || 'unknown'}`,
      `Scheduler: ${data?.scheduler?.paused ? 'PAUSED' : 'RUNNING'}`,
      data?.scheduler?.updatedAt ? `Updated: ${data.scheduler.updatedAt}` : null,
    ].filter(Boolean).join('\n');
  }
  return data?.paused ? 'Đã tạm dừng đăng LIVE.' : 'Đã tiếp tục đăng LIVE.';
};

const handleUpdate = async (update) => {
  const message = update?.message;
  const text = message?.text;
  const chatId = message?.chat?.id;
  const operatorId = message?.from?.id ? String(message.from.id) : '';
  if (!text || !chatId || !operatorId) return;
  if (!ALLOW_GROUPS && !isPrivateChat(message)) return;

  const spec = parseTelegramCommand(text);
  if (!spec) return;

  const commandId = buildCommandId(update);
  if (!commandId) return;

  const role = OPERATORS.get(operatorId);
  if (!role) {
    await sendMessage(chatId, 'Tài khoản này chưa được cấp quyền điều khiển Đại Hải Phát.');
    return;
  }

  if (!isRoleAllowed(role, spec.command)) {
    try {
      await writeAudit({ commandId, operatorId, operatorRole: role, command: spec.command, status: 'rejected' });
    } catch (error) {
      console.warn('Telegram audit rejected-command failed:', error instanceof Error ? error.message : String(error));
    }
    await sendMessage(chatId, `Quyền ${role} không được phép thực hiện lệnh này.`);
    return;
  }

  try {
    const data = await callPublishing(spec, commandId);
    try {
      await writeAudit({ commandId, operatorId, operatorRole: role, command: spec.command, status: 'completed' });
    } catch (error) {
      console.warn('Telegram audit completed-command failed:', error instanceof Error ? error.message : String(error));
    }
    await sendMessage(chatId, formatResult(spec, data));
  } catch (error) {
    try {
      await writeAudit({ commandId, operatorId, operatorRole: role, command: spec.command, status: 'failed' });
    } catch (auditError) {
      console.warn('Telegram audit failed-command failed:', auditError instanceof Error ? auditError.message : String(auditError));
    }
    await sendMessage(chatId, `Lệnh thất bại: ${error instanceof Error ? error.message : 'không rõ lỗi'}`);
  }
};

const getInitialOffset = async () => {
  if (!DROP_PENDING_ON_START) return 0;
  const updates = await telegramApi('getUpdates', {
    offset: -1,
    limit: 1,
    timeout: 0,
    allowed_updates: ['message'],
  }, 10);
  const last = Array.isArray(updates) ? updates.at(-1) : null;
  return Number.isSafeInteger(Number(last?.update_id)) ? Number(last.update_id) + 1 : 0;
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const run = async () => {
  let offset = await getInitialOffset();
  let failureCount = 0;
  console.log(`Telegram Control started with ${OPERATORS.size} authorized operator(s).`);

  while (!stopping) {
    try {
      const updates = await telegramApi('getUpdates', {
        offset,
        timeout: POLL_TIMEOUT_SECONDS,
        allowed_updates: ['message'],
      });
      failureCount = 0;
      for (const update of Array.isArray(updates) ? updates : []) {
        offset = Math.max(offset, Number(update.update_id || 0) + 1);
        await handleUpdate(update);
      }
    } catch (error) {
      failureCount += 1;
      const delayMs = Math.min(30_000, 1000 * (2 ** Math.min(failureCount, 5)));
      console.warn('Telegram Control polling failed:', error instanceof Error ? error.message : String(error));
      await wait(delayMs);
    }
  }
};

const shutdown = (signal) => {
  if (stopping) return;
  stopping = true;
  console.log(`Telegram Control stopping (${signal})...`);
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

void run().catch((error) => {
  console.error('Telegram Control fatal error:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
