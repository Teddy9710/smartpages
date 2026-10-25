/*
 * SmartPages browser smoke test.
 *
 * This intentionally uses the Playwright library directly instead of the test
 * runner so it can run against an unpacked MV3 extension with one command.
 * The package is kept optional for normal extension builds; set NODE_PATH to a
 * Playwright installation before running this script.
 */

const path = require('node:path');

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (error) {
    throw new Error(
      'Playwright is required for browser smoke tests. Install it with "npm install --save-dev playwright" or set NODE_PATH to an existing Playwright installation.',
      { cause: error }
    );
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const { chromium } = loadPlaywright();
  const projectRoot = path.resolve(__dirname, '..');
  const extensionPath = path.join(projectRoot, 'dist');
  const executablePath = process.env.SMARTPAGES_CHROME_PATH;
  const context = await chromium.launchPersistentContext('', {
    executablePath,
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox'
    ]
  });

  const errors = [];
  try {
    const serviceWorker = context.serviceWorkers()[0]
      || await context.waitForEvent('serviceworker', { timeout: 10000 });
    const extensionId = new URL(serviceWorker.url()).host;
    assert(extensionId, 'Could not determine the unpacked extension ID.');

    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error));

    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.locator('#btn-start').waitFor({ state: 'visible' });
    await page.locator('#btn-settings').waitFor({ state: 'visible' });
    assert(await page.locator('#btn-start-gif').count() === 1, 'GIF recorder control is missing from popup.');

    await page.goto(`chrome-extension://${extensionId}/settings/settings.html`);
    await page.locator('#api-key').waitFor({ state: 'visible' });
    await page.locator('#btn-test').click();
    await page.locator('#test-result').waitFor({ state: 'visible' });
    assert((await page.locator('#test-result').textContent()).includes('API Key'), 'Test connection did not show API key feedback.');

    await page.locator('#btn-save').click();
    await page.locator('#test-result').waitFor({ state: 'visible' });
    assert((await page.locator('#test-result').textContent()).includes('API Key'), 'Save settings did not show API key feedback.');

    assert(errors.length === 0, `Extension page errors detected: ${errors.map(error => error.message).join('; ')}`);
    console.log('Browser smoke test passed: popup, settings feedback, and MV3 service worker.');
  } finally {
    await context.close();
  }
}

main().catch(error => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});

