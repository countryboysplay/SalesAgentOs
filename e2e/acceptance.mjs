/**
 * SalesTrack — end-to-end acceptance run against a real browser.
 *
 * Covers the scenarios spec §77 says the product is not complete without,
 * plus a boot and navigation sweep. Everything here exercises the built app
 * the way an agent would: taps, typing, reloads, and the network switched off.
 *
 *   node e2e/acceptance.mjs [url]
 */
import { chromium } from 'playwright'

const URL = process.argv[2] ?? 'http://127.0.0.1:4175/'
const HEADED = process.env.HEADED === '1'

let pass = 0
let fail = 0
const failures = []

function check(name, ok, detail = '') {
  if (ok) {
    pass += 1
    console.log(`  PASS  ${name}`)
  } else {
    fail += 1
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const browser = await chromium.launch({ headless: !HEADED })
const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await context.newPage()

const consoleErrors = []
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text())
})
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))

const body = () => page.locator('body').innerText()

async function clickByName(pattern) {
  const target = page.getByRole('button', { name: pattern })
  if ((await target.count()) === 0) return false
  await target.first().click()
  return true
}

async function completeOnboarding() {
  await page.goto(URL, { waitUntil: 'networkidle' })
  await clickByName(/set up my tracker/i)

  // Step 1 — name
  await page.fill('#ob-name', 'Jonathan')
  await clickByName(/^Continue$/)

  // Step 2 — goals. Each toggle reveals its own amount field.
  const goals = [
    [/daily goal, currently off/i, '500'],
    [/monthly goal, currently off/i, '10000'],
    [/annual goal, currently off/i, '120000'],
  ]
  for (const [label, value] of goals) {
    const toggle = page.getByRole('button', { name: label })
    if (await toggle.count()) {
      await toggle.first().click()
      await page.waitForTimeout(150)
      const field = page.locator('input:visible').last()
      if (await field.count()) await field.fill(value)
    }
  }
  await clickByName(/^Continue$/)

  // Step 3 — commission
  await page.waitForTimeout(200)
  await clickByName(/^Yes/)
  const rate = page.locator('input:visible').last()
  if (await rate.count()) await rate.fill('5')
  await clickByName(/^Continue$/)

  // Step 4 — work schedule, Mon-Fri by default
  await page.waitForTimeout(200)
  await clickByName(/^Continue$/)

  // Step 5 — finish
  await page.waitForTimeout(200)
  await clickByName(/start tracking/i)
  await page.waitForTimeout(800)
}

/**
 * `dollars` is what the agent means to record. The keypad is cents-style, the
 * way a card terminal is — digits fill in from the right, so $389.00 is typed
 * 3-8-9-0-0. Convert here so the tests read in real money.
 */
async function recordSale(dollars) {
  const fab = page.getByRole('button', { name: /add a sale|\+ ?sale|add sale/i })
  if ((await fab.count()) === 0) return false
  await fab.first().click()
  await page.waitForTimeout(400)
  const digits = String(Math.round(dollars * 100))
  for (const ch of digits) {
    // Escape only what regex actually treats as special. Blanket-escaping a
    // digit produces a backreference (\3), which matches nothing.
    const literal = ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const key = page.getByRole('button', { name: new RegExp(`^${literal}$`) })
    if (await key.count()) await key.first().click()
  }
  const saved = await clickByName(/record sale/i)
  await page.waitForTimeout(700)
  return saved
}

console.log(`\nSalesTrack acceptance run — ${URL}\n`)

console.log('Boot')
await page.goto(URL, { waitUntil: 'networkidle' })
check('app renders', (await page.locator('#root > *').count()) > 0)
check('welcome copy present (§7)', (await body()).includes('Track the number that matters'))
check('no server language (§61)', !/connecting|syncing|fetching account/i.test(await body()))

console.log('\nOnboarding (§7-8)')
await completeOnboarding()
const afterOnboarding = await body()
check('reaches the dashboard', !afterOnboarding.includes('Track the number that matters'))
check('greets the agent by name (§9)', /jonathan/i.test(afterOnboarding))
check('shows the empty state (§57)', /nothing on the board/i.test(afterOnboarding))

console.log('\nRecord a sale (§14)')
await recordSale(389)
const afterSale = await body()
check('today total reflects the sale', afterSale.includes('$389'))
check('empty state cleared', !/nothing on the board/i.test(afterSale))

console.log('\nPersistence Test (§77)')
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(800)
const afterReload = await body()
check('sale survives a reload', afterReload.includes('$389'))
check('does not return to onboarding', !afterReload.includes('Track the number that matters'))

console.log('\nOffline Test (§77)')
await context.setOffline(true)
await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
// The shell comes from the service worker, then the store hydrates from
// IndexedDB. Wait for a real signal rather than a guess at how long that takes.
await page.getByRole('button', { name: /add a sale|\+ ?sale|add sale/i }).first().waitFor({ timeout: 15000 }).catch(() => {})
const offlineText = await body().catch(() => '')
check('app loads with the network off', offlineText.includes('$389'))
check('no offline error screen (§37)', !/you are offline|no connection|failed to fetch/i.test(offlineText))
await recordSale(214).catch(() => {})
const offlineAfterSale = await body().catch(() => '')
check('records a sale while offline', offlineAfterSale.includes('$214') || offlineAfterSale.includes('$603'))
await context.setOffline(false)

console.log('\nNavigation (§6)')
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(700)
for (const tab of ['Sales', 'Insights', 'Settings', 'Home']) {
  const re = new RegExp(`^${tab}$`, 'i')
  const link = page.getByRole('link', { name: re }).or(page.getByRole('button', { name: re }))
  if (await link.count()) {
    await link.first().click()
    await page.waitForTimeout(500)
    const t = await body()
    check(`${tab} renders`, t.length > 40 && !/something went wrong|unexpected error/i.test(t))
  } else {
    check(`${tab} nav item present`, false, 'not found')
  }
}

console.log('\nAppearance (§45)')
for (const theme of ['dark', 'light']) {
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
  await page.waitForTimeout(250)
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  check(`${theme} theme paints a background`, bg !== 'rgba(0, 0, 0, 0)' && bg !== '', bg)
}

console.log('\nRuntime health')
// navigator.vibrate is the §53 haptic. Chrome refuses it outside the user
// activation window and logs that refusal as an error; a synthetic click does
// not hold activation the way a real tap does, so this is a harness artefact,
// not an app fault. Everything else counts.
const IGNORABLE = /favicon|manifest|404|sw\.js|navigator\.vibrate/i
const realErrors = consoleErrors.filter((e) => !IGNORABLE.test(e))
check('no console errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | '))

await browser.close()

console.log(`\n${pass} passed, ${fail} failed`)
if (failures.length) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
}
process.exit(fail === 0 ? 0 : 1)
