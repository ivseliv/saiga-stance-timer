import { cancel, getAllAlarms, REPEAT_ONCE, set } from '@zos/alarm'
import { readFileSync, writeFileSync } from '@zos/fs'
import { backgroundServiceFile, parseRound } from './round.js'

const roundFile = { path: 'timer-alarm-round.json', options: { encoding: 'utf8' } }

export function loadRound() {
  try {
    return parseRound(readFileSync(roundFile))
  } catch (error) {
    return null
  }
}

export function saveRound(round) {
  const data = JSON.stringify(round)
  try {
    writeFileSync({ ...roundFile, data })
    return readFileSync(roundFile) === data
  } catch (error) {
    console.log('Could not save round state', error)
    return false
  }
}

export function scheduleCue(round, second) {
  try {
    const alarm = set({
      url: backgroundServiceFile,
      time: round.startedAt / 1000 + second,
      param: JSON.stringify({ id: round.id, second }),
      repeat_type: REPEAT_ONCE,
      store: false,
    })
    return Number.isInteger(alarm) && alarm > 0
  } catch (error) {
    console.log('Could not schedule a vibration cue', error)
    return false
  }
}

export function cancelRoundAlarms() {
  try {
    // Zepp returns only alarm IDs created by this mini app.
    for (const id of getAllAlarms()) cancel(id)
  } catch (error) {
    console.log('Could not clear the alarm queue', error)
  }
}
