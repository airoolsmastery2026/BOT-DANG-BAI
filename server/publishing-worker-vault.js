'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 1;
const ALGORITHM = 'aes-256-gcm';
const PLATFORM_FIELDS = Object.freeze({
  facebook: ['accessToken', 'pageId'],
  instagram: ['accessToken', 'userId'],
  tiktok: ['accessToken'],
  linkedin: ['accessToken', 'authorUrn'],
  pinterest: ['accessToken', 'boardId'],
  youtube: ['accessToken', 'channelId'],
});

const clean = (value, max = 4000) => String(value || '').trim().slice(0, max);

function deriveKey(secret) {
  const normalized = clean(secret, 10000);
  if (normalized.length < 24) throw new Error('DHP_PUBLISHING_VAULT_KEY phải có ít nhất 24 ký tự ngẫu nhiên.');
  return crypto.createHash('sha256').update(normalized, 'utf8').digest();
}

function normalizeCredentials(platform, value) {
  const fields = PLATFORM_FIELDS[platform];
  if (!fields) throw new Error(`Nền tảng ${platform} chưa được vault hỗ trợ.`);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Credential payload không hợp lệ.');

  const normalized = Object.fromEntries(fields.map((field) => [field, clean(value[field], 4000)]));
  if (!normalized.accessToken) throw new Error(`${platform}: thiếu access token.`);
  if (platform === 'facebook' && !normalized.pageId) throw new Error('facebook: thiếu Page ID.');
  if (platform === 'instagram' && !normalized.userId) throw new Error('instagram: thiếu Business/Creator ID.');
  if (platform === 'linkedin' && !/^urn:li:(?:person:[^:]+|organization:\d+)$/i.test(normalized.authorUrn)) {
    throw new Error('linkedin: thiếu hoặc sai Author URN.');
  }
  if (platform === 'pinterest' && !/^\d+$/.test(normalized.boardId)) {
    throw new Error('pinterest: thiếu hoặc sai Board ID.');
  }
  if (platform === 'youtube' && !/^UC[A-Za-z0-9_-]{20,}$/.test(normalized.channelId)) {
    throw new Error('youtube: thiếu hoặc sai Channel ID.');
  }
  return normalized;
}

function encryptJson(value, secret) {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version: VERSION,
    algorithm: ALGORITHM,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: ciphertext.toString('base64'),
  };
}

function decryptJson(record, secret) {
  if (!record || record.version !== VERSION || record.algorithm !== ALGORITHM) {
    throw new Error('Credential vault record không tương thích.');
  }
  const key = deriveKey(secret);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(record.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(record.data, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return JSON.parse(plaintext);
}

function readVaultFile(filePath) {
  if (!fs.existsSync(filePath)) return { version: VERSION, accounts: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
      || !parsed.accounts || typeof parsed.accounts !== 'object' || Array.isArray(parsed.accounts)) {
      throw new Error('Credential vault schema không hợp lệ.');
    }
    return parsed;
  } catch (cause) {
    const error = new Error('Credential vault bị hỏng; worker từ chối ghi đè để bảo toàn dữ liệu.');
    error.code = 'VAULT_CORRUPT';
    error.cause = cause;
    throw error;
  }
}

function writeVaultFile(filePath, vault) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(vault, null, 2), { mode: 0o600 });
  fs.renameSync(tempPath, filePath);
  try { fs.chmodSync(filePath, 0o600); } catch { /* best effort on non-POSIX */ }
}

function createCredentialVault({ filePath, secret }) {
  if (!filePath) throw new Error('Credential vault thiếu filePath.');
  deriveKey(secret);

  const set = (platform, credentials) => {
    const normalized = normalizeCredentials(platform, credentials);
    const vault = readVaultFile(filePath);
    vault.accounts[platform] = {
      encrypted: encryptJson(normalized, secret),
      updatedAt: new Date().toISOString(),
      verification: { status: 'unverified', checkedAt: null, errorCode: null },
    };
    writeVaultFile(filePath, vault);
    return { platform, configured: true, updatedAt: vault.accounts[platform].updatedAt };
  };

  const get = (platform) => {
    const vault = readVaultFile(filePath);
    const entry = vault.accounts[platform];
    if (!entry?.encrypted) return null;
    return normalizeCredentials(platform, decryptJson(entry.encrypted, secret));
  };

  const remove = (platform) => {
    const vault = readVaultFile(filePath);
    const existed = Boolean(vault.accounts[platform]);
    delete vault.accounts[platform];
    writeVaultFile(filePath, vault);
    return existed;
  };

  const recordVerification = (platform, { ok, errorCode = null } = {}) => {
    const vault = readVaultFile(filePath);
    const entry = vault.accounts[platform];
    if (!entry?.encrypted) throw new Error(`${platform}: chưa có credential trong worker vault.`);
    const checkedAt = new Date().toISOString();
    entry.verification = {
      status: ok === true ? 'verified' : 'error',
      checkedAt,
      errorCode: ok === true ? null : clean(errorCode || 'VERIFY_FAILED', 120),
    };
    writeVaultFile(filePath, vault);
    return { platform, ...entry.verification };
  };

  const list = () => {
    const vault = readVaultFile(filePath);
    return Object.entries(vault.accounts).map(([platform, entry]) => ({
      platform,
      configured: Boolean(entry?.encrypted),
      updatedAt: entry?.updatedAt || null,
      verificationStatus: entry?.verification?.status || 'unverified',
      lastVerificationAttemptAt: entry?.verification?.checkedAt || null,
      lastVerifiedAt: entry?.verification?.status === 'verified' ? entry.verification.checkedAt : null,
      verificationErrorCode: entry?.verification?.status === 'error' ? entry.verification.errorCode || 'VERIFY_FAILED' : null,
    }));
  };

  return { get, list, recordVerification, remove, set };
}

module.exports = {
  PLATFORM_FIELDS,
  createCredentialVault,
  decryptJson,
  deriveKey,
  encryptJson,
  normalizeCredentials,
};
