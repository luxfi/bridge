const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = '/tmp/bridge-ui-screenshots';

async function ensureScreenshotDir() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
}

async function runTests() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  // Capture console logs
  const consoleLogs = [];
  page.on('console', (msg) => {
    consoleLogs.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location(),
    });
  });

  // Capture console errors
  const pageErrors = [];
  page.on('pageerror', (error) => {
    pageErrors.push({
      message: error.message,
      stack: error.stack,
    });
  });

  await ensureScreenshotDir();

  console.log('🌐 Starting UI inspection of https://bridge.lux.network');
  console.log('📸 Screenshots will be saved to:', SCREENSHOT_DIR);
  console.log('');

  try {
    // Navigate to the page
    console.log('⏳ Loading https://bridge.lux.network...');
    const response = await page.goto('https://bridge.lux.network', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    console.log(`✅ Page loaded with status: ${response.status()}`);
    console.log('');

    // Wait for React/Next.js to fully hydrate
    console.log('⏳ Waiting for application to hydrate...');

    // Wait for more substantial content to load
    try {
      // Try to wait for the main bridge form or any interactive content
      await Promise.race([
        page.waitForSelector('input, button[type="submit"], [role="button"]', { timeout: 15000 }),
        page.waitForTimeout(12000),
      ]);
      console.log('  ✓ Interactive elements found or timeout');
    } catch (e) {
      console.log('  (Continuing despite wait timeout)');
    }

    await page.waitForTimeout(2000);

    // Screenshot 1: Full page
    console.log('📷 Taking screenshot of full page...');
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '01-full-page.png'),
      fullPage: true,
    });
    console.log('✅ Saved: 01-full-page.png');

    // Check for blank white page
    const bodyColor = await page.evaluate(() => {
      const style = window.getComputedStyle(document.body);
      return style.backgroundColor;
    });
    console.log(`📊 Body background color: ${bodyColor}`);

    // Get page title
    const title = await page.title();
    console.log(`📄 Page title: "${title}"`);

    // Check for main content
    const mainContent = await page.locator('main, [role="main"], .main').first().isVisible().catch(() => false);
    console.log(`🎯 Main content visible: ${mainContent}`);

    // Check header
    console.log('');
    console.log('🔍 Checking header elements...');
    const header = await page.locator('header').first();
    const headerVisible = await header.isVisible().catch(() => false);
    console.log(`  Header visible: ${headerVisible}`);

    // Look for Lux logo
    const logo = await page.locator('img[alt*="Lux"], img[alt*="Logo"], a:has-text("Lux")').first();
    const logoVisible = await logo.isVisible().catch(() => false);
    console.log(`  Lux logo/branding visible: ${logoVisible}`);

    // Look for Connect button
    const connectBtn = await page.locator('button:has-text("Connect"), button:has-text("Wallet")').first();
    const connectVisible = await connectBtn.isVisible().catch(() => false);
    console.log(`  Connect/Wallet button visible: ${connectVisible}`);

    // Check theme
    console.log('');
    console.log('🎨 Checking theme/colors...');
    const htmlClass = await page.evaluate(() => document.documentElement.className);
    const htmlAttr = await page.evaluate(() => document.documentElement.getAttribute('data-theme') || document.documentElement.getAttribute('class'));
    console.log(`  HTML class/theme: "${htmlAttr}"`);

    // Check for dark mode indicators
    const isDarkMode = await page.evaluate(() => {
      const style = window.getComputedStyle(document.documentElement);
      const bgColor = style.backgroundColor;
      const textColor = style.color;
      return bgColor.includes('rgb(0,') || bgColor.includes('rgb(20,') || bgColor.includes('rgb(30,');
    });
    console.log(`  Dark mode detected: ${isDarkMode}`);

    // Check main content
    console.log('');
    console.log('🏗️  Checking page structure...');

    // Look for bridge/swap form
    const swapForm = await page.locator('form, [class*="swap"], [class*="bridge"]').first();
    const formVisible = await swapForm.isVisible().catch(() => false);
    console.log(`  Swap/Bridge form visible: ${formVisible}`);

    // Look for footer
    const footer = await page.locator('footer').first();
    const footerVisible = await footer.isVisible().catch(() => false);
    console.log(`  Footer visible: ${footerVisible}`);

    // Check for navigation items
    const navItems = await page.locator('nav a, [role="navigation"] a').count();
    console.log(`  Navigation items found: ${navItems}`);

    // Check for campaigns/transactions navigation
    const campaignsNav = await page.locator('a:has-text("Campaign"), a:has-text("Campaigns")').isVisible().catch(() => false);
    const transactionsNav = await page.locator('a:has-text("Transaction"), a:has-text("Transactions")').isVisible().catch(() => false);
    console.log(`  Campaigns link visible: ${campaignsNav}`);
    console.log(`  Transactions link visible: ${transactionsNav}`);

    // Check console errors
    console.log('');
    console.log('🔧 Console diagnostics...');
    console.log(`  Total console messages: ${consoleLogs.length}`);

    const errorLogs = consoleLogs.filter(log => log.type === 'error');
    const warningLogs = consoleLogs.filter(log => log.type === 'warning');

    console.log(`  Errors: ${errorLogs.length}`);
    console.log(`  Warnings: ${warningLogs.length}`);

    if (errorLogs.length > 0) {
      console.log('  🚨 Errors found:');
      errorLogs.forEach(err => {
        console.log(`    - ${err.text}`);
        if (err.text.toLowerCase().includes('firebase')) {
          console.log('      ⚠️  FIREBASE ERROR DETECTED');
        }
      });
    }

    if (pageErrors.length > 0) {
      console.log('  Page errors:');
      pageErrors.forEach(err => {
        console.log(`    - ${err.message}`);
      });
    }

    // Try to navigate to other routes
    console.log('');
    console.log('🔗 Checking navigation...');

    const navLinks = await page.locator('nav a, [role="navigation"] a').all();
    console.log(`  Found ${navLinks.length} navigation links`);

    if (navLinks.length > 0) {
      for (let i = 0; i < Math.min(2, navLinks.length); i++) {
        try {
          const href = await navLinks[i].getAttribute('href');
          const text = await navLinks[i].textContent();
          if (href && !href.startsWith('http')) {
            console.log(`  Attempting to navigate to: ${text.trim()} (${href})`);
            // Don't actually navigate, just check the link exists
          }
        } catch (e) {
          // Skip
        }
      }
    }

    // Get all visible text content for debugging
    const visibleText = await page.textContent('body');
    const visibleLines = visibleText
      .split('\n')
      .filter(line => line.trim().length > 0)
      .slice(0, 20);

    console.log('');
    console.log('📝 First visible text elements:');
    visibleLines.forEach((line, idx) => {
      console.log(`  ${idx + 1}. ${line.trim().substring(0, 80)}`);
    });

    // Get page size info
    const dimensions = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }));

    console.log('');
    console.log('📐 Page dimensions:');
    console.log(`  Viewport: ${dimensions.viewportWidth}x${dimensions.viewportHeight}`);
    console.log(`  Document: ${dimensions.documentWidth}x${dimensions.documentHeight}`);

    // Final assessment
    console.log('');
    console.log('✨ Summary:');
    const issues = [];
    if (!headerVisible) issues.push('Header not visible');
    if (!logoVisible) issues.push('Logo/branding not found');
    if (!connectVisible) issues.push('Connect button not found');
    if (!mainContent) issues.push('Main content area not found');
    if (errorLogs.length > 0) issues.push(`${errorLogs.length} console errors`);
    if (pageErrors.length > 0) issues.push(`${pageErrors.length} page errors`);

    if (issues.length === 0) {
      console.log('  ✅ Page appears to be loading correctly!');
      console.log('  ✅ No critical issues detected');
    } else {
      console.log('  ⚠️  Issues detected:');
      issues.forEach(issue => console.log(`    - ${issue}`));
    }

  } catch (error) {
    console.error('❌ Error during inspection:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await browser.close();
  }

  console.log('');
  console.log(`📸 All screenshots saved to: ${SCREENSHOT_DIR}`);
  console.log('You can view them with: open ' + SCREENSHOT_DIR);
}

runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
