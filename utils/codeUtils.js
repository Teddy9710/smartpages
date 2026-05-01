/**
 * 代码工具函数模块（统一版本）
 * 提供代码类型检测、函数名提取等通用功能
 */

function detectCodeType(code) {
  if (!code || typeof code !== 'string') return 'unknown';
  if (code.includes('#include') || code.includes('#define') || code.includes('int main')) return 'c_cpp';
  if (code.includes('public class') || code.includes('private') || code.includes('protected')) return 'java';
  if (code.includes('<!DOCTYPE html>') || code.includes('<html>') || code.includes('<div')) return 'html';
  if (code.includes('def ') || code.includes('import ') && code.includes('from ')) return 'python';
  if (code.includes('function') || code.includes('const ') || code.includes('let ') || code.includes('var ')) return 'javascript';
  if (code.includes('{') && code.includes('}')) return 'general';
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
