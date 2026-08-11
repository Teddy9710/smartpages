const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'sidepanel', 'sidepanel.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'sidepanel', 'sidepanel.html'), 'utf8');
const schema = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');

assert.match(html, /id="btn-history"/);
assert.match(html, /id="cloud-history-search"/);
assert.match(html, /生成文档历史/);
assert.match(source, /_saveGeneratedDocumentToHistory\(\)/);
assert.match(source, /listDocumentVersions\(documentId\)/);
assert.match(source, /async openCloudDocumentVersion\(versionId\)/);
assert.match(source, /async saveCloudVersionAsNew\(documentId, versionId = null\)/);
assert.match(source, /async deleteCloudDocument\(id\)/);
assert.match(schema, /create table if not exists public\.cloud_document_versions/);
assert.match(schema, /create or replace function public\.save_generated_document/);
assert.match(schema, /document_type text not null default 'generated'/);

console.log('sidepanel-generated-history tests passed');
