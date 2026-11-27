import assert from 'node:assert/strict'
import test from 'node:test'
import {
  countdownLeft, countdownPulses, countdownSeconds, formatTime, normalizeSettings, roundAt, roundStart,
} from '../lib/round.js'

function cues(settings) {
  const result = []
  let lastCue = 0
  for (let ms = 0; ms <= settings.minutes * 60000 + 500; ms += 500) {
    const state = roundAt(settings, ms)
    if (state.cue && state.cueSecond > lastCue) {
      result.push([state.cueSecond, state.cue])
      lastCue = state.cueSecond
    }
  }
  return result
}

test('default round alternates single and double signals and finishes once', () => {
  assert.deepEqual(cues(normalizeSettings()), [
    [30, 'single'], [60, 'double'], [90, 'single'],
    [120, 'double'], [150, 'single'], [180, 'finish'],
  ])
})

test('uniform intervals work for both short and long durations', () => {
  assert.deepEqual(cues({ minutes: 2, mode: 'half' }), [
    [30, 'single'], [60, 'single'], [90, 'single'], [120, 'finish'],
  ])
  assert.deepEqual(cues({ minutes: 5, mode: 'minute' }), [
    [60, 'double'], [120, 'double'], [180, 'double'], [240, 'double'], [300, 'finish'],
  ])
  assert.deepEqual(cues({ minutes: 1, mode: 'minute' }), [[60, 'finish']])
})

test('boundaries follow elapsed time, including callbacks delayed past finish', () => {
  const settings = normalizeSettings()
  assert.deepEqual(roundAt(settings, 29999), {
    remaining: 151, elapsed: 29, cue: null, cueSecond: 0, nextIn: 1,
  })
  assert.deepEqual(roundAt(settings, 30000), {
    remaining: 150, elapsed: 30, cue: 'single', cueSecond: 30, nextIn: 30,
  })
  assert.equal(roundAt(settings, 85000).cueSecond, 60)
  assert.deepEqual(roundAt(settings, 182854), {
    remaining: 0, elapsed: 180, cue: 'finish', cueSecond: 180, nextIn: 0,
  })
})

test('stored settings validate independently and all times fit the clock format', () => {
  assert.deepEqual(normalizeSettings({ minutes: 0, mode: 'half' }), { minutes: 3, mode: 'half' })
  assert.deepEqual(normalizeSettings({ minutes: 99, mode: 'constructor' }), { minutes: 99, mode: 'mixed' })
  assert.deepEqual(normalizeSettings({ minutes: 2.5, mode: 'minute' }), { minutes: 3, mode: 'minute' })
  assert.equal(formatTime(0), '0:00')
  assert.equal(formatTime(99 * 60 + 9), '99:09')
})

test('the countdown always shows the full length first and ends on a whole second', () => {
  assert.equal(countdownSeconds, 5)
  assert.equal(countdownPulses, 3)
  for (const now of [1000, 1001, 1650, 1999, 123456789]) {
    const startedAt = roundStart(now)
    assert.equal(startedAt % 1000, 0)
    assert.equal(countdownLeft({ startedAt }, now), countdownSeconds)
    assert.ok(startedAt > now + (countdownSeconds - 1) * 1000 - 1)
    assert.ok(startedAt <= now + countdownSeconds * 1000)
  }
})

test('countdownLeft counts whole seconds down to the exact start and then stays at zero', () => {
  const round = { startedAt: 6000 }
  assert.deepEqual([1650, 2000, 3500, 5000, 5999, 6000, 6001, 90000].map((now) => countdownLeft(round, now)),
    [5, 4, 3, 1, 1, 0, 0, 0])
  assert.equal(roundAt(normalizeSettings(), -4000).remaining, 180)
})
