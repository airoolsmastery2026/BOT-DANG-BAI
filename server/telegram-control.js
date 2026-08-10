const crypto = require('crypto');
const { parseTelegramCommand, isRoleAllowed, parseOperatorMap } = require('./telegram-control-runtime');

const BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
const OPERATORS = parseOperatorMap(process.env.TELEGRAM_CONTROL_OPERATORS);
const PUBLISHING_URL = String(process.env.DHP_PUBLISHING_CONTROL_URL || 'http://127.0.0.1:8792').replace(/\/$/, '');
const PUBLISHING_TOKEN = String(process.env.DHP_PUBLISHING_CONTROL_TOKEN || process.env.DHP_MEDIA_INGRESS_TOKEN || '').trim();
const WEBSITE_URL = String(process.env.DHP_WEBSITE_BASE_URL || '').replace(/\/$/, '');
const WEBSITE_SERVICE_TOKEN = String(process.env.TELEGRAM_WEBSITE_SERVICE_TOKEN || '').trim();
const POLL_TIMEOUT_SECONDS = Math.min(Math.max(Number(process.env.TELEGRAM_POLL_TIMEOUT_SECONDS || 25), 5), 50);

if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is required');
if (!PUBLISHING_TOKEN) throw new Error('DHP_PUBLISHING_CONTROL_TOKEN (or DHP_MEDIA_INGRESS_TOKEN) is required');

const telegramApi = async (method, body) => {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout((POLL_TIMEOUT_SECONDS + 10) * 1000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) throw new Error(`Telegram ${method} failed`);
  return payload.result;
};

const sendMessage = (chatId, text) => telegramApi('sendMessage', { chat_id: chatId, text });

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
  if (!response.ok) throw new Error(payload.error?.message || payload.error || `Publishing Control HTTP ${response.status}`);
  return payload.data;
};

const writeAudit = async ({ commandId, operatorId, operatorRole, command, status }) => {
  if (!WEBSITE_URL || !WEBSITE_SERVICE_TOKEN) return;
  await fetch(`${WEBSITE_URL}/api/v1/audit/control-commands`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WEBSITE_SERVICE_TOKEN}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': commandId,
      'X-DHP-Request-Id': crypto.randomUUID(),
      'X-DHP-Source-Service': 'telegram-control',
    },
    body: JSON.stringify({
      commandId,
      operatorId,
      operatorRole,
      targetService: 'publishing-bot',
      command,
      status,
      occurredAt: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
};

const formatResult = (spec, data) => {
  if (spec.command === 'publishing.health') {
    return `Publishing Bot: ${data?.status || 'unknown'}\nScheduler: ${data?.scheduler?.paused ? 'PAUSED' : 'RUNNING'}`;
  }
  return data?.paused ? 'Đã tạm dừng đăng LIVE.' : 'Đã tiếp tục đăng LIVE.';
};

const handleUpdate = async (update) => {
  const message = update?.message;
  const text = message?.text;
  const chatId = message?.chat?.id;
  const operatorId = message?.from?.id ? String(message.from.id) : '';
  if (!text || !chatId || !operatorId) return;

  const spec = parseTelegramCommand(text);
  if (!spec) return;
  const role = OPERATORS.get(operatorId);
  if (!role) {
    await sendMessage(chatId, 'Tài khoản này chưa được cấp quyền điều khiển Đại Hải Phát.');
    return;
  }

  const commandId = `tg-${update.update_id}`;
  if (!isRoleAllowed(role, spec.command)) {
    await writeAudit({ commandId, operatorId, operatorRole: role, command: spec.command, status: 'rejected' });
    await sendMessage(chatId, `Quyền ${role} không được phép thực hiện lệnh này.`);
    return;
  }

  try {
    const data = await callPublishing(spec, commandId);
    await writeAudit({ commandId, operatorId, operatorRole: role, command: spec.command, status: 'completed' });
    await sendMessage(chatId, formatResult(spec, data));
  } catch (error) {
    await writeAudit({ commandId, operatorId, operatorRole: role, command: spec.command, status: 'failed' });
    await sendMessage(chatId, `Lệnh thất bại: ${error instanceof Error ? error.message : 'không rõ lỗi'}`);
  }
};

const run = async () => {
  let offset = 0;
  console.log(`Telegram Control started with ${OPERATORS.size} authorized operator(s).`);
  while (true) {
    try {
      const updates = await telegramApi('getUpdates', {
        offset,
        timeout: POLL_TIMEOUT_SECONDS,
        allowed_updates: ['message'],
      });
      for (const update of Array.isArray(updates) ? updates : []) {
        offset = Math.max(offset, Number(update.update_id || 0) + 1);
        await handleUpdate(update);
      }
    } catch (error) {
      console.warn('Telegram Control polling failed:', error instanceof Error ? error.message : String(error));
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
};

void run();
