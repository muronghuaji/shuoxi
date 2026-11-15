/**
 * 当前章节查找替换冒烟。运行前需要 `pnpm dev`。
 */
const { chromium } = require('playwright-core')

process.on('unhandledRejection', () => {})

const EDGE =
  process.env.EDGE_PATH ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:5180/'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

;(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto(APP_URL, { waitUntil: 'networkidle' })
  await page.locator('.work-card').first().click()
  await page.waitForSelector('.workspace')
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: '查找替换' }).click()
  await page.waitForSelector('.find-replace')
  const inputs = page.locator('.find-replace input.input')
  await inputs.nth(0).fill('林夏')
  await inputs.nth(1).fill('她')
  await page.waitForTimeout(200)
  const countText = await page.locator('.find-replace-nav > span').innerText()
  assert(/[1-9]/.test(countText), '没有找到匹配项')
  await page.getByRole('button', { name: '全部替换' }).click()
  await page.waitForTimeout(400)
  const body = await page.locator('body').innerText()
  assert(!body.includes('林夏'), '全部替换后仍有旧文本')
  assert(body.includes('她'), '全部替换后没有新文本')
  assert(errors.length === 0, `控制台错误：${errors.join(' | ')}`)

  console.log('E2E find replace passed')
  await page.close().catch(() => undefined)
  await browser.close().catch(() => undefined)
  process.exit(0)
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
