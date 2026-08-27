import { MASTER_SKILLS, evaluateMasterSkillOutput, getMasterSkillForStage } from './master_skill_catalog';

test('master skill pack covers every AI-owned production stage with unique versioned skills', () => {
  expect(MASTER_SKILLS).toHaveLength(8);
  expect(new Set(MASTER_SKILLS.map((skill) => skill.id)).size).toBe(MASTER_SKILLS.length);
  MASTER_SKILLS.forEach((skill) => {
    expect(skill.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(skill.qualityGates.length).toBeGreaterThanOrEqual(3);
    expect(getMasterSkillForStage(skill.stageId)?.id).toBe(skill.id);
  });
});

test('scores complete copy output and permits explicit empty risk lists', () => {
  const output = {
    headline: 'Cổng sắt theo hiện trạng thực tế',
    body: 'Nội dung dựa trên dữ liệu đã xác minh.',
    cta: 'Liên hệ để khảo sát.',
    hashtags: ['#DaiHaiPhat'],
    claimsUsed: [],
    assumptions: [],
    verificationNeeded: [],
    status: 'ready',
  };
  const assessment = evaluateMasterSkillOutput('copy', output, Object.keys(output));
  expect(assessment.valid).toBe(true);
  expect(assessment.score).toBe(100);
});

test('blocks incomplete, low-score and invalid publishing outputs', () => {
  expect(evaluateMasterSkillOutput('copy', { headline: '' }, ['headline', 'body']).valid).toBe(false);
  expect(evaluateMasterSkillOutput('quality', {
    score: 70, passed: true, checks: [], requiredFixes: ['Sửa claim'], blockedClaims: [], status: 'failed',
  }, ['score', 'passed', 'checks', 'requiredFixes', 'blockedClaims', 'status']).errors)
    .toEqual(expect.arrayContaining(['QA score phải đạt tối thiểu 80.', 'Không thể passed khi vẫn còn requiredFixes.']));
  expect(evaluateMasterSkillOutput('publish', {
    jobs: [{ preflight: { passed: false } }], idempotencyKey: 'key', retryPolicy: {}, status: 'blocked',
  }, ['jobs', 'idempotencyKey', 'retryPolicy', 'status']).valid).toBe(false);
});

test('flags unverified absolute claims for human review', () => {
  const assessment = evaluateMasterSkillOutput('copy', {
    headline: 'Tốt nhất 100%', body: 'Claim', cta: 'Mua', hashtags: [], claimsUsed: [], assumptions: [], verificationNeeded: [], status: 'ready',
  }, ['headline', 'body', 'cta', 'hashtags', 'claimsUsed', 'assumptions', 'verificationNeeded', 'status']);
  expect(assessment.warnings.length).toBeGreaterThan(0);
  expect(assessment.score).toBeLessThan(100);
});
