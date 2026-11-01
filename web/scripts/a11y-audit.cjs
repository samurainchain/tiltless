// Accessibility audit of every screen, through a real browser (SPEC section 9, principle 6).
//
// Start the site first (`npm run build && npx vite preview --port 4173`), then:
//   node scripts/a11y-audit.cjs [url]
// Loads a sample journal, then on every screen and sheet, in dark and light themes, checks:
// controls and fields have accessible names, images have alt text, ids are unique, the page
// has a language and one h1, text at 200% size doesn't scroll sideways at phone width (in
// English, Russian and Spanish), and keyboard focus is visible. Exits with an error when
// anything fails.

const { join } = require('node:path')
const { chromium } = require('playwright')

const URL = process.argv[2] ?? 'http://localhost:4173/'
const BACKUP = join(__dirname, 'a11y-sample.json')

/** Runs in the page: problems with names, alt text, ids, lang and headings. */
function inspectPage() {
  const problems = []
  const visible = (el) => {
    // checkVisibility also sees content hidden by a closed <details>.
    if (el.checkVisibility && !el.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true })) return false
    const style = getComputedStyle(el)
    const box = el.getBoundingClientRect()
    return style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0 && box.height > 0 && !el.closest('[aria-hidden="true"]')
  }
  const nameOf = (el) => {
    const labelledBy = el.getAttribute('aria-labelledby')
    if (labelledBy) return labelledBy.split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim()
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim()
    if (el.labels && el.labels.length) return [...el.labels].map((label) => label.textContent).join(' ').trim()
    const text = (el.innerText ?? '').trim() || [...el.querySelectorAll('img[alt]')].map((img) => img.alt).join(' ').trim()
    return text || (el.getAttribute('title') ?? '').trim() || (el.getAttribute('placeholder') ?? '').trim()
  }
  const describe = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''}`

  for (const el of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=radio], [role=progressbar]')) {
    if (!visible(el) && el.type !== 'file') continue
    if (el.type === 'file') continue
    if (!nameOf(el)) problems.push(`unnamed ${describe(el)}`)
  }
  for (const img of document.querySelectorAll('img')) {
    if (visible(img) && !img.hasAttribute('alt')) problems.push(`img without alt: ${img.src.slice(-40)}`)
  }
  const ids = [...document.querySelectorAll('[id]')].map((el) => el.id)
  for (const id of new Set(ids.filter((id, index) => ids.indexOf(id) !== index))) problems.push(`duplicate id: ${id}`)
  if (!document.documentElement.lang) problems.push('html has no lang')
  const h1 = [...document.querySelectorAll('h1')].filter(visible).length
  const dialog = document.querySelector('dialog[open]')
  if (!dialog && h1 !== 1) problems.push(`expected one h1, found ${h1}`)
  return problems
}

async function checkFocus(page) {
  const problems = []
  await page.locator('body').click({ position: { x: 1, y: 1 } }).catch(() => {})
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab')
    const result = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return null
      const style = getComputedStyle(el)
      const outlined = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0
      return { outlined, what: `${el.tagName.toLowerCase()} ${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}` }
    })
    if (result && !result.outlined) problems.push(`no visible focus on ${result.what}`)
  }
  return problems
}

async function main() {
  const browser = await chromium.launch()
  const failures = []
  for (const scheme of ['dark', 'light']) {
    const context = await browser.newContext({ viewport: { width: 360, height: 780 }, colorScheme: scheme, locale: 'en-US' })
    const page = await context.newPage()
    page.on('dialog', (dialog) => dialog.dismiss())
    await page.goto(URL)
    await page.locator('.landing h1').waitFor()
    const report = async (where) => {
      const problems = await page.evaluate(inspectPage)
      for (const problem of problems) failures.push(`[${scheme}] ${where}: ${problem}`)
    }

    // A new visitor at the bare address sees the landing page; its button leads to onboarding.
    await report('landing')
    await page.locator('.landing .button--primary').first().click()
    await page.locator('.onboarding h1').waitFor()
    await report('onboarding')
    await page.locator('.onboarding input[type=file]').setInputFiles(BACKUP)
    await page.getByRole('heading', { name: 'Today', exact: true }).waitFor()

    const routes = ['today', 'trades', 'analytics', 'profile', 'accounts', 'rules', 'review', 'tags', 'partners', 'pro']
    for (const route of routes) {
      await page.goto(`${URL}#/${route}`)
      // Some screens load their code on first visit: wait for the page heading, then let it settle.
      await page.locator('main h1').first().waitFor({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(250)
      await report(route)
    }
    await page.goto(`${URL}#/trades`)
    await page.locator('.trade-row').first().click()
    await page.waitForTimeout(250)
    await report('trade detail')
    // The table view stays on from here, so the 200% text pass below covers it too.
    await page.goto(`${URL}#/trades`)
    await page.getByRole('radio', { name: 'Table' }).click()
    await page.waitForTimeout(250)
    await report('trade table')

    for (const [name, open] of [
      ['entry sheet', () => page.locator('.tabbar .nav-add').click()],
      ['filters sheet', async () => {
        await page.goto(`${URL}#/trades`)
        await page.getByRole('button', { name: 'Filters' }).click()
      }],
      ['trade panel', async () => {
        await page.goto(`${URL}#/trades`)
        await page.locator('.trade-table__open').first().click()
      }],
      ['language menu', async () => {
        await page.goto(`${URL}#/today`)
        await page.getByRole('button', { name: 'Language' }).click()
      }],
      ['notifications', async () => {
        await page.goto(`${URL}#/today`)
        await page.locator('.app-bar__button').last().click()
      }],
      ['feedback popover', async () => {
        await page.goto(`${URL}#/today`)
        await page.getByRole('button', { name: 'Feedback' }).click()
      }],
      ['position size calculator', async () => {
        await page.goto(`${URL}#/today`)
        await page.getByRole('button', { name: 'Calculator' }).click()
        await page.getByLabel('Account balance').fill('10000')
        await page.getByLabel('Entry price').fill('67000')
        await page.getByLabel('Stop loss').fill('66000')
      }],
      ['account sheet', async () => {
        await page.goto(`${URL}#/accounts`)
        await page.getByRole('button', { name: 'Add' }).click()
      }],
    ]) {
      await open()
      await page.waitForTimeout(300)
      await report(name)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(200)
      if (await page.locator('dialog[open]').count()) failures.push(`[${scheme}] ${name}: Escape did not close it`)
    }

    // As after Pro goes on sale (the ?pro=preview tab): the locks and the Pro page.
    await page.goto(`${URL}?pro=preview#/analytics`)
    await page.locator('main h1').first().waitFor({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(300)
    await report('analytics on the free plan')
    await page.goto(`${URL}#/pro`)
    await page.locator('main h1').first().waitFor({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(300)
    await report('pro page')

    // 200% text at phone width must not scroll sideways.
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    for (const route of routes) {
      await page.goto(`${URL}#/${route}`)
      await page.locator('main h1').first().waitFor({ timeout: 5000 }).catch(() => {})
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
      await page.waitForTimeout(200)
      const { overflow, culprit } = await page.evaluate(() => {
        const width = document.documentElement.clientWidth
        // The outermost element sticking out, ignoring ones inside their own scroll area.
        const culprit = [...document.querySelectorAll('body *')].find((el) => {
          if (el.getBoundingClientRect().right <= width + 1) return false
          for (let parent = el.parentElement; parent; parent = parent.parentElement) {
            if (['auto', 'scroll', 'hidden'].includes(getComputedStyle(parent).overflowX)) return false
          }
          return true
        })
        const describe = (el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${(el.textContent ?? '').trim().slice(0, 30)}"`
        return { overflow: document.documentElement.scrollWidth - width, culprit: culprit ? describe(culprit) : '' }
      })
      if (overflow > 1) failures.push(`[${scheme}] ${route} at 200% text: scrolls sideways by ${overflow}px (${culprit})`)
    }

    await page.goto(`${URL}#/today`)
    await page.waitForTimeout(200)
    for (const problem of await checkFocus(page)) failures.push(`[${scheme}] keyboard: ${problem}`)
    await context.close()
  }
  // Russian and Spanish labels run longer: no screen may scroll sideways in them either.
  for (const locale of ['ru-RU', 'es-ES']) {
    const context = await browser.newContext({ viewport: { width: 360, height: 780 }, locale })
    const page = await context.newPage()
    await page.goto(`${URL}#/today`)
    await page.locator('.onboarding input[type=file]').setInputFiles(BACKUP)
    await page.locator('.tabbar .nav-add').waitFor()
    await page.goto(`${URL}#/trades`)
    const detail = await page.locator('.trade-row').first().getAttribute('href')
    for (const textSize of ['100%', '200%']) {
      for (const route of ['today', 'trades', 'analytics', 'profile', 'accounts', 'rules', 'review', 'tags', 'partners', 'pro', detail?.replace(/^#\//, '') ?? 'trades']) {
        await page.goto(`${URL}#/${route}`)
        await page.locator('main h1').first().waitFor({ timeout: 5000 }).catch(() => {})
        await page.addStyleTag({ content: `html { font-size: ${textSize} !important; }` })
        await page.waitForTimeout(200)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        if (overflow > 1) failures.push(`[${locale}] ${route} at ${textSize} text: scrolls sideways by ${overflow}px`)
      }
    }
    await context.close()
  }
  await browser.close()

  const unique = [...new Set(failures)]
  if (unique.length === 0) {
    console.log('No accessibility problems found.')
    return
  }
  console.log(unique.join('\n'))
  console.log(`\n${unique.length} problem(s)`)
  process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
