import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * 本地 AI 代理。
 *
 * 浏览器直连第三方模型接口通常会被 CORS 拦截，所以前端统一请求同源的
 * /llm-api/*，由这里转发到 x-llm-base-url 指定的 OpenAI 兼容接口。
 * 打包成桌面端后，这一层会移到 Electron / Tauri 的原生请求层。
 */
function llmProxy(): Plugin {
  const middleware = async (req: any, res: any, next: any) => {
    if (!req.url?.startsWith('/llm-api/')) {
      next()
      return
    }

    const origin = req.headers.origin
    if (origin) {
      try {
        const parsed = new URL(String(origin))
        if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
          res.statusCode = 403
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: '只允许本机页面调用本地 AI 代理' }))
          return
        }
      } catch {
        res.statusCode = 403
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ error: '非法来源' }))
        return
      }
    }

    const headerValue = req.headers['x-llm-base-url']
    const baseUrl = Array.isArray(headerValue) ? headerValue[0] : headerValue
    if (!baseUrl) {
      res.statusCode = 400
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ error: '缺少 x-llm-base-url 请求头' }))
      return
    }

    try {
      let body = ''
      for await (const chunk of req) body += chunk.toString('utf8')

      const path = req.url.slice('/llm-api'.length)
      const targetUrl = `${String(baseUrl).replace(/\/+$/, '')}${path}`

      const headers: Record<string, string> = {
        accept: String(req.headers['accept'] ?? 'text/event-stream'),
      }
      const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
      if (hasBody) {
        headers['content-type'] = String(req.headers['content-type'] ?? 'application/json')
      }
      if (typeof req.headers.authorization === 'string') {
        headers.authorization = req.headers.authorization
      }
      if (typeof req.headers['http-referer'] === 'string') {
        headers['HTTP-Referer'] = req.headers['http-referer']
      }
      if (typeof req.headers['x-title'] === 'string') {
        headers['X-Title'] = req.headers['x-title']
      }

      const controller = new AbortController()
      req.on('aborted', () => controller.abort())
      res.on('close', () => {
        if (!res.writableEnded) controller.abort()
      })

      const upstream = await fetch(targetUrl, {
        method: req.method ?? 'POST',
        headers,
        body: hasBody ? body : undefined,
        signal: controller.signal,
      })

      res.statusCode = upstream.status
      res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json')
      res.setHeader('cache-control', 'no-cache, no-transform')
      res.setHeader('x-accel-buffering', 'no')

      if (!upstream.body) {
        res.end()
        return
      }

      for await (const chunk of upstream.body as any) {
        res.write(chunk)
      }
      res.end()
    } catch (error) {
      if (res.headersSent) {
        res.end()
        return
      }
      res.statusCode = 502
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }),
      )
    }
  }

  return {
    name: 'shuoxi-llm-proxy',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

export default defineConfig({
  plugins: [react(), llmProxy()],
  server: {
    port: 5180,
    strictPort: true,
    watch: {
      // 编辑器原子写入产生的临时目录，避免 Windows 下 watcher 触发 EBUSY
      ignored: ['**/*.tmpdir', '**/*.tmpdir/**'],
    },
  },
})
