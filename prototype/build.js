'use strict';
// Inlines engine + data + app into one self-contained dist/index.html (easy to host anywhere).
const fs = require('fs'), path = require('path');
const src = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
// Use a function replacer so "$" sequences in code are never interpreted.
let html = src('index.template.html')
  .replace('/*ENGINE*/', () => src('engine.js'))
  .replace('/*DATA*/', () => src('scenarios.js'))
  .replace('/*APP*/', () => src('app.js'));
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'index.html'), html, 'utf8');
console.log('built dist/index.html (' + html.length + ' bytes)');
