'use strict';

const fs = require('fs');
const path = require('path');
const { campaignWorkflowToWorkerJobs } = require('./campaign-to-worker');

const WORKER_URL = String(process.env.DHP_PUBLISHING_WORKER_URL || 'http://127.0.0.1:8794').trim().replace(/\/$/, '');
const WORKER_TOKEN = String(process.env.DHP_PUBLISHING_WORKER_TOKEN || '').trim();

const readWorkflow = (filePath) => {
  const absolute = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absolute)) throw new Error(`Không tìm thấy file: ${absolute}`);
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
};

const submitJob = async (job) => {
  const response = await fetch(`${WORKER_URL}/v1/jobs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WORKER_TOKEN}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': job.idempotencyKey,
    },
    body: JSON.stringify(job),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 409) {
    return {
      status: 'duplicate',
      existingJobId: body.existingJobId || null,
    };
  }
  if (!response.ok) throw new Error(body.error || `Worker HTTP ${response.status}`);
  return { status: 'created', job: body.data };
};

async function main() {
  const filePath = process.argv[2];
  if (!filePath) throw new Error('Cách dùng: node scripts/publishing/import-campaign.js <campaign.json>');
  if (!WORKER_TOKEN) throw new Error('DHP_PUBLISHING_WORKER_TOKEN chưa được cấu hình trong môi trường chạy CLI.');

  const workflow = readWorkflow(filePath);
  const batch = campaignWorkflowToWorkerJobs(workflow);
  const created = [];
  const duplicates = [];
  const failures = [];

  for (const job of batch.jobs) {
    try {
      const result = await submitJob(job);
      if (result.status === 'duplicate') duplicates.push({ job, existingJobId: result.existingJobId });
      else created.push(result.job);
    } catch (error) {
      failures.push({
        platform: job.platforms[0],
        scheduledTime: job.scheduledTime,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const summary = {
    campaignId: batch.campaignId,
    requested: batch.jobs.length,
    created: created.length,
    duplicates: duplicates.length,
    failed: failures.length,
    skippedPlatforms: batch.skippedPlatforms,
    failures,
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (failures.length) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
