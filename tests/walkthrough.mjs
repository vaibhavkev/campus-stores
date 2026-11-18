// Replays the brief's three-step job in this fork, in a real browser, straight from disk.
// No dependencies: needs Node 22+ and an installed Chrome or Edge.
//
//   node tests/walkthrough.mjs          checks only
//   node tests/walkthrough.mjs docs     also writes the README screenshots
import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openApp } from './ui.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const shotDir = process.argv[2] ? resolve(process.argv[2]) : null

const results = []
const step = async (name, fn) => {
  try {
    await fn()
    results.push(true)
    console.log(`  ok    ${name}`)
  } catch (e) {
    results.push(false)
    console.log(`  FAIL  ${name}\n        ${String(e.message).split('\n').join('\n        ')}`)
  }
}

const { page, ui } = await openApp(appDir)
const shot = async (name) => {
  if (shotDir) await ui.shot(resolve(shotDir, `${name}.png`))
}
const issue = async (asset) => {
  await ui.press('New issue slip')
  await ui.choose('req', 'RQ-214')
  await ui.choose('asset', asset)
  await ui.choose('who', 'Kabir Sen')
  await ui.choose('due', 'Fri 8 pm')
  await ui.press('Save issue slip')
}
const stillFormFor = (num) => page.eval(`document.querySelector('#campus-stores form[data-still="${num}"]') !== null`)
const inventory = async () => {
  await ui.go('Inventory')
  const inv = Object.fromEntries((await ui.rows()).map((r) => [r.title.split(' · ')[0], r.action]))
  await ui.go('Loan register')
  return inv
}

try {
  console.log('Friday 3:45 pm - pickup (unchanged: one slip per physical unit)')
  await ui.go('Loan register')
  await step('the kit goes out on three slips, and the rules still refuse a unit that is not approved', async () => {
    await ui.press('New issue slip')
    await ui.choose('req', 'RQ-214')
    await ui.choose('asset', 'CA-03')
    await ui.choose('who', 'Kabir Sen')
    await ui.choose('due', 'Fri 8 pm')
    await ui.press('Save issue slip')
    assert.equal(await ui.status(), 'This equipment type is outside the approved request. Choose an approved unit.')
    await ui.press('Cancel')
    for (const asset of ['PR-04', 'SP-02', 'AD-12']) await issue(asset)
    assert.equal(await ui.status(), 'Issued AD-12 to Kabir Sen on slip L-404.')
  })
  await step('each slip now reads in plain words: what the unit is and whose job it belongs to', async () => {
    const rows = await ui.rows()
    assert.equal(rows.length, 4)
    assert.equal(rows[0].title, 'USB-C → HDMI adapter · AD-12')
    assert.equal(rows[0].sub, 'L-404 · Film Society (RQ-214) · Issued to Kabir Sen · Due Fri 8 pm')
    assert.equal(rows[3].title, 'Wireless microphone · MI-09')
    const buttons = await page.eval(`[...document.querySelectorAll('#campus-stores .row button')].map(b => b.textContent.trim())`)
    assert.deepEqual([...new Set(buttons)], ['Record return'], 'pickup looks as before: no slip offers a note yet')
  })

  console.log('Friday 7:30 pm - the kit comes back in pieces')
  await ui.press('Move to return time')
  await ui.go('Loan register')
  await step('returning the projector alone asks nothing: two units are still out', async () => {
    await ui.pressInRow('L-402', 'Record return')
    assert.equal(await ui.status(), 'PR-04 returned to stock. Slip L-402 closed.')
    assert.equal(await stillFormFor(404), false)
  })
  await step('returning the speaker leaves one unit out, and the slip asks who has it and until when', async () => {
    await ui.pressInRow('L-403', 'Record return')
    assert.equal(
      await ui.status(),
      'SP-02 returned to stock. Slip L-403 closed. One item from RQ-214 is still out: note who has it.',
    )
    assert.equal(await stillFormFor(404), true)
    assert.equal(await page.eval(`document.activeElement.name`), 'holder', 'keyboard focus should land in the note')
  })
  await shot('after-1-evening-asks')
  await step('two choices record it on the slip; nothing is closed, reissued or retyped', async () => {
    await ui.choose('holder', 'Leela Das')
    await ui.choose('expect', 'Sat 9 am')
    await ui.press('Save note')
    assert.equal(await ui.status(), 'Slip L-404 still out: with Leela Das, expected Sat 9 am.')
    assert.equal(await ui.focused(), 'BUTTON:Still out… USB-C → HDMI adapter · AD-12', 'keyboard focus should return to the slip')
    assert.match(await ui.pageText(), /Still out · with Leela Das · expected Sat 9 am · noted Friday · 7:30 pm/)
    const rows = await ui.rows()
    assert.equal(rows[0].sub, 'L-404 · Film Society (RQ-214) · Issued to Kabir Sen · Due Fri 8 pm', 'the slip keeps its collector and due time')
    assert.equal((await inventory())['AD-12'], 'On loan', 'the adapter was never shown as back on the shelf')
  })
  await shot('after-2-evening-noted')
  await step('the desk book shows the same fact, read from the slip', async () => {
    await ui.go('Desk book')
    const text = await ui.pageText()
    assert.match(text, /Still out · USB-C → HDMI adapter AD-12/)
    assert.match(text, /With Leela Das, expected Sat 9 am\. Slip L-404, Film Society\./)
    await ui.go('Loan register')
  })
  await step('the note survives a reload', async () => {
    await page.reload()
    assert.match(await ui.pageText(), /Still out · with Leela Das · expected Sat 9 am/)
  })

  console.log('Saturday 9:00 am - morning shift')
  await ui.press('Move to next morning')
  await ui.go('Loan register')
  await step('the morning shift can finish the job from the register alone', async () => {
    const text = await ui.pageText()
    for (const fact of ['USB-C → HDMI adapter · AD-12', 'Film Society', 'Issued to Kabir Sen', 'Overdue', 'with Leela Das', 'expected Sat 9 am']) {
      assert.ok(text.includes(fact), `the register should say "${fact}"`)
    }
    assert.equal(await page.eval(`document.querySelectorAll('#campus-stores .tag.late').length`), 1, 'only the adapter is late; the microphone is due at 10')
    const micButtons = await page.eval(`[...[...document.querySelectorAll('#campus-stores .row')].find(r => r.textContent.includes('L-401')).querySelectorAll('button')].map(b => b.textContent.trim())`)
    assert.deepEqual(micButtons, ['Record return'], 'a slip that is on time and whole is not offered a note')
  })
  await shot('after-3-morning')
  await step('every row button has its own accessible name', async () => {
    const names = await page.eval(`[...document.querySelectorAll('#campus-stores .row button')].map(b => b.getAttribute('aria-label'))`)
    assert.equal(new Set(names).size, names.length)
    assert.ok(names.includes('Record return USB-C → HDMI adapter · AD-12'))
  })
  await step('Leela hands over the adapter: one click closes the right slip and clears the note', async () => {
    await ui.pressInRow('L-404', 'Record return')
    assert.equal(await ui.status(), 'AD-12 returned to stock. Slip L-404 closed.')
    const rows = await ui.rows()
    assert.equal(rows.length, 1)
    assert.equal(rows[0].title, 'Wireless microphone · MI-09')
    assert.equal((await inventory())['AD-12'], 'On shelf')
    await ui.go('Desk book')
    assert.ok(!(await ui.pageText()).includes('Still out ·'))
    await ui.go('Loan register')
  })
  await step('a single-item loan is returned as before, with no question asked', async () => {
    await ui.pressInRow('L-401', 'Record return')
    assert.equal(await ui.status(), 'MI-09 returned to stock. Slip L-401 closed.')
    assert.equal(await page.eval(`document.querySelector('#campus-stores form[data-still]') === null`), true)
  })
  await step('a shift saved by the original app still opens', async () => {
    await page.eval(
      `localStorage.setItem('campus-stores.shift.v1', JSON.stringify({ version: 1, tab: 'Loan register', phase: 2, selected: '', filter: 'All items', loans: [{ num: 401, req: 'RQ-209', asset: 'MI-09', who: 'Tara Shah', due: 'Sat 10 am', back: false }, { num: 402, req: 'RQ-214', asset: 'AD-12', who: 'Kabir Sen', due: 'Fri 8 pm', back: false }], notes: [], editing: false, onlyOpen: true, notice: 'Shift time updated.' }))`,
    )
    await page.reload()
    assert.equal(await ui.clock(), 'Saturday · 9:00 am')
    assert.equal((await ui.rows()).length, 2)
  })
  await step('phone width: no sideways scroll, and item names keep the full row width', async () => {
    await page.setViewport({ width: 375, height: 812, scale: 2, mobile: true })
    await page.reload()
    assert.equal(await page.eval(`document.documentElement.scrollWidth <= innerWidth`), true)
    const nameWidth = await page.eval(`[...document.querySelectorAll('#campus-stores .row strong')].find(e => e.textContent.includes('AD-12')).parentElement.getBoundingClientRect().width`)
    assert.ok(nameWidth > 280, `the item name is squeezed to ${Math.round(nameWidth)}px`)
    if (shotDir) await ui.shot(resolve(shotDir, 'after-4-phone.png'))
    await page.setViewport()
  })
} finally {
  await page.close()
}

const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed} of ${results.length} checks passed`)
process.exit(failed ? 1 : 0)
