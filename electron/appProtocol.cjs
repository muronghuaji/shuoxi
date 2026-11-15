const { protocol, net } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const APP_ORIGIN = 'app://shuoxi'
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}

function securityHeaders() {
  return {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
  }
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...securityHeaders(),
      'content-type': 'application/json; charset=utf-8',
    },
  })
}

function registerAppScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ])
}

async function proxyLlm(request, url) {
  const baseUrl = request.headers.get('x-llm-base-url')
  if (!baseUrl) return jsonResponse(400, { error: '缺少 x-llm-base-url 请求头' })

  const suffix = url.pathname.slice('/llm-api'.length) + url.search
  const target = `${String(baseUrl).replace(/\/+$/, '')}${suffix}`
  const headers = new Headers()
  const accept = request.headers.get('accept')
  const contentType = request.headers.get('content-type')
  const authorization = request.headers.get('authorization')
  const referer = request.headers.get('http-referer')
  const title = request.headers.get('x-title')
  if (accept) headers.set('accept', accept)
  if (contentType) headers.set('content-type', contentType)
  if (authorization) headers.set('authorization', authorization)
  if (referer) headers.set('HTTP-Referer', referer)
  if (title) headers.set('X-Title', title)

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  let body
  if (hasBody) body = await request.arrayBuffer()

  let upstream
  try {
    upstream = await net.fetch(target, {
      method: request.method,
      headers,
      body,
      signal: request.signal,
    })
  } catch (error) {
    return jsonResponse(502, {
      error: error instanceof Error ? error.message : String(error),
    })
  }

  const responseHeaders = new Headers(upstream.headers)
  responseHeaders.set('cache-control', 'no-cache, no-transform')
  responseHeaders.set('x-accel-buffering', 'no')
  responseHeaders.delete('content-encoding')
  responseHeaders.delete('content-length')
  responseHeaders.delete('transfer-encoding')
  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  })
}

function installAppProtocol(distDir) {
  const rootDir = path.resolve(distDir)
  return protocol.handle('app', async (request) => {
    const url = new URL(request.url)
    if (url.hostname !== 'shuoxi') return jsonResponse(404, { error: '未知应用地址' })
    if (url.pathname.startsWith('/llm-api/')) {
      try {
        return await proxyLlm(request, url)
      } catch (error) {
        return jsonResponse(500, {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    let decoded
    try {
      decoded = decodeURIComponent(url.pathname)
    } catch {
      return jsonResponse(400, { error: '非法路径' })
    }
    const requested = decoded === '/' ? '/index.html' : decoded
    const normalized = path.normalize(path.join(rootDir, requested))
    const rootWithSep = rootDir.endsWith(path.sep) ? rootDir : rootDir + path.sep
    if (normalized !== rootDir && !normalized.startsWith(rootWithSep)) {
      return jsonResponse(403, { error: '禁止访问' })
    }

    let filePath = normalized
    try {
      const stat = await fs.promises.stat(filePath)
      if (!stat.isFile()) filePath = path.join(rootDir, 'index.html')
    } catch {
      filePath = path.join(rootDir, 'index.html')
    }
    try {
      const data = await fs.promises.readFile(filePath)
      const ext = path.extname(filePath).toLowerCase()
      return new Response(data, {
        status: 200,
        headers: {
          ...securityHeaders(),
          'content-type': MIME[ext] || 'application/octet-stream',
          'cache-control': url.pathname.startsWith('/assets/')
            ? 'public, max-age=31536000, immutable'
            : 'no-cache',
        },
      })
    } catch {
      return jsonResponse(404, { error: '应用资源缺失，请先构建' })
    }
  })
}

module.exports = { APP_ORIGIN, registerAppScheme, installAppProtocol }
