const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SKILL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function validateSkillMetadata(metadata) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(metadata)) {
    return { valid: false, errors: ['Skill metadata phải là một object.'], warnings };
  }

  if (!SKILL_ID_PATTERN.test(String(metadata.id || ''))) {
    errors.push('Skill id phải dùng kebab-case và không được để trống.');
  }
  if (!String(metadata.name || '').trim()) errors.push('Skill name không được để trống.');
  if (!SEMVER_PATTERN.test(String(metadata.version || ''))) {
    errors.push('Skill version phải theo semantic versioning, ví dụ 1.0.0.');
  }
  if (!String(metadata.category || '').trim()) errors.push('Skill category không được để trống.');
  if (!String(metadata.description || '').trim()) errors.push('Skill description không được để trống.');
  if (!String(metadata.entrypoint || '').trim()) errors.push('Skill entrypoint không được để trống.');

  if (!Array.isArray(metadata.dependencies)) {
    errors.push('Skill dependencies phải là một mảng.');
  } else {
    const invalidDependency = metadata.dependencies.find((item) => !SKILL_ID_PATTERN.test(String(item || '')));
    if (invalidDependency) errors.push(`Dependency không hợp lệ: ${invalidDependency}`);
    if (new Set(metadata.dependencies).size !== metadata.dependencies.length) {
      errors.push('Skill dependencies không được trùng lặp.');
    }
    if (metadata.dependencies.includes(metadata.id)) errors.push('Skill không được phụ thuộc vào chính nó.');
  }

  if (!Number.isFinite(metadata.timeoutMs) || metadata.timeoutMs <= 0) {
    errors.push('Skill timeoutMs phải là số dương.');
  } else if (metadata.timeoutMs > 300000) {
    warnings.push('Skill timeoutMs lớn hơn 5 phút; cần xác nhận đây là chủ ý.');
  }

  if (!isPlainObject(metadata.retry)) {
    errors.push('Skill retry phải là một object.');
  } else {
    if (!Number.isInteger(metadata.retry.maxAttempts) || metadata.retry.maxAttempts < 1) {
      errors.push('retry.maxAttempts phải là số nguyên từ 1 trở lên.');
    }
    if (!Number.isFinite(metadata.retry.backoffMs) || metadata.retry.backoffMs < 0) {
      errors.push('retry.backoffMs phải là số không âm.');
    }
  }

  if (!Array.isArray(metadata.context) || metadata.context.length === 0) {
    warnings.push('Skill chưa khai báo context files.');
  }
  if (!String(metadata.inputSchema || '').trim()) errors.push('Skill inputSchema không được để trống.');
  if (!String(metadata.outputSchema || '').trim()) errors.push('Skill outputSchema không được để trống.');

  return { valid: errors.length === 0, errors, warnings };
}

export function validateRegistryManifest(manifest) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(manifest)) {
    return { valid: false, errors: ['Skill registry manifest phải là một object.'], warnings };
  }

  if (!SEMVER_PATTERN.test(String(manifest.schemaVersion || ''))) {
    errors.push('Registry schemaVersion phải theo semantic versioning.');
  }
  if (!Array.isArray(manifest.skills)) errors.push('Registry skills phải là một mảng.');
  if (!Array.isArray(manifest.capabilities)) errors.push('Registry capabilities phải là một mảng.');

  if (Array.isArray(manifest.skills)) {
    const ids = manifest.skills.map((skill) => skill?.id).filter(Boolean);
    if (new Set(ids).size !== ids.length) errors.push('Registry không được có skill id trùng lặp.');

    manifest.skills.forEach((skill, index) => {
      if (!isPlainObject(skill)) {
        errors.push(`Skill registry tại vị trí ${index} không hợp lệ.`);
        return;
      }
      if (!SKILL_ID_PATTERN.test(String(skill.id || ''))) errors.push(`Skill id không hợp lệ tại vị trí ${index}.`);
      if (!SEMVER_PATTERN.test(String(skill.version || ''))) errors.push(`Skill version không hợp lệ: ${skill.id || index}.`);
      if (typeof skill.enabled !== 'boolean') errors.push(`Skill enabled phải là boolean: ${skill.id || index}.`);
      if (!String(skill.packagePath || '').trim()) errors.push(`Skill packagePath bị thiếu: ${skill.id || index}.`);
      if (!String(skill.metadataPath || '').trim()) errors.push(`Skill metadataPath bị thiếu: ${skill.id || index}.`);
      if (!String(skill.runtimeEntrypoint || '').trim()) errors.push(`Skill runtimeEntrypoint bị thiếu: ${skill.id || index}.`);
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function validateSkillDependencies(metadata, availableCapabilities = []) {
  const dependencies = Array.isArray(metadata?.dependencies) ? metadata.dependencies : [];
  const available = new Set(Array.isArray(availableCapabilities) ? availableCapabilities : []);
  const missing = dependencies.filter((dependency) => !available.has(dependency));

  return {
    valid: missing.length === 0,
    missing,
    errors: missing.map((dependency) => `Thiếu capability bắt buộc: ${dependency}`),
  };
}
