import { showToast } from '@zos/interaction'
import { align, createWidget, prop, setStatusBarVisible, widget } from '@zos/ui'
import { readFileSync, writeFileSync } from '@zos/fs'
import { Vibrator } from '@zos/sensor'
import { getLanguage } from '@zos/settings'
import { cancelRoundAlarms, loadRound, saveRound, scheduleCue } from '../lib/alarm-round.js'
import { playCue } from '../lib/haptics.js'
import {
  countdownLeft, countdownPulses, formatTime, maxMinutes, minMinutes, modes, normalizeSettings,
  roundAt, roundStart,
} from '../lib/round.js'
import { stringsForLanguage } from '../lib/strings.js'

const colors = {
  background: 0x0d1110,
  panel: 0x242c28,
  pressed: 0x38443d,
  white: 0xf4f6ed,
  muted: 0xb0bcb4,
  accent: 0xd8fb78,
  accentPressed: 0xb4d65a,
}
const settingsFile = { path: 'timer-settings.json', options: { encoding: 'utf8' } }

function loadSettings() {
  try {
    return JSON.parse(readFileSync(settingsFile)) ?? {}
  } catch (error) {
    return {}
  }
}

function label(text, x, y, w, h, textSize, color = colors.white) {
  return createWidget(widget.TEXT, {
    text, x, y, w, h, text_size: textSize, color,
    align_h: align.CENTER_H, align_v: align.CENTER_V,
  })
}

function rect(x, y, w, h, color, radius = 0) {
  return createWidget(widget.FILL_RECT, { x, y, w, h, color, radius })
}

function button(text, x, y, w, h, click, options = {}) {
  return createWidget(widget.BUTTON, {
    text, x, y, w, h, radius: 22, text_size: 25, color: colors.white,
    normal_color: colors.panel, press_color: colors.pressed, click_func: click,
    ...options,
  })
}

Page({
  build() {
    const saved = loadSettings()
    this.settings = normalizeSettings(saved)
    this.language = saved.language === 'ru' || saved.language === 'en' ? saved.language : undefined
    this.copy = stringsForLanguage(this.language ?? getLanguage())
    this.motor = new Vibrator()
    this.round = loadRound()
    this.finished = false
    this.countingDown = false
    this.tickTimer = null
    this.testTimers = []

    setStatusBarVisible(false)
    rect(0, 0, 390, 450, colors.background)
    this.titleLabel = label('', 44, 26, 248, 30, 20, colors.accent)
    this.languageButton = button('', 298, 22, 56, 38, () => this.changeLanguage(), {
      radius: 14, text_size: 18,
    })
    this.clock = label('', 23, 62, 344, 113, 96)
    this.caption = label('', 36, 172, 318, 31, 20, colors.muted)
    this.track = rect(36, 230, 318, 8, colors.panel, 4)
    this.progress = rect(36, 230, 1, 8, colors.accent, 4)
    this.minus = button('−', 36, 225, 60, 57, () => this.changeMinutes(-1), {
      text_size: 32, longpress_func: () => this.changeMinutes(-5),
    })
    this.mode = button('', 106, 225, 178, 57, () => this.changeMode(), { color: colors.accent, text_size: 22 })
    this.plus = button('+', 294, 225, 60, 57, () => this.changeMinutes(1), {
      text_size: 32, longpress_func: () => this.changeMinutes(5),
    })
    this.hint = label('', 36, 285, 318, 27, 19, colors.muted)
    this.startButton = button(this.copy.start, 32, 314, 326, 68, () => this.startRound(), {
      normal_color: colors.accent, press_color: colors.accentPressed, color: colors.background, text_size: 28,
    })
    this.stopButton = button('', 36, 320, 318, 59, () => this.stopRound())
    this.testButton = button('', 65, 383, 260, 47, () => this.testCues(), {
      normal_color: colors.background, color: colors.muted, text_size: 20,
    })
    this.render()
    if (this.round) this.tick()
  },

  saveSettings() {
    try {
      const data = JSON.stringify({ ...this.settings, language: this.language })
      writeFileSync({ ...settingsFile, data })
    } catch (error) {
      console.log('Could not save timer settings')
    }
    this.render()
  },

  changeMinutes(change) {
    if (this.round) return
    this.finished = false
    this.settings.minutes = Math.max(minMinutes, Math.min(maxMinutes, this.settings.minutes + change))
    this.saveSettings()
  },

  changeMode() {
    if (this.round) return
    this.finished = false
    const choices = Object.keys(modes)
    this.settings.mode = choices[(choices.indexOf(this.settings.mode) + 1) % choices.length]
    this.saveSettings()
  },

  changeLanguage() {
    if (this.round) return
    this.cancelTest()
    this.language = this.copy.switchLanguage
    this.copy = stringsForLanguage(this.language)
    this.saveSettings()
  },

  render() {
    const running = this.round !== null
    const now = Date.now()
    const left = running ? countdownLeft(this.round, now) : 0
    const remaining = running ? roundAt(this.round, now - this.round.startedAt).remaining
      : this.finished ? 0 : this.settings.minutes * 60
    const mode = this.copy.modes[this.settings.mode]
    this.titleLabel.setProperty(prop.TEXT, this.copy.title)
    this.languageButton.setProperty(prop.TEXT, this.copy.switchLanguage.toUpperCase())
    this.clock.setProperty(prop.TEXT, left ? String(left) : formatTime(remaining))
    this.caption.setProperty(prop.TEXT, left ? this.copy.getReady : running ? this.copy.remaining
      : this.finished ? this.copy.finished : this.copy.duration)
    this.mode.setProperty(prop.TEXT, mode.label)
    this.hint.setProperty(prop.TEXT, running ? '' : mode.hint)
    this.startButton.setProperty(prop.TEXT, this.finished ? this.copy.repeat : this.copy.start)
    this.stopButton.setProperty(prop.TEXT, this.copy.stop)
    this.testButton.setProperty(prop.TEXT, this.copy.test)
    for (const control of [this.languageButton, this.minus, this.mode, this.plus, this.startButton, this.testButton]) {
      control.setProperty(prop.VISIBLE, !running)
    }
    for (const control of [this.track, this.progress, this.stopButton]) {
      control.setProperty(prop.VISIBLE, running)
    }
  },

  playTestCue(cue) {
    this.hint.setProperty(prop.TEXT, this.copy.preview[cue])
    playCue(this.motor, cue)
  },

  testCues() {
    if (this.round) return
    this.cancelTest()
    this.playTestCue('single')
    this.testTimers = [
      setTimeout(() => this.playTestCue('double'), 1200),
      setTimeout(() => this.playTestCue('finish'), 2700),
      setTimeout(() => {
        this.testTimers = []
        this.render()
      }, 3900),
    ]
  },

  cancelTest() {
    if (!this.testTimers.length) return
    for (const timer of this.testTimers) clearTimeout(timer)
    this.testTimers = []
    this.motor.stop()
  },

  startRound() {
    if (this.round) return
    this.cancelTest()
    this.render()
    cancelRoundAlarms()
    const round = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      startedAt: roundStart(Date.now()),
      ...this.settings,
    }
    const duration = round.minutes * 60
    const { interval } = modes[round.mode]
    if (!scheduleCue(round, duration) || (interval < duration && !scheduleCue(round, interval))) {
      cancelRoundAlarms()
      showToast({ content: this.copy.scheduleError })
      return
    }
    if (!saveRound(round)) {
      cancelRoundAlarms()
      showToast({ content: this.copy.saveError })
      return
    }
    this.round = round
    this.finished = false
    this.countingDown = false
    this.render()
    this.tick()
  },

  tick() {
    if (!this.round) return
    const now = Date.now()
    const left = countdownLeft(this.round, now)
    if (left) {
      // The round is armed with its alarms already; the page only shows the wait and marks its last seconds.
      this.countingDown = true
      this.clock.setProperty(prop.TEXT, String(left))
      this.caption.setProperty(prop.TEXT, this.copy.getReady)
      this.hint.setProperty(prop.TEXT, '')
      this.progress.setProperty(prop.MORE, { x: 36, y: 230, w: 318, h: 8, radius: 4, color: colors.accent })
      if (left <= countdownPulses) playCue(this.motor, 'single')
      this.tickTimer = setTimeout(() => this.tick(), (this.round.startedAt - now) % 1000 || 1000)
      return
    }
    if (this.countingDown) {
      // Long pulse on the exact second the round begins, only for a countdown watched on this screen.
      this.countingDown = false
      this.caption.setProperty(prop.TEXT, this.copy.remaining)
      playCue(this.motor, 'finish')
    }
    const elapsedMs = now - this.round.startedAt
    const state = roundAt(this.round, elapsedMs)
    if (!state.remaining) {
      this.round = null
      this.finished = true
      this.render()
      return
    }
    this.clock.setProperty(prop.TEXT, formatTime(state.remaining))
    this.hint.setProperty(prop.TEXT, `${this.copy.nextCue} ${formatTime(state.nextIn)}`)
    const width = Math.max(1, Math.round(318 * state.remaining / (this.round.minutes * 60)))
    this.progress.setProperty(prop.MORE, { x: 36, y: 230, w: width, h: 8, radius: 4, color: colors.accent })
    // Keep every tick on the original second boundaries even if a callback was delayed.
    this.tickTimer = setTimeout(() => this.tick(), 1000 - elapsedMs % 1000)
  },

  stopRound() {
    if (!this.round) return
    if (!saveRound(null)) {
      showToast({ content: this.copy.stopError })
      return
    }
    cancelRoundAlarms()
    clearTimeout(this.tickTimer)
    this.round = null
    this.finished = false
    this.countingDown = false
    this.render()
  },

  onDestroy() {
    if (!this.motor) return
    clearTimeout(this.tickTimer)
    this.cancelTest()
  },
})
