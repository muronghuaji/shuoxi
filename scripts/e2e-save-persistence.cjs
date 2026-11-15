/**
 * 正文保存冒烟：编辑 → 保存 → 刷新 → 重新打开作品 → 内容仍在。
 * 运行前需要 `pnpm dev`。
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
  assert(
    (await page.locator('.ws-saved').innerText()).includes('已保存'),
    '初始保存状态不是已保存',
  )

  await page.getByRole('button', { name: '编辑正文' }).click()
  await page.waitForTimeout(250)
  const editor = page.locator('.manuscript-inline-textarea')
  const marker = `持久化测试-${Date.now()}`
  await editor.fill(`${await editor.inputValue()}\n\n${marker}`)
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: '保存正文' }).first().click()
  await page.waitForTimeout(2500)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  await page.locator('.work-card').first().click()
  await page.waitForSelector('.workspace')
  await page.waitForTimeout(600)
  assert((await page.locator('body').innerText()).includes(marker), '刷新后正文标记丢失')
  assert(errors.length === 0, `控制台错误：${errors.join(' | ')}`)

  console.log('E2E save persistence passed')
  await page.close().catch(() => undefined)
  await browser.close().catch(() => undefined)
  process.exit(0)
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
