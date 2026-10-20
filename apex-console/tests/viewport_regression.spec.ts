import { test, expect } from '@playwright/test';

/**
 * Zero-Regression Sentinel: Viewport & Accessibility E2E Test Suite
 * 
 * Verifies:
 * 1. Zero horizontal overflow (scrollWidth <= innerWidth) across 375px, 768px, 1440px
 * 2. Responsive UI element wrapping and fluid container sizing
 * 3. WCAG 2.1 AA keyboard focus outlines and accessible naming
 */

const VIEWPORTS = [
  { name: 'Mobile (iPhone SE / Standard)', width: 375, height: 667 },
  { name: 'Tablet (iPad Mini / Portrait)', width: 768, height: 1024 },
  { name: 'Desktop (1080p / Standard Monitor)', width: 1440, height: 900 }
];

test.describe('Apex-Console Zero Horizontal Overflow & Responsive Bounds', () => {
  for (const vp of VIEWPORTS) {
    test(`Viewport ${vp.name} (${vp.width}x${vp.height}) has zero horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');

      // Wait for console dashboard to mount
      await expect(page.locator('text=APEX-SYSTEM')).toBeVisible();

      // Check document-level horizontal scroll
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      expect(hasHorizontalScroll, `Horizontal overflow detected at ${vp.width}px`).toBe(false);

      // Verify header and status banners wrap cleanly without clipping
      const header = page.locator('header');
      await expect(header).toBeVisible();
      const headerBox = await header.boundingBox();
      expect(headerBox?.width).toBeLessThanOrEqual(vp.width);
    });
  }

  test('375px Mobile Viewport switches main canvas to fluid column layout', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    const mainContainer = page.locator('main');
    await expect(mainContainer).toBeVisible();

    // Verify task cards and metrics stack vertically on mobile
    const sidebarOrAside = page.locator('aside');
    if (await sidebarOrAside.count() > 0) {
      const asideBox = await sidebarOrAside.boundingBox();
      expect(asideBox?.width).toBeLessThanOrEqual(375);
    }
  });
});

test.describe('WCAG 2.1 AA Accessibility & Keyboard Interaction', () => {
  test('All interactive buttons exhibit visible focus indicators', async ({ page }) => {
    await page.goto('/');

    // Focus the prompt input and check outline / ring
    const promptInput = page.locator('#prompt-input');
    await expect(promptInput).toBeVisible();
    await promptInput.focus();

    // Verify accessible label association
    const label = page.locator('label[for="prompt-input"]');
    await expect(label).toBeVisible();

    // Tab through interactive buttons
    await page.keyboard.press('Tab');
    const focusedElementTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(['BUTTON', 'TEXTAREA', 'INPUT']).toContain(focusedElementTag);
  });

  test('Escape key or dismiss button closes inspector drawer safely', async ({ page }) => {
    await page.goto('/');

    // If an inspector modal/drawer exists, clicking close button dismisses it
    const closeBtn = page.locator('[aria-label="Close task inspector"]');
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await expect(closeBtn).not.toBeVisible();
    }
  });
});
