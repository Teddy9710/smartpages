#!/usr/bin/env node

/**
 * Smart Page Scribe - Validation Script
 * Checks for syntax errors and common issues in all JavaScript files
 */

const fs = require('fs');
const path = require('path');

const filesToCheck = [
  'background/background.js',
  'content/recorder.js',
  'popup/popup.js',
  'sidepanel/sidepanel.js',
  'settings/settings.js'
];

const issues = [];

console.log('🔍 Validating Smart Page Scribe extension files...\n');

filesToCheck.forEach(filePath => {
  const fullPath = path.join(__dirname, filePath);

  if (!fs.existsSync(fullPath)) {
    issues.push(`❌ ${filePath}: File not found`);
    return;
  }

  try {
    const content = fs.readFileSync(fullPath, 'utf-8');

    // Check for syntax errors
    try {
      // Basic syntax check by wrapping in function
      new Function(content);
      console.log(`✅ ${filePath}: No syntax errors`);
    } catch (error) {
      issues.push(`❌ ${filePath}: Syntax error - ${error.message}`);
    }

    // Check for common issues
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const lineNum = index + 1;

      // Check for console.log that should be removed in production
      const hasPrefix = line.includes('[Smart Page Scribe]') ||
                       line.includes('[SidePanel]') ||
                       line.includes('[Popup]') ||
                       line.includes('[Background]') ||
                       line.includes('[Settings]');

      if (line.includes('console.log') && !hasPrefix) {
        // Only warn about console.log without our prefixes
        if (!line.trim().startsWith('//')) {
          issues.push(`⚠️  ${filePath}:${lineNum}: Unprefixed console.log`);
        }
      }

      // Check for TODO comments
      if (line.includes('TODO') || line.includes('FIXME') || line.includes('XXX')) {
        issues.push(`📝 ${filePath}:${lineNum}: ${line.trim()}`);
      }

      // Check for debugger statements
      if (line.includes('debugger') && !line.trim().startsWith('//')) {
        issues.push(`⚠️  ${filePath}:${lineNum}: debugger statement found`);
      }
    });

  } catch (error) {
    issues.push(`❌ ${filePath}: ${error.message}`);
  }
});

console.log('\n' + '='.repeat(60));

if (issues.length === 0) {
  console.log('✅ All validations passed! No issues found.');
  process.exit(0);
} else {
  console.log(`\n⚠️  Found ${issues.length} issue(s):\n`);
  issues.forEach(issue => console.log(issue));
  console.log('\n' + '='.repeat(60));
  process.exit(1);
}
