const { app, BrowserWindow, Menu, dialog, shell, nativeTheme, ipcMain, net } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const {
  APP_ORIGIN,
  registerAppScheme,
  installAppProtocol,
} = require('./appProtocol.cjs')

const isDev = process.argv.includes('--dev')
const isSmokeTest = process.argv.includes('--smoke-test')
const devUrl = process.env.SHUOXI_DEV_URL || 'http://127.0.0.1:5180'

registerAppScheme()


// 纯净版：与日常开发/个人书库隔离，使用独立的 userData。
// 发布时在纯净版目录放置 .clean-profile 标记文件，双击也会自动进入干净档案。
const cleanProfileFlag =
  process.env.SHUOXI_CLEAN_PROFILE === '1' || process.argv.includes('--clean-profile')
let cleanProfileMarker = false
try {
  cleanProfileMarker = fs.existsSync(path.join(path.dirname(app.getPath('exe')), '.clean-profile'))
} catch {
  cleanProfileMarker = false
}
if (cleanProfileFlag || cleanProfileMarker) {
  app.setPath('userData', path.join(app.getPath('appData'), 'Shuoxi-Clean'))
  console.log('[profile] clean userData')
} else {
  // 旧版本把「说戏」按错误编码写进了应用名，实际用户数据在
  // %APPDATA%\璇存垙。升级时复制到稳定的 Shuoxi 目录，避免书库丢失。
  const appData = app.getPath('appData')
  const canonical = path.join(appData, 'Shuoxi')
  const legacyCandidates = [
    path.join(appData, '璇存垙'),
    path.join(appData, '说戏'),
  ]
  if (!fs.existsSync(canonical)) {
    for (const legacy of legacyCandidates) {
      if (!fs.existsSync(legacy)) continue
      try {
        fs.cpSync(legacy, canonical, { recursive: true })
        console.log('[profile] migrated legacy userData', legacy, '->', canonical)
        break
      } catch (error) {
        console.error('[profile] legacy userData migration failed', error)
      }
    }
  }
  const fallbackLegacy = legacyCandidates.find((candidate) => fs.existsSync(candidate))
  const userDataDir = fs.existsSync(canonical) ? canonical : fallbackLegacy || canonical
  app.setPath('userData', userDataDir)
  app.setName('说戏')
  console.log('[profile] userData', userDataDir)
}

function ensureWindowsShortcuts() {
  if (process.platform !== 'win32' || !app.isPackaged || isSmokeTest || cleanProfileFlag || cleanProfileMarker) {
    return
  }
  if (process.execPath.includes('win-unpacked')) return
  const shortcut = {
    target: process.execPath,
    cwd: path.dirname(process.execPath),
    description: '说戏',
    icon: process.execPath,
    iconIndex: 0,
  }
  const startMenu = path.join(
    app.getPath('appData'),
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
  )
  const locations = [app.getPath('desktop'), startMenu]
  for (const directory of locations) {
    try {
      fs.mkdirSync(directory, { recursive: true })
      const stale = path.join(directory, '璇存垙.lnk')
      if (fs.existsSync(stale)) fs.rmSync(stale, { force: true })
      const link = path.join(directory, '说戏.lnk')
      if (fs.existsSync(link)) {
        const updated = shell.writeShortcutLink(link, 'update', shortcut)
        if (!updated) shell.writeShortcutLink(link, 'create', shortcut)
      } else {
        shell.writeShortcutLink(link, 'create', shortcut)
      }
    } catch (error) {
      console.error('[shortcut] failed', directory, error)
    }
  }
}

// 固定回环端口已移除：生产版通过 app:// 自定义协议读取 dist。
// 开发模式仍使用 Vite 的 devUrl，不受影响。
let mainWindow = null
let protocolInstalled = false

async function ensureAppProtocol() {
  if (protocolInstalled) return
  const distDir = path.join(__dirname, '..', 'dist')
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    throw new Error('未找到 dist，请先执行 npm run build')
  }
  await installAppProtocol(distDir)
  protocolInstalled = true
}

function windowFromEvent(event) {
  return BrowserWindow.fromWebContents(event.sender)
}

ipcMain.on('window:minimize', (event) => {
  windowFromEvent(event)?.minimize()
})

ipcMain.on('window:toggle-maximize', (event) => {
  const window = windowFromEvent(event)
  if (!window) return
  if (window.isMaximized()) window.unmaximize()
  else window.maximize()
})

ipcMain.on('window:close', (event) => {
  windowFromEvent(event)?.close()
})

ipcMain.handle('window:is-maximized', (event) => {
  return windowFromEvent(event)?.isMaximized() ?? false
})

const BALANCE_TTL_MS = 10 * 60 * 1000
const balanceCache = new Map()

function numberFrom(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

ipcMain.handle('billing:balance', async (_event, payload = {}) => {
  const baseUrl = typeof payload.baseUrl === 'string' ? payload.baseUrl.trim() : ''
  const apiKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : ''
  const provider = typeof payload.provider === 'string' ? payload.provider : 'deepseek'
  const force = payload.force === true
  if (!baseUrl || !apiKey) return { ok: false, reason: 'missing-config' }
  if (provider !== 'deepseek') return { ok: false, reason: 'unsupported' }
  let origin
  try {
    origin = new URL(baseUrl).origin
  } catch {
    return { ok: false, reason: 'bad-url' }
  }
  const cacheKey = origin + '|' + apiKey
  const cached = balanceCache.get(cacheKey)
  if (!force && cached && Date.now() - cached.at < BALANCE_TTL_MS) {
    return { ok: true, balance: { ...cached.balance, cached: true } }
  }
  try {
    const response = await net.fetch(origin + '/user/balance', {
      headers: { Authorization: 'Bearer ' + apiKey, accept: 'application/json' },
    })
    if (!response.ok) return { ok: false, reason: 'http-' + response.status }
    const data = await response.json()
    const infos = Array.isArray(data.balance_infos) ? data.balance_infos : []
    const balances = []
    for (const info of infos) {
      if (!info || typeof info !== 'object') continue
      const currency = typeof info.currency === 'string' ? info.currency : ''
      const total = numberFrom(info.total_balance)
      const granted = numberFrom(info.granted_balance)
      const toppedUp = numberFrom(info.topped_up_balance)
      if (!currency || total === null || granted === null || toppedUp === null) continue
      balances.push({ currency, total, granted, toppedUp })
    }
    if (balances.length === 0) return { ok: false, reason: 'empty' }
    const balance = {
      isAvailable: data.is_available === true || balances.some((item) => item.total > 0),
      balances,
      fetchedAt: Date.now(),
      cached: false,
    }
    balanceCache.set(cacheKey, { at: Date.now(), balance })
    return { ok: true, balance }
  } catch (error) {
    return { ok: false, reason: 'network', message: error instanceof Error ? error.message : String(error) }
  }
})

function syncQueuePath() {
  return path.join(app.getPath('userData'), 'sync-queue.json')
}

ipcMain.on('queue:save-sync', (event, payload) => {
  try {
    const file = syncQueuePath()
    if (typeof payload !== 'string' || !payload.trim()) {
      try {
        fs.unlinkSync(file)
      } catch {
        // 文件不存在时无需处理
      }
      event.returnValue = true
      return
    }
    const temp = `${file}.tmp`
    fs.writeFileSync(temp, payload, 'utf8')
    fs.renameSync(temp, file)
    event.returnValue = true
  } catch {
    event.returnValue = false
  }
})

ipcMain.handle('queue:load', async () => {
  try {
    return await fs.promises.readFile(syncQueuePath(), 'utf8')
  } catch {
    return ''
  }
})

async function createWindow() {
  const url = isDev && !isSmokeTest ? devUrl : `${APP_ORIGIN}/index.html`
  await ensureAppProtocol()
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0a0a0c' : '#f3eee5',
    title: '说戏',
    frame: false,
    thickFrame: true,
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  })

  Menu.setApplicationMenu(null)

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized-changed', true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized-changed', false)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/i.test(target)) shell.openExternal(target)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
    console.error(`[window] load failed ${code}: ${description}`)
  })

  await mainWindow.loadURL(url)

  if (isSmokeTest) {
    const output = path.join(process.cwd(), 'electron-smoke.png')
    setTimeout(async () => {
      try {
        const image = await mainWindow.webContents.capturePage()
        fs.writeFileSync(output, image.toPNG())
        console.log(`[smoke] screenshot: ${output}`)
      } catch (error) {
        console.error('[smoke] capture failed', error)
      }
      app.quit()
    }, 1800)
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.setAppUserModelId('com.shuoxi.app')

  app.whenReady().then(() => {
    ensureWindowsShortcuts()
    createWindow().catch((error) => {
      console.error('[app] failed to start', error)
      dialog.showErrorBox(
        '说戏启动失败',
        error instanceof Error ? error.message : String(error),
      )
      app.quit()
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })

    nativeTheme.on('updated', () => {
      if (!mainWindow) return
      const dark = nativeTheme.shouldUseDarkColors
      mainWindow.setBackgroundColor(dark ? '#0a0a0c' : '#f3eee5')
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    // app:// 协议不需要关闭端口或服务。
  })
}
