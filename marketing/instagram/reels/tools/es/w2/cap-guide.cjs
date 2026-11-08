const { chromium } = require('playwright');
const DEMO = __dirname + '/../../checkin-story.json';
const O = __dirname + '/guide/';
(async () => {
  const b = await chromium.launch();
  const mk = async () => (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'es-MX', colorScheme: 'dark', timezoneId: 'UTC' })).newPage();
  // Landing page, whole.
  let page = await mk();
  await page.goto('http://localhost:4175/'); await page.waitForTimeout(2500);
  await page.screenshot({ path: O + 'landing-full.png', fullPage: true });
  const dims = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, secs: [...document.querySelectorAll('section, header, footer')].map((e) => { const r = e.getBoundingClientRect(); return [e.tagName, (e.querySelector('h1,h2')?.innerText || '').slice(0, 50), Math.round(r.y + scrollY), Math.round(r.height)] }) }));
  console.log('landing', JSON.stringify(dims));
  // Onboarding, step by step. Venue names are blurred: no exchange names in ads.
  page = await mk();
  await page.goto('http://localhost:4175/app/'); await page.locator('.onboarding').waitFor(); await page.waitForTimeout(900);
  await page.addStyleTag({ content: '.onboarding .chip-row { filter: blur(7px) }' });
  const shot = async (n) => { await page.waitForTimeout(450); await page.screenshot({ path: O + `ob-${n}.png` }) };
  await shot('0-welcome');
  await page.getByRole('button', { name: 'Empezar' }).click(); await shot('1-goal');
  await page.getByRole('button', { name: 'Dejar de perder dinero' }).click(); await shot('1-goal-on');
  await page.getByRole('button', { name: 'Siguiente' }).click(); await shot('2-markets');
  await page.getByRole('button', { name: 'Cripto futuros' }).click(); await shot('2-markets-on');
  await page.getByRole('button', { name: 'Siguiente' }).click(); await shot('3-weak');
  await page.getByRole('button', { name: 'Entradas por FOMO' }).click(); await page.waitForTimeout(250);
  await page.getByRole('button', { name: 'Operar por revancha tras una pérdida' }).click(); await shot('3-weak-on');
  await page.getByRole('button', { name: 'Siguiente' }).click(); await shot('4-freq');
  const opts = page.locator('.onboarding__option'); await opts.nth(1).click(); await shot('4-freq-on');
  await page.getByRole('button', { name: 'Siguiente' }).click(); await page.waitForTimeout(600); await shot('5-insight');
  await page.getByRole('button', { name: 'Siguiente' }).click(); await shot('6-notif');
  const ob = await page.evaluate(() => { const e = document.querySelector('.onboarding'); const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] });
  console.log('onboarding box', JSON.stringify(ob));
  // The journal with the demo month.
  page = await mk();
  await page.goto('http://localhost:4175/app/'); await page.locator('.onboarding input[type=file]').setInputFiles(DEMO); await page.waitForTimeout(1500);
  for (const [name, hash] of [['today', 'today'], ['trades', 'trades'], ['review', 'review']]) {
    await page.goto('http://localhost:4175/app/#/' + hash); await page.locator('main h1').waitFor(); await page.waitForTimeout(1300);
    await page.screenshot({ path: O + `${name}-full.png`, fullPage: true });
    console.log(name, await page.evaluate(() => document.documentElement.scrollHeight), (await page.locator('main').innerText()).replace(/\n/g, ' | ').slice(0, 400));
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
