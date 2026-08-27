import { buildAgentInstruction } from './ai_agent_contracts';
import { MASTER_SKILLS, evaluateMasterSkillOutput, getMasterSkillForStage } from './master_skill_catalog';

export const masterContentSkillMetadata = Object.freeze({
  id: 'dhp-master-content-system',
  name: 'DHP Master Content System',
  version: '1.0.0',
  category: 'orchestration',
  description: 'Master skill pack cho chuỗi sản xuất nội dung có evidence gate, QA và human approval.',
  entrypoint: 'src/master_content_skill_runtime.js',
  dependencies: ['master-skill-router', 'evidence-gate', 'quality-scorer', 'human-approval-gate'],
  timeoutMs: 5000,
  retry: { maxAttempts: 1, backoffMs: 0 },
  context: ['skills/dhp-master-content-system/references/quality-gates.md'],
  inputSchema: 'input.schema.json',
  outputSchema: 'output.schema.json',
});

export const masterContentSkillRuntime = Object.freeze({
  validate(input) {
    const errors = [];
    if (!getMasterSkillForStage(input?.stageId)) errors.push('stageId không thuộc Master Skill Pack.');
    if (!input?.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) errors.push('payload phải là object.');
    return { valid: errors.length === 0, errors };
  },

  execute(input) {
    const masterSkill = getMasterSkillForStage(input.stageId);
    const instruction = buildAgentInstruction(input.stageId, input.payload);
    const requiredKeys = Object.keys(instruction.outputSchema || {});
    return {
      stageId: input.stageId,
      masterSkill,
      instruction,
      assessment: input.output
        ? evaluateMasterSkillOutput(input.stageId, input.output, requiredKeys)
        : null,
    };
  },
});

export const getMasterContentSkillSummary = () => ({
  id: masterContentSkillMetadata.id,
  version: masterContentSkillMetadata.version,
  ready: true,
  skills: MASTER_SKILLS,
});
