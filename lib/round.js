export const minMinutes = 1
export const maxMinutes = 99
export const defaultSettings = { minutes: 3, mode: 'mixed' }
export const backgroundServiceFile = 'app-service/round'
// Pause between pressing Start and the first second of the round, and how many
// of its last seconds are marked with a short pulse.
export const countdownSeconds = 5
export const countdownPulses = 3

export const modes = {
  mixed: { interval: 30 },
  half: { interval: 30 },
  minute: { interval: 60 },
}

export function normalizeSettings(settings) {
  const { minutes, mode } = settings || {}
  return {
    minutes: Number.isInteger(minutes) && minutes >= minMinutes && minutes <= maxMinutes
      ? minutes : defaultSettings.minutes,
    mode: Object.keys(modes).includes(mode) ? mode : defaultSettings.mode,
  }
}

export function parseRound(json) {
  try {
    const { id, startedAt, minutes, mode } = JSON.parse(json)
    const settings = normalizeSettings({ minutes, mode })
    if (typeof id === 'string' && id && Number.isSafeInteger(startedAt) && startedAt > 0 &&
        startedAt % 1000 === 0 && settings.minutes === minutes && settings.mode === mode) {
      return { id, startedAt, ...settings }
    }
  } catch (error) {
    // No saved round, or a partially written record.
  }
  return null
}

// The round starts on a whole second, so the alarm times stay integers. Rounding down keeps
// the wait within (countdownSeconds - 1, countdownSeconds] seconds and the first digit shown
// equal to countdownSeconds.
export function roundStart(now) {
  return Math.floor((now + countdownSeconds * 1000) / 1000) * 1000
}

export function countdownLeft(round, now) {
  return Math.max(0, Math.ceil((round.startedAt - now) / 1000))
}

export function formatTime(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function roundAt(settings, elapsedMs) {
  const duration = settings.minutes * 60
  const elapsed = Math.min(duration, Math.max(0, Math.floor(elapsedMs / 1000)))
  const { interval } = modes[settings.mode]
  const remaining = duration - elapsed
  const cueSecond = remaining ? Math.floor(elapsed / interval) * interval : duration
  const nextCue = Math.min(cueSecond + interval, duration)
  let cue = null
  if (remaining === 0) cue = 'finish'
  else if (cueSecond > 0) {
    cue = settings.mode !== 'half' && cueSecond % 60 === 0 ? 'double' : 'single'
  }
  return { remaining, elapsed, cue, cueSecond, nextIn: nextCue - elapsed }
}
