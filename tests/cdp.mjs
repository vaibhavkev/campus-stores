// Minimal Chrome DevTools Protocol driver.
// No dependencies: needs Node 22+ (global WebSocket) and an installed Chrome or Edge.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)

const KEYS = {
  Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  Space: { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' },
  Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function launch({ width = 1100, height = 900, scale = 2, scheme = 'light' } = {}) {
  const exe = BROWSERS.find((p) => existsSync(p))
  if (!exe) throw new Error('No Chrome or Edge found. Set CHROME_PATH to a Chromium-based browser.')

  const profile = mkdtempSync(join(tmpdir(), 'campus-stores-replay-'))
  const child = spawn(
    exe,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--hide-scrollbars',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )

  const endpoint = await new Promise((resolve, reject) => {
    let seen = ''
    const timer = setTimeout(() => reject(new Error('Browser did not report a DevTools endpoint within 20 s')), 20000)
    child.stderr.on('data', (chunk) => {
      seen += chunk
      const m = seen.match(/DevTools listening on (ws:\/\/\S+)/)
      if (m) {
        clearTimeout(timer)
        resolve(m[1])
      }
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`Browser exited early (code ${code})`))
    })
  })

  const ws = new WebSocket(endpoint)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', () => reject(new Error('Could not connect to the browser')), { once: true })
  })

  let nextId = 0
  const pending = new Map()
  const waiters = new Set()
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id !== undefined) {
      const p = pending.get(msg.id)
      if (!p) return
      pending.delete(msg.id)
      if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`))
      else p.resolve(msg.result)
      return
    }
    for (const w of [...waiters]) {
      if (w.method === msg.method) {
        waiters.delete(w)
        w.resolve(msg.params)
      }
    }
  })

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++nextId
      pending.set(id, { resolve, reject, method })
      ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }))
    })

  const waitFor = (method, ms = 15000) =>
    new Promise((resolve, reject) => {
      const w = {
        method,
        resolve: (v) => {
          clearTimeout(timer)
          resolve(v)
        },
      }
      const timer = setTimeout(() => {
        waiters.delete(w)
        reject(new Error(`Timed out waiting for ${method}`))
      }, ms)
      waiters.add(w)
    })

  const { targetInfos } = await send('Target.getTargets')
  const existing = targetInfos.find((t) => t.type === 'page')
  const targetId = existing ? existing.targetId : (await send('Target.createTarget', { url: 'about:blank' })).targetId
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  const cmd = (method, params) => send(method, params, sessionId)
  await cmd('Page.enable')
  await cmd('Runtime.enable')

  const page = {
    async setViewport({ width: w = width, height: h = height, scale: s = scale, mobile = false } = {}) {
      await cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: s, mobile })
    },

    async setScheme(value) {
      await cmd('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] })
    },

    async goto(url) {
      const loaded = waitFor('Page.loadEventFired')
      await cmd('Page.navigate', { url })
      await loaded
    },

    async reload() {
      const loaded = waitFor('Page.loadEventFired')
      await cmd('Page.reload')
      await loaded
    },

    // Evaluates page-side JavaScript and returns its JSON-serialisable value.
    async eval(expression) {
      const r = await cmd('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (r.exceptionDetails) {
        const detail = r.exceptionDetails.exception?.description ?? r.exceptionDetails.text
        throw new Error(`Page script failed: ${detail}\n  in: ${expression.slice(0, 200)}`)
      }
      return r.result.value
    },

    // Real mouse input at viewport coordinates.
    async clickAt(x, y) {
      await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
      await cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
      await cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
    },

    // `find` is page-side source that evaluates to an element or null.
    async center(find) {
      const p = await page.eval(
        `(() => { const el = ${find}; if (!el) return null; el.scrollIntoView({ block: 'center', inline: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
      )
      if (!p) throw new Error(`Element not found: ${find}`)
      return p
    },

    async click(find) {
      const p = await page.center(find)
      await page.clickAt(p.x, p.y)
      return p
    },

    async press(name, { shift = false } = {}) {
      const k = KEYS[name]
      if (!k) throw new Error(`Unknown key ${name}`)
      const modifiers = shift ? 8 : 0
      await cmd('Input.dispatchKeyEvent', { type: k.text ? 'keyDown' : 'rawKeyDown', modifiers, ...k })
      await cmd('Input.dispatchKeyEvent', {
        type: 'keyUp',
        modifiers,
        key: k.key,
        code: k.code,
        windowsVirtualKeyCode: k.windowsVirtualKeyCode,
      })
    },

    async type(text) {
      await cmd('Input.insertText', { text })
    },

    async screenshot(file, { find = 'document.documentElement', pad = 0 } = {}) {
      const box = await page.eval(
        `(() => { const el = ${find}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }; })()`,
      )
      if (!box) throw new Error(`Element not found: ${find}`)
      const clip = {
        x: Math.max(0, box.x - pad),
        y: Math.max(0, box.y - pad),
        width: box.width + pad * 2,
        height: box.height + pad * 2,
        scale: 1,
      }
      const { data } = await cmd('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true })
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, Buffer.from(data, 'base64'))
    },

    async close() {
      await Promise.race([send('Browser.close').catch(() => {}), sleep(1500)])
      try {
        ws.close()
      } catch {
        // already closed
      }
      await Promise.race([new Promise((r) => (child.exitCode === null ? child.once('exit', r) : r())), sleep(4000)])
      if (child.exitCode === null) {
        try {
          child.kill()
        } catch {
          // already gone
        }
      }
      for (let i = 0; i < 6; i++) {
        try {
          rmSync(profile, { recursive: true, force: true })
          break
        } catch {
          await sleep(300)
        }
      }
    },
  }

  await page.setViewport()
  await page.setScheme(scheme)
  return page
}
