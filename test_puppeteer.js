import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  
  await page.goto('http://localhost:3000');
  
  // Click the run button
  await page.click('#run-ai-btn');
  
  // Wait for log to change
  await page.waitForFunction(() => {
    const text = document.getElementById('test-log').innerText;
    return text !== 'Running test...';
  }, { timeout: 10000 });
  
  const log = await page.$eval('#test-log', el => el.innerText);
  console.log('FINAL RESULT:', log);
  
  await browser.close();
})();
