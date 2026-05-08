const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Listen to console logs
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.text().includes('AI') || msg.text().includes('Video') || msg.text().includes('Failed') || msg.text().includes('Error')) {
      console.log(`[Browser ${msg.type()}] ${msg.text()}`);
    }
  });

  // Listen to unhandled page errors
  page.on('pageerror', error => {
    console.log(`[Page Error] ${error.message}`);
  });

  await page.goto('http://localhost:5173');
  
  // Login
  await page.fill('input[type="email"]', 'teo@teovelci.com');
  await page.fill('input[type="password"]', 'Password123!');
  await page.click('button[type="submit"]');
  
  await page.waitForTimeout(3000);
  
  // Upload video
  const filePath = path.resolve('./latest_proxy.mp4');
  console.log("Uploading file:", filePath);
  
  // Find the file input and set files
  const fileInput = await page.$('input[type="file"]');
  await fileInput.setInputFiles(filePath);
  
  console.log("Waiting for analysis to finish (15 seconds max)...");
  await page.waitForTimeout(15000);
  
  await browser.close();
})();
