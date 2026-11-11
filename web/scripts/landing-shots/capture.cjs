// Screenshots of the real app for the landing page (public/landing/<locale>-<screen>.webp), taken
// from the demo journal (demo-journal.json, the October 2026 demo month the reels use) on the
// evening of Oct 26, with a $300 daily loss limit and 6 trades a day.
//
// Pro screens must be open, so serve a build with PRO_ON_SALE = false (src/app/billing.ts):
//   sed -i 's/export const PRO_ON_SALE = true/export const PRO_ON_SALE = false/' src/app/billing.ts
//   npx vite build --outDir /tmp/tiltless-unlocked --emptyOutDir; git checkout src/app/billing.ts
//   npx vite preview --outDir /tmp/tiltless-unlocked --port 4175 &
//   node scripts/landing-shots/capture.cjs http://localhost:4175
const { chromium } = require('playwright')
const path = require('path')
const { execFileSync } = require('child_process')

const BASE = process.argv[2] || 'http://localhost:4175'
const OUT = path.join(__dirname, '../../public/landing')
const DEMO = path.join(__dirname, 'demo-journal.json')
const LOCALES = { en: 'en-US', ru: 'ru-RU', es: 'es-MX' }
const LIMIT_LABEL = { en: /daily loss limit/i, ru: /лимит убытка за день/i, es: /límite de pérdida diaria/i }
const TRADES_LABEL = { en: /trades per day/i, ru: /сделок в день/i, es: /operaciones por día/i }

;(async () => {
  const browser = await chromium.launch()
  for (const [lang, locale] of Object.entries(LOCALES)) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale, colorScheme: 'dark', timezoneId: 'UTC' })
    const page = await context.newPage()
    await page.clock.setFixedTime(new Date('2026-10-26T20:40:00Z'))
    await page.goto(`${BASE}/app/`)
    await page.evaluate((language) => localStorage.setItem('mirror.settings', JSON.stringify({ language, style: 'glow', glowStyle: true, accent: 'green' })), lang)
    await page.goto(`${BASE}/app/`)
    await page.locator('.onboarding input[type=file]').setInputFiles(DEMO)
    await page.waitForTimeout(1500)

    await page.goto(`${BASE}/app/#/rules`)
    await page.locator('main h1').waitFor()
    await page.getByLabel(LIMIT_LABEL[lang]).first().fill('300')
    await page.keyboard.press('Tab')
    await page.getByLabel(TRADES_LABEL[lang]).first().fill('6')
    await page.keyboard.press('Tab')
    await page.waitForTimeout(800)

    const shoot = async (name, hash, scrollTo) => {
      await page.goto(`${BASE}/app/#/${hash}`)
      await page.locator('main h1').waitFor()
      await page.waitForTimeout(1200)
      if (scrollTo) {
        await page.locator(scrollTo).first().evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 24))
        await page.waitForTimeout(500)
      }
      const png = path.join(OUT, `${lang}-${name}.png`)
      await page.screenshot({ path: png })
      execFileSync('python3', ['-c', `from PIL import Image; Image.open('${png}').save('${png.replace('.png', '.webp')}', quality=80, method=6)`])
      require('fs').unlinkSync(png)
    }
    await shoot('analytics', 'analytics', '[data-widget=mistakeCost]')
    await shoot('today', 'today')
    await shoot('trades', 'trades')
    await shoot('rules', 'rules')
    await context.close()
    console.log(lang, 'done')
  }
  await browser.close()
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
