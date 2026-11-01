// Measures how well the screenshot reader fills the entry form, through the real UI.
//
// Start the site first (`npm run build && npx vite preview --port 4173`), then:
//   node scripts/ocr-fixtures/accuracy.cjs [url]
// For each test-fixtures/ocr/*.png it opens "New trade", picks the screenshot and compares
// the filled fields with expected.json. SPEC section 11 asks for pair and side right in at
// least 80% of screenshots; the script exits with an error below that.

const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { chromium } = require('playwright')

const URL = process.argv[2] ?? 'http://localhost:4173/'
const DIR = join(__dirname, '../../test-fixtures/ocr')
const TARGET = 0.8

async function main() {
  const expected = JSON.parse(readFileSync(join(DIR, 'expected.json'), 'utf8'))
  const browser = await chromium.launch()
  const page = await (await browser.newContext({ viewport: { width: 430, height: 900 }, locale: 'en-US' })).newPage()
  // Straight into the app (#/today): the bare address shows the landing page first.
  await page.goto(`${URL}#/today`)

  // Skip onboarding, then one crypto perpetuals account to log against.
  await page.getByRole('button', { name: 'Skip' }).click()
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByLabel('Name').fill('OCR test')
  await page.getByRole('button', { name: 'Save' }).click()

  const fields = ['symbol', 'side', 'entryPrice', 'exitPrice', 'quantity']
  const hits = Object.fromEntries(fields.map((field) => [field, 0]))
  let pairAndSide = 0

  for (const item of expected) {
    await page.locator('.tabbar .nav-add').click()
    const sheet = page.locator('.sheet')
    await sheet.locator('.screenshot-start input[type=file]').setInputFiles(join(DIR, item.file))
    await sheet.locator('.screenshot-start [role=status]').filter({ hasNotText: /Reading/ }).waitFor({ timeout: 120_000 })
    const status = await sheet.locator('.screenshot-start [role=status]').innerText()

    const number = (value) => (value ? String(Number(value)) : '')
    const got = {
      symbol: await sheet.getByLabel('Symbol', { exact: true }).inputValue(),
      side: (await sheet.getByRole('radiogroup', { name: 'Direction' }).getByRole('radio', { checked: true }).innerText()).toLowerCase(),
      entryPrice: number(await sheet.getByLabel('Entry price').inputValue()),
      exitPrice: number(await sheet.getByLabel('Exit price').inputValue()),
      quantity: number(await sheet.getByRole('textbox', { name: /^Size/ }).inputValue()),
    }
    const want = { ...item, entryPrice: number(item.entryPrice), exitPrice: number(item.exitPrice), quantity: number(item.quantity) }
    const misses = fields.filter((field) => got[field] !== want[field])
    for (const field of fields) if (!misses.includes(field)) hits[field] += 1
    if (!misses.includes('symbol') && !misses.includes('side')) pairAndSide += 1
    console.log(`${misses.length ? '✗' : '✓'} ${item.file}${misses.length ? `  ${misses.map((f) => `${f}: got "${got[f]}" want "${want[f]}"`).join('; ')}` : ''}${/Couldn/.test(status) ? `  (${status})` : ''}`)

    await page.keyboard.press('Escape')
  }

  const total = expected.length
  console.log('')
  for (const field of fields) console.log(`${field.padEnd(11)} ${hits[field]}/${total} (${Math.round((hits[field] / total) * 100)}%)`)
  const rate = pairAndSide / total
  console.log(`pair + side ${pairAndSide}/${total} (${Math.round(rate * 100)}%), target ${TARGET * 100}%`)
  await browser.close()
  if (rate < TARGET) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
