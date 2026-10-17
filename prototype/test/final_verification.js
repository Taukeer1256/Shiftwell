'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const { JSDOM } = require('jsdom');

async function fetchLiveHTML() {
  return new Promise((resolve, reject) => {
    https.get('https://prototype-dun-omega.vercel.app', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function runVerification(htmlSource, sourceLabel) {
  console.log(`\n============================================================`);
  console.log(`RUNNING FINAL VERIFICATION ON: ${sourceLabel}`);
  console.log(`============================================================\n`);

  const dom = new JSDOM(htmlSource, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true
  });
  const doc = dom.window.document;

  // ------------------------------------------------------------------
  // VERIFICATION 1: Click "Run All 25 Scenarios" and confirm results
  // ------------------------------------------------------------------
  console.log(`[TEST 1] Testing "Run All 25 Scenarios"...`);
  const runAllBtn = doc.querySelector('#runAll');
  if (!runAllBtn) throw new Error('Missing #runAll button');

  const allCardBefore = doc.querySelector('#allCard');
  console.log(`- Before click: #allCard display is "${allCardBefore.style.display}"`);

  runAllBtn.click();

  const allCardAfter = doc.querySelector('#allCard');
  const summaryEl = doc.querySelector('#allSummary');
  const summaryText = summaryEl ? summaryEl.textContent.trim() : '';
  console.log(`- After click: #allCard display is "${allCardAfter.style.display}"`);
  console.log(`- Summary text: "${summaryText}"`);

  if (!summaryText.includes('25 of 25 scenarios match their expected outcome')) {
    throw new Error(`Summary mismatch! Got: "${summaryText}"`);
  }

  const rows = doc.querySelectorAll('#allTable tbody tr');
  console.log(`- Total scenario result rows rendered: ${rows.length}`);
  if (rows.length !== 25) {
    throw new Error(`Expected exactly 25 rows in #allTable, found: ${rows.length}`);
  }

  let passCount = 0;
  rows.forEach((row, i) => {
    const cols = row.querySelectorAll('td');
    const key = cols[0].textContent.trim();
    const account = cols[1].textContent.trim();
    const title = cols[2].textContent.trim();
    const expected = cols[3].textContent.trim();
    const actual = cols[4].textContent.trim();
    const match = cols[5].textContent.trim();
    const isOk = match.includes('yes');
    if (isOk) passCount++;
    console.log(`  [${key}] ${account} - ${title}: Expected=${expected}, Actual=${actual} -> ${match}`);
  });

  console.log(`- Verification 1 PASSED: ${passCount} of 25 scenarios verified matching.\n`);

  // ------------------------------------------------------------------
  // VERIFICATION 2: Evaluate scenario and check new audit event
  // ------------------------------------------------------------------
  console.log(`[TEST 2] Testing scenario evaluation and audit event persistence...`);
  const initialLogRows = doc.querySelectorAll('#logTable tbody tr').length;
  console.log(`- Initial audit log rows count: ${initialLogRows}`);

  // Evaluate CP3
  console.log(`- Selecting scenario CP3 (CarePoint: BLS expires ON the shift date)...`);
  const cp3Btn = doc.querySelector('.scen[data-key="CP3"]');
  if (!cp3Btn) throw new Error('Scenario button CP3 not found');
  cp3Btn.click();

  const resStatus = doc.querySelector('#resultCard .chip').textContent.trim();
  const resReason = doc.querySelector('#reasonText').textContent.trim();
  console.log(`- Evaluation status: ${resStatus}`);
  console.log(`- Reason: ${resReason}`);

  if (!resStatus.includes('BLOCKED')) {
    throw new Error(`Expected BLOCKED status for CP3, got ${resStatus}`);
  }

  const logRowsAfterCP3 = doc.querySelectorAll('#logTable tbody tr');
  console.log(`- Audit log rows after evaluating CP3: ${logRowsAfterCP3.length}`);
  if (logRowsAfterCP3.length !== 1) {
    throw new Error(`Expected 1 audit row, got ${logRowsAfterCP3.length}`);
  }

  const firstEntryCells = logRowsAfterCP3[0].querySelectorAll('td');
  const entry1 = {
    seq: firstEntryCells[0].textContent.trim(),
    timestamp: firstEntryCells[1].textContent.trim(),
    account: firstEntryCells[2].textContent.trim(),
    requestId: firstEntryCells[3].textContent.trim(),
    event: firstEntryCells[4].textContent.trim(),
    outcome: firstEntryCells[5].textContent.trim(),
    rule: firstEntryCells[6].textContent.trim(),
    reason: firstEntryCells[7].textContent.trim(),
    actor: firstEntryCells[8].textContent.trim()
  };
  console.log(`- Audit Entry 1 Details:`, JSON.stringify(entry1, null, 2));

  // Try override on hard-blocked decision (proves audit persists denied action)
  console.log(`- Attempting override on CP3 hard block...`);
  const overrideBtn = [...doc.querySelectorAll('button.act')].find(b => b.textContent.includes('Manager tries to approve anyway'));
  if (overrideBtn) {
    overrideBtn.click();
    const actionMsg = doc.querySelector('#actionMsg').textContent.trim();
    console.log(`- Action response message: "${actionMsg}"`);
  }

  const logRowsAfterOverride = doc.querySelectorAll('#logTable tbody tr');
  console.log(`- Audit log rows after override attempt: ${logRowsAfterOverride.length}`);
  if (logRowsAfterOverride.length !== 2) {
    throw new Error(`Expected 2 audit rows after override attempt, got ${logRowsAfterOverride.length}`);
  }

  // Switch account to FreshBowl and evaluate FB2 (Grill station mismatch)
  console.log(`- Switching account to FreshBowl and evaluating FB2...`);
  const fbTab = doc.querySelector('.tab[data-account="FreshBowl"]');
  fbTab.click();

  const fb2Btn = doc.querySelector('.scen[data-key="FB2"]');
  fb2Btn.click();

  const fb2Status = doc.querySelector('#resultCard .chip').textContent.trim();
  const fb2Reason = doc.querySelector('#reasonText').textContent.trim();
  console.log(`- FB2 Evaluation status: ${fb2Status}`);
  console.log(`- FB2 Reason: ${fb2Reason}`);

  const logRowsAfterFB2 = doc.querySelectorAll('#logTable tbody tr');
  console.log(`- Audit log rows after evaluating FB2: ${logRowsAfterFB2.length}`);
  if (logRowsAfterFB2.length !== 3) {
    throw new Error(`Expected 3 audit rows, got ${logRowsAfterFB2.length}`);
  }
  console.log(`- Verification 2 PASSED: New audit events persist and reflect all evaluated requests.\n`);

  // ------------------------------------------------------------------
  // VERIFICATION 3: Click "Reset demo data" and confirm warning & behavior
  // ------------------------------------------------------------------
  console.log(`[TEST 3] Testing Demo Controls & Reset behavior...`);
  
  // Verify clearLog button is NOT in the audit-log card
  const auditSection = doc.querySelector('.row-audit-breakdown');
  const clearBtnInAudit = auditSection.querySelector('#clearLog');
  if (clearBtnInAudit) {
    throw new Error('FAILED: Found #clearLog inside the audit log section!');
  }
  console.log(`- Verified: No "Clear Log" button present in the audit log section.`);

  // Verify audit subtitle note
  const auditNote = auditSection.textContent;
  if (!auditNote.includes('Read-only event history for this demo. Production audit integrity requires server-side storage and access controls.')) {
    throw new Error('FAILED: Missing read-only audit disclaimer note.');
  }
  console.log(`- Verified: Audit log read-only disclaimer note is present.`);

  // Verify Demo Controls card & warning
  const demoControlsCard = doc.querySelector('.demo-controls-card');
  if (!demoControlsCard) throw new Error('Missing .demo-controls-card element');
  const demoWarning = demoControlsCard.textContent.trim();
  console.log(`- Demo Controls Card text: "${demoWarning}"`);
  if (!demoWarning.includes('Warning: Resets local demonstration data')) {
    throw new Error('Missing reset warning in Demo Controls card');
  }

  // Click Reset Demo Data
  const resetBtn = doc.querySelector('#resetDemoBtn');
  if (!resetBtn) throw new Error('Missing #resetDemoBtn button');
  console.log(`- Clicking "#resetDemoBtn" (${resetBtn.textContent.trim()})...`);
  resetBtn.click();

  const logRowsAfterReset = doc.querySelectorAll('#logTable tbody tr');
  console.log(`- Audit log rows after Reset: ${logRowsAfterReset.length}`);
  if (logRowsAfterReset.length !== 0) {
    throw new Error(`Expected 0 audit rows after reset, got ${logRowsAfterReset.length}`);
  }

  const logEmptyEl = doc.querySelector('#logEmpty');
  console.log(`- Empty log message display: style.display="${logEmptyEl.style.display}", text="${logEmptyEl.textContent.trim()}"`);

  const resultCardText = doc.querySelector('#resultCard').textContent.trim();
  console.log(`- Evaluation result card reset text: "${resultCardText}"`);
  if (!resultCardText.includes('Choose a scenario on the left to run the rules')) {
    throw new Error('Result card was not reset to default prompt');
  }

  console.log(`- Verification 3 PASSED: Reset warning is present, button properly labeled, and reset behavior is completely verified.\n`);
  console.log(`>>> ALL THREE FINAL VERIFICATIONS COMPLETED SUCCESSFULLY! <<<\n`);
}

async function main() {
  try {
    // 1. Verify local build
    const localHTML = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
    await runVerification(localHTML, 'LOCAL BUILD (dist/index.html)');

    // 2. Verify live deployment
    const liveHTML = await fetchLiveHTML();
    await runVerification(liveHTML, 'LIVE VERCEL DEPLOYMENT (https://prototype-dun-omega.vercel.app)');
  } catch (err) {
    console.error('VERIFICATION ERROR:', err);
    process.exit(1);
  }
}

main();
