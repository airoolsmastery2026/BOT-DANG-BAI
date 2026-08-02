import {
  validateRegistryManifest,
  validateSkillDependencies,
  validateSkillMetadata,
} from './skill_validator';

const clone = (value) => JSON.parse(JSON.stringify(value));

export class SkillRegistry {
  constructor({ manifest, metadataById = {}, runtimeById = {} } = {}) {
    const manifestValidation = validateRegistryManifest(manifest);
    if (!manifestValidation.valid) {
      throw new Error(`Skill registry không hợp lệ: ${manifestValidation.errors.join(' ')}`);
    }

    this.manifest = clone(manifest);
    this.metadataById = new Map();
    this.runtimeById = new Map();

    Object.entries(metadataById).forEach(([id, metadata]) => this.registerMetadata(id, metadata));
    Object.entries(runtimeById).forEach(([id, runtime]) => this.registerRuntime(id, runtime));
  }

  registerMetadata(id, metadata) {
    if (id !== metadata?.id) throw new Error(`Skill id không khớp metadata: ${id}`);
    const validation = validateSkillMetadata(metadata);
    if (!validation.valid) {
      throw new Error(`Metadata của skill ${id} không hợp lệ: ${validation.errors.join(' ')}`);
    }

    const dependencyValidation = validateSkillDependencies(metadata, this.manifest.capabilities);
    if (!dependencyValidation.valid) {
      throw new Error(`Skill ${id} thiếu dependency: ${dependencyValidation.missing.join(', ')}`);
    }

    this.metadataById.set(id, clone(metadata));
    return this.get(id);
  }

  registerRuntime(id, runtime) {
    if (!runtime || typeof runtime.execute !== 'function') {
      throw new Error(`Runtime của skill ${id} phải cung cấp execute().`);
    }
    this.runtimeById.set(id, runtime);
    return this.get(id);
  }

  has(id) {
    return this.manifest.skills.some((skill) => skill.id === id && skill.enabled);
  }

  get(id) {
    const registration = this.manifest.skills.find((skill) => skill.id === id);
    if (!registration) return null;

    return {
      ...clone(registration),
      metadata: this.metadataById.has(id) ? clone(this.metadataById.get(id)) : null,
      runtime: this.runtimeById.get(id) || null,
      ready: Boolean(
        registration.enabled
        && this.metadataById.has(id)
        && this.runtimeById.has(id),
      ),
    };
  }

  list({ enabledOnly = true, readyOnly = false } = {}) {
    return this.manifest.skills
      .map((skill) => this.get(skill.id))
      .filter((skill) => (!enabledOnly || skill.enabled) && (!readyOnly || skill.ready));
  }

  async execute(id, input, context = {}) {
    const skill = this.get(id);
    if (!skill) throw new Error(`Không tìm thấy skill: ${id}`);
    if (!skill.enabled) throw new Error(`Skill đang bị tắt: ${id}`);
    if (!skill.metadata) throw new Error(`Skill chưa có metadata: ${id}`);
    if (!skill.runtime) throw new Error(`Skill chưa có runtime: ${id}`);

    if (typeof skill.runtime.validate === 'function') {
      const validation = await skill.runtime.validate(input, context);
      if (validation && validation.valid === false) {
        const errors = Array.isArray(validation.errors) ? validation.errors : ['Input không hợp lệ.'];
        throw new Error(`Skill ${id} từ chối input: ${errors.join(' ')}`);
      }
    }

    const timeoutMs = skill.metadata.timeoutMs;
    const maxAttempts = skill.metadata.retry.maxAttempts;
    const backoffMs = skill.metadata.retry.backoffMs;
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const execution = Promise.resolve(skill.runtime.execute(input, {
          ...context,
          skillId: id,
          skillVersion: skill.metadata.version,
          attempt,
        }));
        const timeout = new Promise((_, reject) => {
          setTimeout(() => reject(new Error(`Skill ${id} vượt quá timeout ${timeoutMs}ms.`)), timeoutMs);
        });
        return await Promise.race([execution, timeout]);
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts && backoffMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, backoffMs * attempt));
        }
      }
    }

    throw lastError || new Error(`Skill ${id} thực thi thất bại.`);
  }
}

export function createSkillRegistry(config) {
  return new SkillRegistry(config);
}
