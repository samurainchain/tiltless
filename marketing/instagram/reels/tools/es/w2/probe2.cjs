const { chromium } = require('playwright');
const DEMO = __dirname + '/../../checkin-story.json';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'es-MX', colorScheme: 'dark', timezoneId: 'UTC' });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4175/app/'); await page.locator('.onboarding input[type=file]').setInputFiles(DEMO); await page.waitForTimeout(1500);
  await page.goto('http://localhost:4175/app/#/analytics'); await page.locator('main h1').waitFor(); await page.waitForTimeout(1000); await page.getByRole('radio', { name: /todo/i }).first().click(); await page.waitForTimeout(1200); console.log('period', await page.locator('[role=radio][aria-checked=true]').first().innerText());
  const box = (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => { const r = e.getBoundingClientRect(); return [e.innerText.replace(/\n/g, ' ').slice(0, 50), Math.round(r.x), Math.round(r.y + scrollY), Math.round(r.width), Math.round(r.height)] }), sel);
  console.log('mc', JSON.stringify(await box('[data-widget=mistakeCost] .bar-list__row, [data-widget=mistakeCost] .mistake-cost__total, [data-widget=mistakeCost] p')));
  console.log('perf', JSON.stringify(await box('[data-widget=performance] .pnl--hero, [data-widget=performance] .dash-stat')));
  const hr = await page.evaluate(() => { const w = document.querySelector('[data-widget=byHour]'); return [...w.querySelectorAll('*')].filter((e) => e.children.length === 0 || e.tagName === 'rect').slice(0, 400).map((e) => { const r = e.getBoundingClientRect(); return [e.tagName, e.getAttribute('class') || '', (e.textContent || '').slice(0, 20), Math.round(r.x), Math.round(r.y + scrollY), Math.round(r.width), Math.round(r.height)] }).filter((x) => x[5] > 0) })
  console.log('hour', JSON.stringify(hr.filter((x) => /column--/.test(x[1]) || x[1] === 'dash-widget__title')));
  await page.screenshot({ path: 'shots/analytics-full.png', fullPage: true });
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
