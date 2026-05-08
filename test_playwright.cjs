const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:3000');
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  await page.click('#run-ai-btn');
  await page.waitForTimeout(5000);
  const log = await page.$eval('#test-log', el => el.textContent);
  console.log('RESULT:', log);
  await browser.close();
})();
