/**
 * Generate scoped annotationui.css from annotationui.unscoped.css (PostCSS prefix).
 * Run via: npm run scope-css
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = path.join(root, 'src/css/annotationui.unscoped.css');
const output = path.join(root, 'src/css/annotationui.css');

execFileSync(
    path.join(root, 'node_modules/.bin/postcss'),
    [input, '-o', output],
    { stdio: 'inherit', cwd: root },
);

const banner = '/* Generated from annotationui.unscoped.css — edit that file, then run: npm run scope-css */\n';
const fs = await import('node:fs');
const css = fs.readFileSync(output, 'utf8');
if (!css.startsWith('/* Generated from annotationui.unscoped.css')) {
    fs.writeFileSync(output, banner + css);
}
