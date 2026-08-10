'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildContentPrompt,
  extractGeminiText,
  normalizeGenerateRequest,
} = require('./ai-content-runtime');

test('normalizes AI content request and caps untrusted fields', () => {
  const input = normalizeGenerateRequest({
    topic: '  Tủ bếp veneer hiện đại  ',
    tone: 'friendly',
    length: 'short',
    hashtags: ['NoiThat', '#NoiThat', 'TuBep'],
    hashtagCount: 99,
    cta: 'Nhắn tin để tư vấn',
  });

  assert.equal(input.topic, 'Tủ bếp veneer hiện đại');
  assert.equal(input.tone, 'friendly');
  assert.equal(input.length, 'short');
  assert.deepEqual(input.hashtags, ['NoiThat', 'TuBep']);
  assert.equal(input.hashtagCount, 12);
});

test('rejects missing topic', () => {
  assert.throws(() => normalizeGenerateRequest({ topic: ' ' }), /Chủ đề/);
});

test('builds Vietnamese content prompt without requesting fabricated claims', () => {
  const prompt = buildContentPrompt(normalizeGenerateRequest({
    topic: 'Cửa cổng sắt sơn tĩnh điện',
    tone: 'neutral',
    length: 'medium',
    hashtags: ['DaiHaiPhat'],
  }));

  assert.match(prompt, /Cửa cổng sắt sơn tĩnh điện/);
  assert.match(prompt, /Không bịa đặt/);
  assert.match(prompt, /#DaiHaiPhat/);
});

test('extracts text from Gemini candidate parts', () => {
  const text = extractGeminiText({
    candidates: [{ content: { parts: [{ text: 'Dòng 1' }, { text: 'Dòng 2' }] } }],
  });
  assert.equal(text, 'Dòng 1\nDòng 2');
});

test('rejects empty Gemini candidate output', () => {
  assert.throws(() => extractGeminiText({ candidates: [] }), /không trả về nội dung/);
});
