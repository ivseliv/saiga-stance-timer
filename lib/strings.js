const english = {
  title: 'SAIGA STANCE TIMER',
  duration: 'ROUND LENGTH',
  getReady: 'GET READY',
  remaining: 'TIME LEFT',
  finished: 'ROUND COMPLETE',
  start: 'Start',
  repeat: 'Repeat',
  stop: 'Stop',
  test: 'Test vibration',
  nextCue: 'Next cue in',
  scheduleError: 'Could not schedule vibration cues',
  saveError: 'Could not save the round',
  stopError: 'Could not stop the timer',
  modes: {
    mixed: { label: '30 & 60 s', hint: 'One at :30, two at :00' },
    half: { label: 'Every 30 s', hint: 'One short pulse' },
    minute: { label: 'Every 60 s', hint: 'Two short pulses' },
  },
  preview: {
    single: '0:30 · one pulse',
    double: '1:00 · two pulses',
    finish: 'Finish · long pulse',
  },
}

const russian = {
  title: 'ТАЙМЕР СТОЙКИ',
  duration: 'ДЛИТЕЛЬНОСТЬ',
  getReady: 'ГОТОВЬСЬ',
  remaining: 'ОСТАЛОСЬ',
  finished: 'РАУНД ЗАВЕРШЁН',
  start: 'Старт',
  repeat: 'Повторить',
  stop: 'Стоп',
  test: 'Проверить вибрацию',
  nextCue: 'До сигнала',
  scheduleError: 'Не удалось запланировать сигналы',
  saveError: 'Не удалось сохранить раунд',
  stopError: 'Не удалось остановить таймер',
  modes: {
    mixed: { label: '30 и 60 с', hint: 'Один на :30, два на :00' },
    half: { label: 'Каждые 30 с', hint: 'Один короткий сигнал' },
    minute: { label: 'Каждые 60 с', hint: 'Два коротких сигнала' },
  },
  preview: {
    single: '0:30 · один импульс',
    double: '1:00 · два импульса',
    finish: 'Финиш · длинный сигнал',
  },
}

export function stringsForLanguage(language) {
  const russianLanguage = 4 // ru-RU in Zepp OS's language mapping.
  return language === russianLanguage ? russian : english
}
