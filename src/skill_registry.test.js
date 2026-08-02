import { SkillRegistry } from './skill_registry';
import {
  validateRegistryManifest,
  validateSkillDependencies,
  validateSkillMetadata,
} from './skill_validator';

const manifest = {
  schemaVersion: '1.0.0',
  updatedAt: '2026-08-02T03:12:00.000Z',
  skills: [{
    id: 'one-click-campaign',
    version: '1.0.0',
    enabled: true,
    packagePath: 'skills/one-click-campaign',
    metadataPath: 'skills/one-click-campaign/metadata.json',
    runtimeEntrypoint: 'src/campaign_orchestrator.js',
  }],
  capabilities: ['campaign-planner', 'campaign-storage'],
};

const metadata = {
  id: 'one-click-campaign',
  name: 'One-Click Campaign',
  version: '1.0.0',
  category: 'orchestration',
  description: 'Điều phối chiến dịch.',
  entrypoint: 'src/campaign_orchestrator.js',
  dependencies: ['campaign-planner', 'campaign-storage'],
  timeoutMs: 1000,
  retry: { maxAttempts: 2, backoffMs: 0 },
  context: ['skills/context/brand-guideline.md'],
  inputSchema: 'input.schema.json',
  outputSchema: 'output.schema.json',
};

describe('skill validator', () => {
  test('accepts valid metadata and registry manifest', () => {
    expect(validateSkillMetadata(metadata).valid).toBe(true);
    expect(validateRegistryManifest(manifest).valid).toBe(true);
  });

  test('rejects malformed metadata and missing dependencies', () => {
    const invalid = validateSkillMetadata({ ...metadata, id: 'Bad ID', version: 'v1' });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.length).toBeGreaterThan(0);

    const dependencies = validateSkillDependencies(metadata, ['campaign-planner']);
    expect(dependencies.valid).toBe(false);
    expect(dependencies.missing).toEqual(['campaign-storage']);
  });
});

describe('skill registry', () => {
  test('registers metadata and runtime then executes a ready skill', async () => {
    const registry = new SkillRegistry({
      manifest,
      metadataById: { 'one-click-campaign': metadata },
      runtimeById: {
        'one-click-campaign': {
          validate: (input) => ({ valid: Boolean(input.command), errors: ['Thiếu command.'] }),
          execute: async (input, context) => ({ command: input.command, attempt: context.attempt }),
        },
      },
    });

    expect(registry.get('one-click-campaign').ready).toBe(true);
    await expect(registry.execute('one-click-campaign', { command: 'Tạo chiến dịch' }))
      .resolves.toEqual({ command: 'Tạo chiến dịch', attempt: 1 });
  });

  test('blocks invalid input before execute', async () => {
    const execute = jest.fn();
    const registry = new SkillRegistry({
      manifest,
      metadataById: { 'one-click-campaign': metadata },
      runtimeById: {
        'one-click-campaign': {
          validate: () => ({ valid: false, errors: ['Thiếu command.'] }),
          execute,
        },
      },
    });

    await expect(registry.execute('one-click-campaign', {})).rejects.toThrow('Thiếu command');
    expect(execute).not.toHaveBeenCalled();
  });

  test('retries a failed execution according to metadata policy', async () => {
    const execute = jest.fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({ ok: true });
    const registry = new SkillRegistry({
      manifest,
      metadataById: { 'one-click-campaign': metadata },
      runtimeById: { 'one-click-campaign': { execute } },
    });

    await expect(registry.execute('one-click-campaign', { command: 'x' })).resolves.toEqual({ ok: true });
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
