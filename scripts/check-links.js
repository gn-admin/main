#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || '.');

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.html?$/i.test(name)) out.push(full);
  }
}

function isExternal(url) {
  return /^(https?:|mailto:|tel:|data:|javascript:|blob:|#)/i.test(url) ||
    url.startsWith('//');
}

const htmlFiles = [];
walk(root, htmlFiles);

const errores = [];
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const re = /(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const url = (m[1] !== undefined ? m[1] : m[2]).trim();
    if (!url || isExternal(url)) continue;
    const limpio = url.split('#')[0].split('?')[0];
    if (!limpio) continue;
    const destino = path.resolve(path.dirname(file), limpio);
    if (!fs.existsSync(destino)) {
      errores.push(path.relative(root, file) + ' -> ' + url);
    }
  }
}

if (errores.length) {
  console.error('Enlaces rotos encontrados:');
  errores.forEach((e) => console.error('  ' + e));
  process.exit(1);
}
console.log('check-links: ' + htmlFiles.length + ' HTML sin enlaces rotos en ' + root);