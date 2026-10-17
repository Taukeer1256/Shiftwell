'use strict';
// UI smoke test in jsdom (a simulated DOM, NOT a real browser: layout, colours and CSS are not verified here).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
function load() {
  const errors = [];
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) { w.addEventListener('error', (e) => errors.push(e.message)); } });
  return { dom, doc: dom.window.document, errors };
}
const click = (doc, sel) => doc.querySelector(sel).click();
const text = (doc, sel) => doc.querySelector(sel).textContent;

test('page loads without script errors and shows the synthetic-data disclaimer', () => {
  const { doc, errors } = load();
  assert.deepEqual(errors, []);
  assert.match(text(doc, '#disclaimer'), /Synthetic data\. Not a production compliance system\./);
  assert.equal(doc.querySelectorAll('.tab').length, 3);
});

test('account selection swaps policies and scenarios', () => {
  const { doc } = load();
  click(doc, '.tab[data-account="UrbanMart"]');
  assert.match(text(doc, '#policySource'), /48 hrs\/week/);
  assert.ok(doc.querySelectorAll('.scen').length >= 8);
  assert.ok([...doc.querySelectorAll('.scen')].every((b) => /^UM/.test(b.dataset.key)));
  click(doc, '.tab[data-account="FreshBowl"]');
  assert.ok([...doc.querySelectorAll('.scen')].every((b) => /^FB/.test(b.dataset.key)));
});

test('CarePoint: expiring-on-shift-date scenario shows BLOCKED with reason and logs it', () => {
  const { doc } = load();
  click(doc, '.scen[data-key="CP3"]');
  assert.match(text(doc, '#resultCard .chip'), /BLOCKED/);
  assert.match(text(doc, '#reasonText'), /on the shift date/);
  assert.equal(doc.querySelectorAll('#logTable tbody tr').length, 1);
  assert.match(text(doc, '#logTable tbody'), /BLOCKED/);
});

test('hard block: attempted override is denied and logged', () => {
  const { doc } = load();
  click(doc, '.scen[data-key="CP2"]');
  const btn = [...doc.querySelectorAll('button.act')].find((b) => /Manager tries to approve anyway/.test(b.textContent));
  btn.click();
  assert.match(text(doc, '#actionMsg'), /cannot be overridden/);
  assert.equal(doc.querySelectorAll('#logTable tbody tr').length, 2);
  assert.match(text(doc, '#logTable tbody'), /HARD_BLOCK_NO_OVERRIDE/);
});

test('UrbanMart: 52h across two locations escalates to the named approver; manager denied, approver approves', () => {
  const { doc } = load();
  click(doc, '.tab[data-account="UrbanMart"]');
  click(doc, '.scen[data-key="UM4"]');
  assert.match(text(doc, '#resultCard .chip'), /ESCALATED/);
  assert.match(text(doc, '#resultCard'), /52h/);
  assert.match(text(doc, '#resultCard'), /Meera Sen/);
  const mgr = [...doc.querySelectorAll('button.act')].find((b) => /Approve as Location Manager/.test(b.textContent));
  doc.querySelector('#reasonInput').value = 'cover';
  mgr.click();
  assert.match(text(doc, '#actionMsg'), /Only the named approver/);
  const ra = [...doc.querySelectorAll('button.act')].find((b) => /Approve as Meera Sen/.test(b.textContent));
  doc.querySelector('#reasonInput').value = 'festival cover, rest day guaranteed';
  ra.click();
  assert.match(text(doc, '#resultCard'), /Resolved: APPROVE by Meera Sen/);
  assert.equal(doc.querySelectorAll('#logTable tbody tr').length, 3);
});

test('UrbanMart: exactly 48h is not escalated', () => {
  const { doc } = load();
  click(doc, '.tab[data-account="UrbanMart"]'); click(doc, '.scen[data-key="UM2"]');
  assert.match(text(doc, '#resultCard .chip'), /READY/);
  assert.match(text(doc, '#resultCard'), /48h/);
});

test('FreshBowl: auto-approval and missing-data review render correctly', () => {
  const { doc } = load();
  click(doc, '.tab[data-account="FreshBowl"]');
  click(doc, '.scen[data-key="FB1"]');
  assert.match(text(doc, '#resultCard .chip'), /AUTO-APPROVED/);
  click(doc, '.scen[data-key="FB3"]');
  assert.match(text(doc, '#resultCard .chip'), /MANAGER REVIEW/);
  assert.match(text(doc, '#reasonText'), /not on file/);
});

test('reproducibility table: all scenarios match their expected outcome', () => {
  const { doc } = load();
  click(doc, '#runAll');
  const n = doc.querySelectorAll('#allTable tbody tr').length;
  assert.match(text(doc, '#allSummary'), new RegExp('^' + n + ' of ' + n + ' scenarios match'));
  assert.equal(doc.querySelectorAll('#allTable .no').length, 0);
  assert.equal(doc.querySelectorAll('#logTable tbody tr').length, 0); // separate engine instance
});

test('clear log empties the audit table', () => {
  const { doc } = load();
  click(doc, '.scen[data-key="CP1"]'); click(doc, '#clearLog');
  assert.equal(doc.querySelectorAll('#logTable tbody tr').length, 0);
});
