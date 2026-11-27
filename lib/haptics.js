import {
  VIBRATOR_SCENE_DURATION, VIBRATOR_SCENE_NOTIFICATION, VIBRATOR_SCENE_DURATION_LONG,
} from '@zos/sensor'

const preset = {
  single: VIBRATOR_SCENE_DURATION,
  double: VIBRATOR_SCENE_NOTIFICATION,
  finish: VIBRATOR_SCENE_DURATION_LONG,
}

export function playCue(motor, cue) {
  if (cue !== 'finish') {
    try {
      const { CONTINUOUS, PAUSE } = motor.getType()
      if (Number.isInteger(CONTINUOUS) && Number.isInteger(PAUSE)) {
        const pulse = { type: CONTINUOUS, duration: 150 }
        const pattern = [pulse]
        if (cue === 'double') pattern.push({ type: PAUSE, duration: 220 }, { ...pulse })
        // Hand off the complete pattern to the motor in one call, including its stop.
        pattern.push({ type: PAUSE, duration: 20 })
        motor.start(pattern)
        return
      }
    } catch (error) {
      console.log('Custom vibration is unavailable', error)
    }
  }
  motor.start({ mode: preset[cue] })
}
