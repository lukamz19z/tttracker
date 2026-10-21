import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '../..');
const require = createRequire(path.join(root, 'v2/package.json'));
const ts = require('typescript');
const decoder = new TextDecoder('utf-8', { fatal: true });
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return files(file);
    return /\.(tsx?|jsx?|css|json)$/.test(file) ? [file] : [];
  });
}

test('V2 UI source is UTF-8 and contains no corrupted text separators', () => {
  for (const directory of ['app', 'components', 'lib']) {
    for (const file of files(path.join(root, 'v2', directory))) {
      const source = decoder.decode(fs.readFileSync(file));
      assert.doesNotMatch(source, /\uFFFD|\u00C2[\u0080-\u00BF]|\u00C3[\u0080-\u00BF]|\u00E2[\u0080\u20AC]/, file);
      if (!/\.[jt]sx?$/.test(file)) continue;
      const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      function visit(node) {
        if (ts.isStringLiteralLike(node) || ts.isJsxText(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
          assert.doesNotMatch(node.text, /\s\?\s|organisation\?s|^(Connecting|Checking)\?$/, `${file}: ${node.text}`);
        }
        ts.forEachChild(node, visit);
      }
      visit(ast);
    }
  }
});

test('Document Setup uses separate summary and destination status elements', () => {
  const source = fs.readFileSync(path.join(root, 'v2/components/integrations/sharepoint-workspace.tsx'), 'utf8');
  assert.match(source, /configured<\/span><span>/);
  assert.match(source, /"Destination required"}<\/span><span>/);
  assert.match(source, /Change Document Destination\?/);
  assert.match(fs.readFileSync(path.join(root, 'v2/components/people/configuration-surface.tsx'), 'utf8'), /Discard unsaved changes\?/);
});
