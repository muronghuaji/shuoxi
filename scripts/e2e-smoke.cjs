/**
 * 说戏桌面端 / 浏览器端冒烟测试。
 * 先运行 `pnpm dev`，再运行 `pnpm test:e2e`。
 * Windows 默认使用 Microsoft Edge；可用 EDGE_PATH 覆盖可执行文件路径。
 */
const { chromium } = require('playwright-core')

// Playwright 在关闭页面时偶尔会抛出 TargetClosedError；冒烟测试的结论已经输出，
// 不应因此改变退出码。
process.on('unhandledRejection', (_error) => {})

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
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto(APP_URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('.work-card')
  assert((await page.locator('.work-card').count()) > 0, '首页没有作品卡')

  await page.locator('.rail button[title="设置"]').click()
  await page.waitForSelector('.settings-tabs')
  await page.locator('.settings-tabs button', { hasText: '外观' }).click()
  await page.waitForSelector('.accent-options')
  await page.locator('.ui-scale-option', { hasText: '110%' }).click()
  const appearance = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('shuoxi.appearance.v1')),
  )
  assert(appearance.uiScale === 110, '界面缩放没有保存')

  await page.locator('.settings-tabs button', { hasText: '数据' }).click()
  await page.waitForTimeout(800)
  assert((await page.locator('.backup-snapshot-row').count()) > 0, '没有自动快照')
  const downloadPromise = page.waitForEvent('download')
  await page.locator('.settings-data-actions button', { hasText: '导出项目备份' }).click()
  const download = await downloadPromise
  assert(download.suggestedFilename().endsWith('.json'), '备份下载异常')

  await page.keyboard.press('Escape')
  await page.waitForSelector('.work-card')
  await page.locator('.rail button[title="角色会客厅"]').click()
  await page.waitForSelector('.character-chat-view')
  await page.locator('.rail button[title="书库"]').click()
  await page.waitForSelector('.home')
  await page.waitForTimeout(200)

  assert(errors.length === 0, `控制台错误：${errors.join(' | ')}`)
  console.log('E2E smoke passed')
  await page.close().catch(() => undefined)
  await browser.close().catch(() => undefined)
  process.exit(0)
})().catch(async (error) => {
  console.error(error)
  process.exit(1)
})
