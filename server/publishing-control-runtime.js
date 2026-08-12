const fs = require('fs');
const path = require('path');

const DEFAULT_STATE = Object.freeze({ paused: false, updatedAt: null, updatedBy: null, lastCommandId: null });
const normalizeText = (value, maxLength = 160) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, maxLength) : null;
};
const normalizeState = (value) => (!value || typeof value !== 'object' || Array.isArray(value)) ? { ...DEFAULT_STATE } : ({
  paused: value.paused === true,
  updatedAt: normalizeText(value.updatedAt, 64),
  updatedBy: normalizeText(value.updatedBy),
  lastCommandId: normalizeText(value.lastCommandId),
});

const corruptStateError = (cause) => {
  const error = new Error('Publishing control state bị hỏng; scheduler từ chối chạy để tránh đăng ngoài ý muốn.');
  error.code = 'CONTROL_STATE_CORRUPT';
  error.cause = cause;
  return error;
};

const createPublishingControlRuntime = ({ statePath }) => {
  if (!statePath) throw new Error('statePath is required');
  const read = () => {
    if (!fs.existsSync(statePath)) return { ...DEFAULT_STATE };
    try {
      const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || typeof parsed.paused !== 'boolean') {
        throw new Error('Publishing control state schema không hợp lệ.');
      }
      return normalizeState(parsed);
    } catch (cause) {
      if (cause?.code === 'CONTROL_STATE_CORRUPT') throw cause;
      throw corruptStateError(cause);
    }
  };
  const write = (state) => {
    if (fs.existsSync(statePath)) read();
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    const temporary = `${statePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(normalizeState(state), null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, statePath);
    return read();
  };
  const transition = (paused, context = {}) => write({
    paused,
    updatedAt: new Date().toISOString(),
    updatedBy: normalizeText(context.actor) || 'publishing-control',
    lastCommandId: normalizeText(context.commandId),
  });
  return { getState: read, pause: (context) => transition(true, context), resume: (context) => transition(false, context) };
};

module.exports = { createPublishingControlRuntime };
