const { chromium } = require('playwright');
const DEMO = __dirname + '/../../checkin-story.json';
const O = __dirname + '/guide/';
(async () => {
  const b = await chromium.launch();
  const page = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'es-MX', colorScheme: 'dark', timezoneId: 'UTC' })).newPage();
  await page.goto('http://localhost:4175/app/'); await page.locator('.onboarding input[type=file]').setInputFiles(DEMO); await page.waitForTimeout(1500);
  await page.goto('http://localhost:4175/app/#/review/2026-10-26'); await page.locator('main h1').waitFor(); await page.waitForTimeout(1200);
  const habit = page.getByText('Hábito a corregir la próxima semana').first();
  await habit.scrollIntoViewIfNeeded();
  const box = async (l) => { const r = await l.boundingBox(); const y = await page.evaluate(() => scrollY); return [Math.round(r.x), Math.round(r.y + y), Math.round(r.width), Math.round(r.height)] };
  console.log('habit label', JSON.stringify(await box(habit)));
  const sel = page.locator('main select:has(option[value="system-revengeTrading"])').last();
  await sel.selectOption('system-revengeTrading'); await page.waitForTimeout(500);
  console.log('select', JSON.stringify(await box(sel)));
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(300);
  await page.screenshot({ path: O + 'review-full.png', fullPage: true });
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
