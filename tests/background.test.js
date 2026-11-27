import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import * as round from '../lib/round.js'

function runScript(path, globals, trailing = '') {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    .replace(/^import\s+[\s\S]*?\sfrom\s+'[^']+'\n/gm, '')
    .replace(/^export /gm, '')
  return runInNewContext(`${source}\n${trailing}`, { ...round, ...globals }, { filename: path })
}

function register(path, entry, globals) {
  let instance
  runScript(path, { ...globals, [entry]: (value) => { instance = value } })
  return instance
}

// Fake clock starts at 1650 ms; pressing Start then begins the round on the whole second
// `countdownSeconds` later, rounded down: 6000 ms.
const goAt = 6000
const roundCues = (watch) => watch.cues.filter(([time]) => time > goAt)
const countdownCues = (watch) => watch.cues.filter(([time]) => time <= goAt)

// An alarm can wake a new service instance even when all page timers are gone.
function fakeWatch({ failAt, cancelFails = false, failSave = false, language = 4 } = {}) {
  const timers = new Map()
  const files = new Map()
  const cues = []
  const patterns = []
  const toasts = []
  let time = 1650
  let nextTimer = 0
  const ownAlarms = () => [...timers.keys()].filter((id) => timers.get(id).kind === 'alarm')
  const schedule = (kind, callback, at) => {
    const id = ++nextTimer
    timers.set(id, { kind, callback, at })
    return id
  }
  const advance = (duration, late = false) => {
    const until = time + duration
    while (timers.size) {
      const [id, next] = [...timers].sort((a, b) => a[1].at - b[1].at)[0]
      if (next.at > until) break
      time = late ? until : next.at
      timers.delete(id)
      next.callback()
    }
    time = until
  }

  const storage = {
    readFileSync: ({ path }) => files.get(path),
    writeFileSync({ path, data }) {
      if (!failSave || path !== 'timer-alarm-round.json') files.set(path, data)
    },
  }
  const alarms = runScript('../lib/alarm-round.js', {
    ...storage,
    REPEAT_ONCE: 1,
    getAllAlarms: ownAlarms,
    cancel(id) {
      if (cancelFails) return -1
      timers.delete(id)
      return 0
    },
    set({ url, time: seconds, param, repeat_type, store }) {
      assert.equal(url, round.backgroundServiceFile)
      assert.equal(repeat_type, 1)
      assert.equal(store, false)
      assert.equal(Number.isInteger(seconds), true)
      assert.ok(seconds * 1000 > time)
      if (JSON.parse(param).second === failAt) return 0
      return schedule('alarm', () => launchService(param), seconds * 1000)
    },
  }, '({ loadRound, saveRound, scheduleCue, cancelRoundAlarms })')

  const playCue = runScript('../lib/haptics.js', {
    VIBRATOR_SCENE_DURATION: 10,
    VIBRATOR_SCENE_NOTIFICATION: 11,
    VIBRATOR_SCENE_DURATION_LONG: 12,
  }, 'playCue')
  const stringsForLanguage = runScript('../lib/strings.js', {}, 'stringsForLanguage')
  const globals = {
    ...alarms,
    Date: { now: () => time },
    playCue,
    Vibrator: class {
      getType() { return { CONTINUOUS: 1, PAUSE: 2 } }
      start(options) {
        patterns.push(JSON.parse(JSON.stringify(options)))
        const cue = Array.isArray(options)
          ? options.filter(({ type }) => type === 1).length === 2 ? 'double' : 'single'
          : { 10: 'single', 11: 'double', 12: 'finish' }[options.mode]
        cues.push([time, cue])
      }
      stop() {}
    },
  }
  const launchService = (params) => {
    const service = register('../app-service/round.js', 'AppService', globals)
    service.onInit(params)
    service.onEvent(params)
  }
  const openPage = () => {
    const page = register('../page/index.js', 'Page', {
      ...globals, ...storage,
      stringsForLanguage,
      getLanguage: () => language,
      createWidget(type, options) {
        return { ...options, setProperty(key, value) { this[key] = value } }
      },
      widget: { TEXT: 1, FILL_RECT: 2, BUTTON: 3 },
      prop: { TEXT: 'text', VISIBLE: 'visible', MORE: 'properties' },
      align: { CENTER_H: 1, CENTER_V: 2 },
      setStatusBarVisible() {},
      showToast: ({ content }) => toasts.push(content),
      setTimeout: (callback, delay) => schedule('page', callback, time + delay),
      clearTimeout: (id) => timers.delete(id),
    })
    page.build()
    return page
  }
  return { advance, cues, files, openPage, ownAlarms, patterns, timers, toasts }
}

test('six cues run after the foreground page is destroyed and the alarm queue drains', () => {
  const watch = fakeWatch()
  const page = watch.openPage()
  page.startButton.click_func()
  watch.advance(10000)
  page.onDestroy()
  assert.deepEqual([...watch.timers.values()].map(({ kind }) => kind), ['alarm', 'alarm'])
  watch.advance(176000)
  assert.deepEqual(roundCues(watch), [
    [36000, 'single'], [66000, 'double'], [96000, 'single'],
    [126000, 'double'], [156000, 'single'], [186000, 'finish'],
  ])
  assert.equal(watch.timers.size, 0)
  const reopened = watch.openPage()
  assert.equal(reopened.clock.text, '0:00')
  assert.equal(reopened.startButton.text, 'Повторить')
  assert.deepEqual(watch.toasts, [])
})

test('Stop after reopening cancels both upcoming signals', () => {
  const watch = fakeWatch()
  const page = watch.openPage()
  page.startButton.click_func()
  page.onDestroy()
  watch.advance(45350)
  const reopened = watch.openPage()
  assert.equal(reopened.clock.text, '2:19')
  reopened.stopButton.click_func()
  watch.advance(180000)
  assert.deepEqual(roundCues(watch), [[36000, 'single']])
  assert.equal(watch.timers.size, 0)
  assert.equal(watch.openPage().clock.text, '3:00')
})

test('a stopped round cannot vibrate after an OS cancellation failure', () => {
  const watch = fakeWatch({ cancelFails: true })
  const page = watch.openPage()
  page.startButton.click_func()
  page.stopButton.click_func()
  page.startButton.click_func()
  page.onDestroy()
  watch.advance(185000)
  assert.equal(roundCues(watch).length, 6)
  assert.deepEqual(roundCues(watch).at(-1), [186000, 'finish'])
  assert.equal(watch.timers.size, 0)
})

test('a failed start rolls back every alarm and leaves the UI ready', () => {
  for (const settings of [{ failAt: 30 }, { failSave: true }]) {
    const watch = fakeWatch(settings)
    const page = watch.openPage()
    page.startButton.click_func()
    assert.equal(page.startButton.text, 'Старт')
    assert.equal(watch.ownAlarms().length, 0)
    assert.equal(watch.files.has('timer-alarm-round.json'), false)
    assert.equal(watch.toasts.length, 1)
  }
})

test('a failed intermediate schedule leaves the finish armed', () => {
  const watch = fakeWatch({ failAt: 90 })
  const page = watch.openPage()
  page.startButton.click_func()
  page.onDestroy()
  watch.advance(185000)
  assert.deepEqual(roundCues(watch), [[36000, 'single'], [66000, 'double'], [186000, 'finish']])
})

test('a late wake skips old cues and does not double the final vibration', () => {
  const watch = fakeWatch()
  const page = watch.openPage()
  page.startButton.click_func()
  page.onDestroy()
  watch.advance(95350, true)
  assert.deepEqual(roundCues(watch), [[97000, 'single']])
  watch.advance(90000, true)
  assert.deepEqual(roundCues(watch), [[97000, 'single'], [187000, 'finish']])
})

test('the labeled preview uses the same vibration patterns as scheduled alarms', () => {
  const watch = fakeWatch()
  const page = watch.openPage()
  page.testButton.click_func()
  assert.equal(page.hint.text, '0:30 · один импульс')
  watch.advance(1200)
  assert.equal(page.hint.text, '1:00 · два импульса')
  watch.advance(1500)
  assert.equal(page.hint.text, 'Финиш · длинный сигнал')
  watch.advance(1200)
  assert.equal(page.hint.text, 'Один на :30, два на :00')
  const preview = watch.patterns.splice(0)
  assert.deepEqual(preview, [
    [{ type: 1, duration: 150 }, { type: 2, duration: 20 }],
    [{ type: 1, duration: 150 }, { type: 2, duration: 220 }, { type: 1, duration: 150 }, { type: 2, duration: 20 }],
    { mode: 12 },
  ])
  page.startButton.click_func()
  watch.advance(5500)
  watch.patterns.length = 0 // The countdown pulses are covered by their own test.
  page.onDestroy()
  watch.advance(181000)
  assert.deepEqual([watch.patterns[0], watch.patterns[1], watch.patterns.at(-1)], preview)
})

test('the English interface, larger Start button, and countdown are available together', () => {
  const watch = fakeWatch({ language: 2 })
  const page = watch.openPage()
  assert.equal(page.startButton.text, 'Start')
  assert.equal(page.stopButton.text, 'Stop')
  assert.equal(page.testButton.text, 'Test vibration')
  assert.equal(page.caption.text, 'ROUND LENGTH')
  assert.deepEqual([page.startButton.w, page.startButton.h], [326, 68])
  assert.ok(page.hint.y + page.hint.h <= page.startButton.y)
  assert.ok(page.startButton.y + page.startButton.h <= page.testButton.y)
  page.mode.click_func()
  assert.equal(page.mode.text, 'Every 30 s')
  page.testButton.click_func()
  assert.equal(page.hint.text, '0:30 · one pulse')
  page.startButton.click_func()
  assert.equal(page.clock.text, '5')
  assert.equal(page.caption.text, 'GET READY')
  assert.equal(watch.ownAlarms().length, 2)
  watch.advance(4350)
  assert.equal(page.clock.text, '3:00')
  assert.equal(page.caption.text, 'TIME LEFT')
  assert.equal(page.hint.text, 'Next cue in 0:30')
  watch.advance(180350)
  assert.equal(page.caption.text, 'ROUND COMPLETE')
  assert.equal(page.startButton.text, 'Repeat')
})

test('other watch languages fall back to English, including error messages', () => {
  const watch = fakeWatch({ language: 6, failAt: 30 })
  const page = watch.openPage()
  page.startButton.click_func()
  assert.equal(page.startButton.text, 'Start')
  assert.deepEqual(watch.toasts, ['Could not schedule vibration cues'])
})

test('the countdown counts down every second and marks the last three, then starts the round', () => {
  const watch = fakeWatch()
  const page = watch.openPage()
  page.startButton.click_func()
  const shown = [page.clock.text]
  for (let ms = 350; ms <= 4350; ms += 1000) {
    watch.advance(ms === 350 ? 350 : 1000)
    shown.push(page.clock.text)
  }
  assert.deepEqual(shown, ['5', '4', '3', '2', '1', '3:00'])
  assert.equal(page.caption.text, 'ОСТАЛОСЬ')
  assert.equal(page.progress.properties.w, 318)
  assert.deepEqual(countdownCues(watch), [[3000, 'single'], [4000, 'single'], [5000, 'single'], [6000, 'finish']])
})

test('the round is timed from the end of the countdown, not from the Start press', () => {
  const watch = fakeWatch()
  const page = watch.openPage()
  page.startButton.click_func()
  assert.equal(JSON.parse(watch.files.get('timer-alarm-round.json')).startedAt, goAt)
  page.onDestroy()
  watch.advance(goAt - 1650 + 29999)
  assert.deepEqual(roundCues(watch), [])
  watch.advance(1)
  assert.deepEqual(roundCues(watch), [[36000, 'single']])
})

test('Stop during the countdown cancels the round and every pulse', () => {
  const watch = fakeWatch()
  const page = watch.openPage()
  page.startButton.click_func()
  watch.advance(500)
  assert.equal(page.clock.text, '4')
  page.stopButton.click_func()
  assert.equal(page.clock.text, '3:00')
  assert.equal(page.caption.text, 'ДЛИТЕЛЬНОСТЬ')
  assert.equal(page.startButton.text, 'Старт')
  assert.equal(watch.ownAlarms().length, 0)
  assert.equal(watch.files.has('timer-alarm-round.json'), true)
  watch.advance(200000)
  assert.deepEqual(watch.cues, [])
  assert.equal(watch.timers.size, 0)
})

test('reopening the app during the countdown continues it, and the round still begins on time', () => {
  const watch = fakeWatch()
  const page = watch.openPage()
  page.startButton.click_func()
  page.onDestroy()
  watch.advance(2350)
  const reopened = watch.openPage()
  assert.equal(reopened.clock.text, '2')
  assert.equal(reopened.caption.text, 'ГОТОВЬСЬ')
  assert.equal(reopened.hint.text, '')
  watch.advance(2000)
  assert.equal(reopened.clock.text, '3:00')
  assert.equal(reopened.caption.text, 'ОСТАЛОСЬ')
  assert.deepEqual(countdownCues(watch).at(-1), [6000, 'finish'])
})

test('a round opened after the countdown ended gives no start pulse', () => {
  const watch = fakeWatch()
  const page = watch.openPage()
  page.startButton.click_func()
  page.onDestroy()
  watch.advance(10000)
  watch.cues.length = 0
  const reopened = watch.openPage()
  assert.equal(reopened.caption.text, 'ОСТАЛОСЬ')
  watch.advance(3000)
  assert.deepEqual(watch.cues, [])
})
