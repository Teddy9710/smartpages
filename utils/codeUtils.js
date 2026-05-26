/**
 * 代码工具函数模块（统一版本）
 * 提供代码类型检测、函数名提取等通用功能
 */

function detectCodeType(code) {
  if (!code || typeof code !== 'string') return 'unknown';
  const value = code.trim();
  const has = pattern => pattern.test(value);
  if (has(/^\s*#\s*include\b/m) || has(/^\s*#\s*define\b/m) || has(/\bint\s+main\s*\(/)) return 'c_cpp';
  if (has(/^\s*package\s+[\w.]+\s*;/m) || has(/\bpublic\s+class\s+\w+/) || has(/\bSystem\.out\./)) return 'java';
  if (has(/<!DOCTYPE html/i) || has(/<html[\s>]/i) || has(/<\/?(div|span|section|main|body)\b/i)) return 'html';
  if (has(/^\s*(def|class)\s+\w+/m) || has(/^\s*from\s+\w[\w.]*\s+import\s+/m) || has(/^\s*import\s+\w[\w.]*/m)) return 'python';
  if (has(/^\s*interface\s+\w+/m) || has(/^\s*type\s+\w+\s*=/m) || has(/:\s*(string|number|boolean)\b/)) return 'typescript';
  if (has(/\b(function|const|let|var)\b/) || has(/=>/) || has(/\bconsole\.log\s*\(/)) return 'javascript';
  if (has(/[{};]/)) return 'general';
  return 'unknown';
}

function extractFunctionName(code) {
  if (!code || typeof code !== 'string') return 'unknown_function';

  // Java 方法名
  const javaMatch = code.match(/(?:public|private|protected)\s+\w+\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
  if (javaMatch && javaMatch[1]) return javaMatch[1];

  // Python def
  const pythonMatch = code.match(/def\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
  if (pythonMatch && pythonMatch[1]) return pythonMatch[1];

  // JavaScript function
  const funcMatch = code.match(/(?:function\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
  if (funcMatch && funcMatch[1] && funcMatch[1] !== 'if' && funcMatch[1] !== 'for' && funcMatch[1] !== 'while') {
    return funcMatch[1];
  }

  return 'unknown_function';
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { detectCodeType, extractFunctionName };
} else {
  window.CodeUtils = { detectCodeType, extractFunctionName };
}
