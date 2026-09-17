/**
 * SmartPages generation template helpers.
 * Templates intentionally contain document-generation preferences only and
 * never include model credentials or provider settings.
 */

const GENERATION_TEMPLATES_STORAGE_KEY = 'generationTemplates';
const DEFAULT_GENERATION_TEMPLATE_STORAGE_KEY = 'defaultGenerationTemplateId';
const ACTIVE_GENERATION_TEMPLATE_STORAGE_KEY = 'activeGenerationTemplateId';

const BUILT_IN_GENERATION_TEMPLATES = Object.freeze([
  {
    id: 'builtin-user-guide',
    name: '用户指南',
    nameEn: 'User Guide',
    builtIn: true,
    settings: {
      promptMode: 'append',
      promptAppend: '面向非技术用户，使用清晰的步骤标题，说明每一步的操作目标、具体动作和页面反馈，并补充必要的注意事项。',
      customPrompt: '',
      styleGuide: '语言专业、简洁；步骤使用动宾短语；保留所有截图；避免内部术语，必须使用时给出解释。',
      outputFormat: 'markdown',
      documentExamples: {}
    }
  },
  {
    id: 'builtin-test-case',
    name: '测试用例',
    nameEn: 'Test Case',
    builtIn: true,
    settings: {
      promptMode: 'append',
      promptAppend: '将录制过程整理为可执行的测试用例，明确前置条件、测试步骤、测试数据、预期结果和实际页面反馈。',
      customPrompt: '',
      styleGuide: '使用结构化、可验证的表达；每一步只包含一个主要动作；预期结果必须具体且可观察。',
      outputFormat: 'markdown',
      documentExamples: {}
    }
  },
  {
    id: 'builtin-bug-report',
    name: 'Bug 报告',
    nameEn: 'Bug Report',
    builtIn: true,
    settings: {
      promptMode: 'append',
      promptAppend: '根据录制内容生成问题报告，包含问题摘要、环境、前置条件、复现步骤、实际结果、预期结果和截图证据。不要推测录制中没有的信息。',
      customPrompt: '',
      styleGuide: '语气客观、准确；突出最短复现路径；区分事实与推测；保留所有相关截图。',
      outputFormat: 'markdown',
      documentExamples: {}
    }
  }
]);

function normalizeGenerationTemplateSettings(settings = {}) {
  const promptMode = settings.promptMode === 'custom' ? 'custom' : 'append';
  const outputFormat = ['markdown', 'html', 'text'].includes(settings.outputFormat)
    ? settings.outputFormat
    : 'markdown';
  const examples = settings.documentExamples && typeof settings.documentExamples === 'object'
    ? settings.documentExamples
    : {};

  return {
    promptMode,
    promptAppend: String(settings.promptAppend || ''),
    customPrompt: String(settings.customPrompt || ''),
    styleGuide: String(settings.styleGuide || ''),
    outputFormat,
    documentExamples: Object.fromEntries(
      Object.entries(examples)
        .filter(([key, value]) => ['user-guide', 'tutorial', 'testing', 'bug-report'].includes(key) && typeof value === 'string')
        .map(([key, value]) => [key, value])
    )
  };
}

function createGenerationTemplate(name, settings, existingTemplates = []) {
  const normalizedName = String(name || '').trim();
  if (!normalizedName) throw new Error('Template name is required');
  if (normalizedName.length > 60) throw new Error('Template name must be 60 characters or fewer');
  const duplicate = existingTemplates.some(template => (
    [template.name, template.nameEn]
      .filter(Boolean)
      .some(candidate => candidate.toLowerCase() === normalizedName.toLowerCase())
  ));
  if (duplicate) throw new Error('A template with this name already exists');

  return {
    id: `template-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: normalizedName,
    builtIn: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    settings: normalizeGenerationTemplateSettings(settings)
  };
}

function normalizeCustomGenerationTemplates(rawTemplates) {
  if (!Array.isArray(rawTemplates)) return [];
  const seen = new Set(BUILT_IN_GENERATION_TEMPLATES.map(template => template.id));
  return rawTemplates.reduce((templates, raw) => {
    const id = String(raw?.id || '').trim();
    const name = String(raw?.name || '').trim();
    if (!id || !name || seen.has(id)) return templates;
    seen.add(id);
    templates.push({
      id,
      name: name.slice(0, 60),
      builtIn: false,
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
      settings: normalizeGenerationTemplateSettings(raw.settings)
    });
    return templates;
  }, []);
}

function getGenerationTemplateLibrary(customTemplates = []) {
  return [
    ...BUILT_IN_GENERATION_TEMPLATES.map(template => ({
      ...template,
      settings: normalizeGenerationTemplateSettings(template.settings)
    })),
    ...normalizeCustomGenerationTemplates(customTemplates)
  ];
}

function duplicateGenerationTemplate(template, name, existingTemplates = []) {
  if (!template) throw new Error('Template not found');
  return createGenerationTemplate(name, template.settings, existingTemplates);
}

function renameGenerationTemplate(template, name, existingTemplates = []) {
  if (!template || template.builtIn) throw new Error('Built-in templates cannot be renamed');
  const normalizedName = String(name || '').trim();
  if (!normalizedName) throw new Error('Template name is required');
  if (normalizedName.length > 60) throw new Error('Template name must be 60 characters or fewer');
  const duplicate = existingTemplates.some(item => item.id !== template.id && (
    [item.name, item.nameEn]
      .filter(Boolean)
      .some(candidate => candidate.toLowerCase() === normalizedName.toLowerCase())
  ));
  if (duplicate) throw new Error('A template with this name already exists');
  return { ...template, name: normalizedName, updatedAt: new Date().toISOString() };
}

const generationTemplatesApi = {
  GENERATION_TEMPLATES_STORAGE_KEY,
  DEFAULT_GENERATION_TEMPLATE_STORAGE_KEY,
  ACTIVE_GENERATION_TEMPLATE_STORAGE_KEY,
  BUILT_IN_GENERATION_TEMPLATES,
  normalizeGenerationTemplateSettings,
  normalizeCustomGenerationTemplates,
  getGenerationTemplateLibrary,
  createGenerationTemplate,
  duplicateGenerationTemplate,
  renameGenerationTemplate
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = generationTemplatesApi;
} else {
  globalThis.GenerationTemplates = generationTemplatesApi;
}
