import { masterContentSkillMetadata, masterContentSkillRuntime } from './master_content_skill_runtime';
import { validateSkillMetadata } from './skill_validator';

test('master content runtime metadata is registry-compatible', () => {
  expect(validateSkillMetadata(masterContentSkillMetadata)).toMatchObject({ valid: true, errors: [] });
});

test('master content runtime builds a stage instruction with quality gates', () => {
  const result = masterContentSkillRuntime.execute({
    stageId: 'strategy',
    payload: { campaign: { topic: 'Cửa cổng sắt' } },
  });
  expect(result.masterSkill.id).toBe('master-strategy-architect');
  expect(result.instruction.qualityGates.length).toBeGreaterThan(0);
  expect(result.assessment).toBeNull();
});

test('master content runtime validates stage and can assess supplied output', () => {
  expect(masterContentSkillRuntime.validate({ stageId: 'unknown', payload: {} }).valid).toBe(false);
  const result = masterContentSkillRuntime.execute({
    stageId: 'analytics',
    payload: {},
    output: {
      summary: 'Kết quả', kpiResults: [], winningPatterns: [], weakPatterns: [], experiments: [], brandMemoryUpdates: [], status: 'complete',
    },
  });
  expect(result.assessment.valid).toBe(true);
});
