'use strict';

// Prefer the canonical ecosystem service secret while preserving the legacy
// Telegram-specific variable for existing deployments.
if (!String(process.env.TELEGRAM_WEBSITE_SERVICE_TOKEN || '').trim()) {
  process.env.TELEGRAM_WEBSITE_SERVICE_TOKEN = String(
    process.env.ECOSYSTEM_SERVICE_API_KEY || '',
  ).trim();
}

require('./telegram-control');
