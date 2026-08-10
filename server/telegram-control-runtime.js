'use strict';

const ROLE_LEVEL = Object.freeze({ viewer: 1, operator: 2, admin: 3, owner: 4 });
const COMMANDS = Object.freeze({
  '/status': {
    command: 'publishing.health',
    method: 'GET',
    path: '/api/v1/publishing/health',
    minRole: 'viewer',
  },
  '/pause': {
    command: 'publishing.scheduler.pause',
    method: 'POST',
    path: '/api/v1/publishing/scheduler/pause',
    minRole: 'admin',
  },
  '/resume': {
    command: 'publishing.scheduler.resume',
    method: 'POST',
    path: '/api/v1/publishing/scheduler/resume',
    minRole: 'admin',
  },
});

const normalizeCommand = (text) => String(text || '')
  .trim()
  .split(/\s+/)[0]
  .toLowerCase()
  .replace(/@[a-z0-9_]+$/i, '');

const parseTelegramCommand = (text) => {
  const key = normalizeCommand(text);
  return COMMANDS[key] ? { ...COMMANDS[key], key } : null;
};

const isRoleAllowed = (role, command) => {
  const spec = Object.values(COMMANDS).find((item) => item.command === command);
  if (!spec) return false;
  return (ROLE_LEVEL[String(role || '').toLowerCase()] || 0) >= ROLE_LEVEL[spec.minRole];
};

const parseOperatorMap = (raw) => {
  const map = new Map();
  String(raw || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const [id, role = 'viewer'] = entry.split(':').map((value) => value.trim());
      if (/^\d+$/.test(id) && ROLE_LEVEL[role]) map.set(id, role);
    });
  return map;
};

const isPrivateChat = (message) => message?.chat?.type === 'private';

const buildCommandId = (update) => {
  const id = Number(update?.update_id);
  return Number.isSafeInteger(id) && id >= 0 ? `tg-${id}` : null;
};

module.exports = {
  COMMANDS,
  ROLE_LEVEL,
  buildCommandId,
  isPrivateChat,
  isRoleAllowed,
  parseOperatorMap,
  parseTelegramCommand,
};
