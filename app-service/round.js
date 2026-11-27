import { Vibrator } from '@zos/sensor'
import { loadRound, scheduleCue } from '../lib/alarm-round.js'
import { playCue } from '../lib/haptics.js'
import { modes, roundAt } from '../lib/round.js'

function playScheduledCue(params) {
  let event
  try {
    event = JSON.parse(params)
  } catch (error) {
    return
  }
  if (!event || this.lastEvent === params) return

  const round = loadRound()
  const { id, second } = event
  if (!round || id !== round.id || !Number.isInteger(second)) return
  const duration = round.minutes * 60
  if (second <= 0 || second > duration || (second < duration && second % modes[round.mode].interval)) return
  this.lastEvent = params

  const elapsed = Math.max(second * 1000, Date.now() - round.startedAt)
  const state = roundAt(round, elapsed)
  if (second < duration) {
    // The finish already has its own alarm, including when an earlier cue was delayed.
    if (!state.remaining) return
    const next = state.elapsed + state.nextIn
    if (next < duration && !scheduleCue(round, next)) console.log('Could not schedule the next cue')
  }

  this.motor = new Vibrator()
  playCue(this.motor, state.cue)
}

AppService({
  onInit: playScheduledCue,
  onEvent: playScheduledCue,
})
