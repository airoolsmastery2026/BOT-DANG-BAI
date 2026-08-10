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

const createPublishingControlRuntime = ({ statePath }) => {
  if (!statePath) throw new Error('statePath is required');
  const read = () => {
    try {
      if (!fs.existsSync(statePath)) return { ...DEFAULT_STATE };
      return normalizeState(JSON.parse(fs.readFileSync(statePath, 'utf8')));
    } catch { return { ...DEFAULT_STATE }; }
  };
  const write = (state) => {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    const temporary = `${statePath}.tmp`;
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
