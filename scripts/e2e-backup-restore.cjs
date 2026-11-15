/**
 * 备份导出 → 导入恢复冒烟测试。
 * 运行前需要 `pnpm dev`；与 e2e-smoke.cjs 共用 Edge 路径。
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { chromium } = require('playwright-core')

// Playwright 关闭页面时偶尔抛 TargetClosedError，不影响已经完成的断言。
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
  await page.waitForSelector('.work-card')
  const beforeCount = await page.locator('.work-card').count()

  await page.locator('.rail button[title="设置"]').click()
  await page.waitForSelector('.settings-tabs')
  await page.locator('.settings-tabs button', { hasText: '数据' }).click()
  await page.waitForSelector('.settings-data-actions')
  await page.waitForTimeout(600)

  const downloadPromise = page.waitForEvent('download')
  await page.locator('.settings-data-actions button', { hasText: '导出项目备份' }).click()
  const download = await downloadPromise
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shuoxi-backup-e2e-'))
  const backupPath = path.join(tempDir, 'backup.json')
  await download.saveAs(backupPath)
  assert(fs.existsSync(backupPath), '备份文件没有下载成功')
  const parsed = JSON.parse(fs.readFileSync(backupPath, 'utf8'))
  assert(parsed.format === 'shuoxi-project', '备份不是 shuoxi-project')
  assert(Array.isArray(parsed.works), '备份没有作品数组')

  page.once('dialog', (dialog) => {
    assert(dialog.type() === 'confirm', '导入没有弹出确认框')
    void dialog.accept()
  })
  const fileInput = page.locator('.settings-data-actions input[type="file"]').last()
  await fileInput.setInputFiles(backupPath)
  await page.waitForTimeout(1200)
  await page.waitForSelector('.home', { timeout: 5000 }).catch(() => undefined)

  const afterCount = await page.locator('.work-card').count()
  assert(afterCount === beforeCount, `恢复后作品数变化：${beforeCount} → ${afterCount}`)
  assert(errors.length === 0, `控制台错误：${errors.join(' | ')}`)

  console.log(`E2E backup restore passed (${afterCount} works)`)
  fs.rmSync(tempDir, { recursive: true, force: true })
  await page.close().catch(() => undefined)
  await browser.close().catch(() => undefined)
  process.exit(0)
})().catch(async (error) => {
  console.error(error)
  process.exit(1)
})
