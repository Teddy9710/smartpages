#!/usr/bin/env node

/**
 * SmartPages - Validation Script
 * Checks for syntax errors and common issues in all JavaScript files
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { createLogger } = require('./utils/logger.js');

const log = createLogger({
  quiet: process.argv.includes('--quiet'),
  verbose: process.argv.includes('--verbose')
});

const filesToCheck = [
  'background/background.js',
  'background/recording-manager.js',
  'background/document-handlers.js',
  'background/workflow-run-manager.js',
  'content/recorder.js',
  'content/recorder-selector.js',
  'popup/popup.js',
  'sidepanel/sidepanel.js',
  'sidepanel/sidepanel-documents.js',
  'sidepanel/sidepanel-editing.js',
  'sidepanel/sidepanel-exports.js',
  'sidepanel/sidepanel-generation.js',
  'sidepanel/sidepanel-steps.js',
  'sidepanel/sidepanel-workflow.js',
  'settings/settings.js'
];

const issues = [];

log.info('🔍 Validating SmartPages extension files...\n');

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
      const syntaxCheck = spawnSync(process.execPath, ['--check', fullPath], {
        encoding: 'utf8'
      });
      if (syntaxCheck.status !== 0) {
        throw new Error(String(syntaxCheck.stderr || syntaxCheck.error?.message || 'Unknown syntax error').trim());
      }
      log.info(`✅ ${filePath}: No syntax errors`);
    } catch (error) {
      issues.push(`❌ ${filePath}: Syntax error - ${error.message}`);
    }

    // Check for common issues
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const lineNum = index + 1;

      // Check for console.log that should be removed in production
      const hasPrefix = line.includes('[SmartPages]') ||
                       line.includes('[Scribe:') ||
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

log.info('\n' + '='.repeat(60));

if (issues.length === 0) {
  log.info('✅ All validations passed! No issues found.');
  process.exit(0);
} else {
  log.info(`\n⚠️  Found ${issues.length} issue(s):\n`);
  issues.forEach(issue => log.info(issue));
  log.info('\n' + '='.repeat(60));
  process.exit(1);
}
