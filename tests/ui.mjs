// Page helpers for driving Campus Stores through the DevTools driver.
// The app is opened straight from disk (file://), which is how the README says it must work.
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { launch } from './cdp.mjs'

const q = (s) => JSON.stringify(s)
const ROOT = '#campus-stores'

export async function openApp(appDir, options) {
  const page = await launch(options)
  const url = pathToFileURL(resolve(appDir, 'index.html')).href
  await page.goto(url)
  return { page, url, ui: makeUi(page) }
}

export function makeUi(page) {
  // Each finder returns page-side source that evaluates to an element or null.
  const find = {
    nav: (name) => `[...document.querySelectorAll('${ROOT} nav button')].find(b => b.textContent.trim() === ${q(name)})`,
    button: (text) => `[...document.querySelectorAll('${ROOT} button')].find(b => b.textContent.trim() === ${q(text)})`,
    rowButton: (rowText, text) =>
      `(() => { const row = [...document.querySelectorAll('${ROOT} .row')].find(r => r.textContent.includes(${q(rowText)})); return row ? ([...row.querySelectorAll('button')].find(b => b.textContent.trim() === ${q(text)}) ?? null) : null })()`,
    field: (name) => `document.querySelector('${ROOT} form [name=${name}]')`,
  }

  return {
    find,
    clock: () => page.eval(`document.querySelector('[data-clock]').textContent`),
    status: () => page.eval(`document.querySelector('[data-status]').textContent`),
    pageText: () => page.eval(`document.querySelector('[data-page]').innerText`),
    rows: () =>
      page.eval(
        `[...document.querySelectorAll('${ROOT} .row')].map(r => ({ title: r.querySelector('strong')?.textContent.trim() ?? '', sub: r.querySelector('small')?.textContent.trim() ?? '', action: (r.querySelector('button, .tag')?.textContent ?? '').trim() }))`,
      ),
    options: (name) => page.eval(`[...${find.field(name)}.options].map(o => o.value)`),
    value: (name) => page.eval(`${find.field(name)}.value`),
    async choose(name, value) {
      const got = await page.eval(
        `(() => { const el = ${find.field(name)}; el.value = ${q(value)}; el.dispatchEvent(new Event('change', { bubbles: true })); return el.value })()`,
      )
      if (got !== value) throw new Error(`Option ${value} is not offered in ${name}`)
    },
    go: (name) => page.click(find.nav(name)),
    press: (text) => page.click(find.button(text)),
    pressInRow: (rowText, text) => page.click(find.rowButton(rowText, text)),
    focused: () =>
      page.eval(
        `(() => { const a = document.activeElement; if (!a || a === document.body) return 'BODY'; return a.tagName + ':' + (a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 60) })()`,
      ),
    shot: (file) => page.screenshot(file, { find: `document.querySelector('${ROOT}')`, pad: 16 }),
  }
}
