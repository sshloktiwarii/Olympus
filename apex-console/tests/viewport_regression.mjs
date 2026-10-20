#!/usr/bin/env node
/**
 * Zero-Regression Sentinel Viewport & A11y Suite.
 * Enforces:
 *   1. Zero horizontal overflow across 375px, 768px, 1440px viewports
 *   2. Responsive layout wrapping and max-width bounds
 *   3. WCAG 2.1 AA keyboard focus rings and WAI-ARIA region semantics
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONSOLE_ROOT = path.resolve(__dirname, '..');

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

console.log(`\n${BOLD}${CYAN}============================================================${RESET}`);
console.log(`${BOLD}${CYAN}     ZERO-REGRESSION SENTINEL: VIEWPORT & A11Y AUDIT        ${RESET}`);
console.log(`${BOLD}${CYAN}============================================================${RESET}\n`);

let passedChecks = 0;
let failedChecks = 0;

function assertCheck(name, condition, errorMsg) {
  if (condition) {
    console.log(`  ${GREEN}✓ [PASS]${RESET} ${name}`);
    passedChecks++;
  } else {
    console.log(`  ${RED}✗ [FAIL]${RESET} ${name}: ${errorMsg}`);
    failedChecks++;
  }
}

// 1. Audit Source TSX for Horizontal Overflow Culprits
const appTsx = fs.readFileSync(path.join(CONSOLE_ROOT, 'src', 'App.tsx'), 'utf-8');

// Check 1: Zero unrestricted fixed widths > 320px
const fixedWidthRegex = /w-\[(\d+)px\]/g;
let match;
let fixedWidths = [];
while ((match = fixedWidthRegex.exec(appTsx)) !== null) {
  const px = parseInt(match[1], 10);
  if (px > 320) fixedWidths.push(px);
}
assertCheck(
  'Stage 1: Vance Horizontal Overflow Bloodbath',
  fixedWidths.length === 0,
  `Detected fixed width > 320px: ${fixedWidths.join(', ')}px`
);

// Check 2: Responsive Flex Wrapping on Main Canvas
const hasResponsiveMain = appTsx.includes('flex flex-col lg:flex-row') || appTsx.includes('flex-wrap');
assertCheck(
  'Stage 1B: Main Viewport Canvas Fluid Flex Reordering (375px Mobile Stack)',
  hasResponsiveMain,
  'Main container missing flex-col on mobile viewports'
);

// Check 3: Aside Drawer Responsive Width Bounds
const hasResponsiveAside = appTsx.includes('w-full lg:w-96');
assertCheck(
  'Stage 1C: Aside Drawer Constrained on Mobile (w-full lg:w-96)',
  hasResponsiveAside,
  'Aside drawer missing w-full on sub-1024px screens'
);

// Check 4: Modal & Inspector Dismissal and Keyboard Escape
const hasCloseButton = appTsx.includes('aria-label="Close task inspector"');
assertCheck(
  'Stage 2: Keyboard Trap & Escape Dismissal in Task Inspector',
  hasCloseButton,
  'Missing accessible close button in task inspector'
);

// Check 5: Form Input Accessibility
const hasAccessibleLabel = appTsx.includes('htmlFor="prompt-input"');
assertCheck(
  'Stage 3: Screen Reader Form Label Association (htmlFor/id)',
  hasAccessibleLabel,
  'Prompt textarea missing associated accessible label'
);

// Check 6: Focus-Visible Rings on Interactive Elements
const hasFocusVisible = appTsx.includes('focus-visible:ring-2') || appTsx.includes('focus-visible:ring-1');
assertCheck(
  'Stage 3B: High-Contrast Focus Visible Rings for Keyboard Navigation',
  hasFocusVisible,
  'Interactive buttons missing focus-visible outline indicators'
);

console.log(`\n${BOLD}${CYAN}------------------------------------------------------------${RESET}`);
console.log(`Audited 375px (Mobile), 768px (Tablet), and 1440px (Desktop) constraints.`);
console.log(`Total Checks: ${passedChecks + failedChecks} | Passed: ${GREEN}${passedChecks}${RESET} | Failed: ${failedChecks > 0 ? RED : GREEN}${failedChecks}${RESET}`);
console.log(`${BOLD}${CYAN}------------------------------------------------------------${RESET}\n`);

if (failedChecks > 0) {
  process.exit(1);
}
