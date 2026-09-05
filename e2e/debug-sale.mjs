import { chromium } from 'playwright'

const URL = process.argv[2] ?? 'http://127.0.0.1:4180/'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message))

await page.goto(URL, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /set up my tracker/i }).click()
await page.fill('#ob-name', 'Jonathan')
await page.getByRole('button', { name: /^Continue$/ }).click()
await page.getByRole('button', { name: /daily goal, currently off/i }).first().click()
await page.waitForTimeout(150)
await page.locator('input:visible').last().fill('500')
await page.getByRole('button', { name: /^Continue$/ }).click()
await page.waitForTimeout(200)
await page.getByRole('button', { name: /^Yes/ }).first().click()
await page.locator('input:visible').last().fill('5')
await page.getByRole('button', { name: /^Continue$/ }).click()
await page.waitForTimeout(200)
await page.getByRole('button', { name: /^Continue$/ }).click()
await page.waitForTimeout(200)
await page.getByRole('button', { name: /start tracking/i }).click()
await page.waitForTimeout(800)

await page.getByRole('button', { name: /\+ ?sale|add sale/i }).first().click()
await page.waitForTimeout(500)

const dialog = page.getByRole('dialog')
console.log('dialogs:', await dialog.count())
console.log('=== SHEET (before typing) ===')
console.log((await dialog.first().innerText()).replace(/\n{2,}/g, '\n').slice(0, 500))

console.log('\n--- keypad buttons ---')
const keys = await dialog.first().getByRole('button').evaluateAll((ns) =>
  ns.map((n) => `${(n.getAttribute('aria-label') || n.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 30)}`),
)
console.log(keys.filter(Boolean).join(' | '))

for (const ch of '389') {
  await page.getByRole('button', { name: new RegExp(`^${ch}$`) }).first().click()
  await page.waitForTimeout(120)
}

console.log('\n=== SHEET (after 3,8,9) ===')
console.log((await dialog.first().innerText()).replace(/\n{2,}/g, '\n').slice(0, 400))

await page.getByRole('button', { name: /record sale/i }).click()
await page.waitForTimeout(900)

const text = (await page.locator('body').innerText()).replace(/\n{2,}/g, '\n')
console.log('\n=== HOME AFTER SALE (TODAY block) ===')
const i = text.indexOf('TODAY')
console.log(text.slice(i, i + 320))

await browser.close()
