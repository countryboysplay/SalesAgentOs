import { chromium } from 'playwright'

const URL = process.argv[2] ?? 'http://127.0.0.1:4180/'
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await context.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message))
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()) })

async function onboard() {
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
}

async function recordSale(dollars) {
  const fab = page.getByRole('button', { name: /\+ ?sale|add sale/i })
  console.log('  FAB count:', await fab.count())
  if (!(await fab.count())) return
  await fab.first().click()
  await page.waitForTimeout(500)
  const dlg = page.getByRole('dialog')
  console.log('  dialog count:', await dlg.count())
  for (const ch of String(Math.round(dollars * 100))) {
    const k = page.getByRole('button', { name: new RegExp(`^${ch}$`) })
    if (await k.count()) await k.first().click()
    await page.waitForTimeout(80)
  }
  if (await dlg.count()) {
    console.log('  amount shown:', (await dlg.first().innerText()).split('\n').slice(1, 4).join(' '))
  }
  const rec = page.getByRole('button', { name: /record sale/i })
  console.log('  record button count:', await rec.count())
  if (await rec.count()) await rec.first().click()
  await page.waitForTimeout(900)
}

await onboard()
console.log('\n--- ONLINE sale $389 ---')
await recordSale(389)

console.log('\n--- GOING OFFLINE ---')
await context.setOffline(true)
await page.reload({ waitUntil: 'domcontentloaded' }).catch((e) => console.log('reload err:', e.message))
await page.waitForTimeout(2000)

const t1 = (await page.locator('body').innerText()).replace(/\n{2,}/g, '\n')
console.log('offline boot, TODAY block:')
console.log(t1.slice(t1.indexOf('TODAY'), t1.indexOf('TODAY') + 120))

console.log('\n--- OFFLINE sale $214 ---')
await recordSale(214)

const t2 = (await page.locator('body').innerText()).replace(/\n{2,}/g, '\n')
console.log('\nafter offline sale, TODAY block:')
console.log(t2.slice(t2.indexOf('TODAY'), t2.indexOf('TODAY') + 160))
console.log('\ncontains $603?', t2.includes('$603'), ' contains $214?', t2.includes('$214'))

console.log('\n--- RELOAD STILL OFFLINE (does it persist?) ---')
await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
await page.waitForTimeout(1800)
const t3 = (await page.locator('body').innerText()).replace(/\n{2,}/g, '\n')
console.log(t3.slice(t3.indexOf('TODAY'), t3.indexOf('TODAY') + 160))

await browser.close()
