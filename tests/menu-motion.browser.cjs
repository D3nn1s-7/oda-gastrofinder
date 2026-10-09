// Opt-in native Bootstrap/CSS test; use an existing Playwright installation.
// MENU_ROOT allows the same component contract to be checked in another app.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.env.MENU_ROOT || path.resolve(__dirname, '..');
const bootstrapRoot = process.env.MENU_BOOTSTRAP_ROOT || root;

for (const reducedMotion of ['no-preference', 'reduce']) {
  test(`offcanvas retains native Bootstrap motion with ${reducedMotion}`, async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion });
      await page.setContent('<button data-bs-toggle="offcanvas" data-bs-target="#offcanvasNavbar">Menü</button><div id="offcanvasNavbar" class="offcanvas offcanvas-end" tabindex="-1"><button data-bs-dismiss="offcanvas">Schließen</button></div>');
      await page.addStyleTag({ path: path.join(bootstrapRoot, 'app/vendor/bootstrap/bootstrap.min.css') });
      await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'app/app.css'), 'utf8') });
      await page.addScriptTag({ path: path.join(bootstrapRoot, 'app/vendor/bootstrap/bootstrap.bundle.min.js') });
      const menu = page.locator('#offcanvasNavbar');
      const style = await menu.evaluate(el => ({
        duration: getComputedStyle(el).transitionDuration,
        easing: getComputedStyle(el).transitionTimingFunction,
      }));
      assert.equal(style.duration, reducedMotion === 'reduce' ? '0s' : '0.3s');
      if (reducedMotion === 'no-preference') assert.equal(style.easing, 'ease-in-out');
      await page.getByRole('button', { name: 'Menü', exact: true }).click();
      await page.waitForFunction(() => {
        const el = document.querySelector('#offcanvasNavbar');
        return el.classList.contains('show') && !el.classList.contains('showing');
      });
      assert.equal(await menu.evaluate(el => el.contains(document.activeElement)), true);
      await menu.getByRole('button', { name: 'Schließen', exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('#offcanvasNavbar').classList.contains('hiding'));
      assert.equal(await menu.evaluate(el => getComputedStyle(el).visibility), 'hidden');
      assert.equal(await page.locator('.offcanvas-backdrop').count(), 0);
    } finally { await browser.close(); }
  });
}
