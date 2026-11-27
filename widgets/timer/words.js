// Timer: every word it shows, in English, Spanish, Russian, and Ukrainian.
// window: inside the window. It follows the window's language.
// board: menu rows and the title bar. English for now.
// Change any text in quotes. Keep {n} as it is. Rules: docs/TRANSLATING.md.
Board21.words({
  window: {
    'chip.min': { note: 'Preset buttons 1m, 2m, 3m, 5m, 10m, and 15m. The m means minutes. All six share one small row.', max: 6, fill: { n: '15' },
      en: '{n}m',
      es: '{n} min',
      ru: '{n} мин',
      uk: '{n} хв' },
    'chip.label': { note: 'Screen reader name of a preset button. Counts are 1, 2, 3, 5, 10, and 15.',
      en: { one: '{n} minute', other: '{n} minutes' },
      es: { one: '{n} minuto', other: '{n} minutos' },
      ru: { one: '{n} минута', few: '{n} минуты', many: '{n} минут', other: '{n} минуты' },
      uk: { one: '{n} хвилина', few: '{n} хвилини', many: '{n} хвилин', other: '{n} хвилини' } },

    minus: { note: 'Screen reader name of the −1:00 button.',
      en: 'Subtract one minute',
      es: 'Restar un minuto',
      ru: 'Убавить минуту',
      uk: 'Відняти хвилину' },
    plus: { note: 'Screen reader name of the +1:00 button.',
      en: 'Add one minute',
      es: 'Sumar un minuto',
      ru: 'Добавить минуту',
      uk: 'Додати хвилину' }
  },
  board: {
    'title.done': { note: 'Title bar when the time is up.', en: 'Done!' },
    'title.warn': { note: 'Title bar in the warning minutes, when time is almost up.', en: 'Almost done' },
    'title.running': { note: 'Title bar while it counts down.', en: 'Running' },
    'title.paused': { note: 'Title bar when it stops partway.', en: 'Paused' },

    'sound.beep': { note: 'Menu rows from Beep to Alarm are the alarm sounds. Picking one plays it.', en: 'Beep' },
    'sound.chime': { en: 'Chime' },
    'sound.bell': { en: 'Bell' },
    'sound.marimba': { note: 'The instrument.', en: 'Marimba' },
    'sound.gentle': { note: 'A soft, slow sound.', en: 'Gentle' },
    'sound.alarm': { note: 'A loud, buzzing sound.', en: 'Alarm' },
    'sound.off': { note: 'Menu row. No sound at the end.', en: 'No sound' },
    'sound.test': { note: 'Menu row. Plays the chosen sound once.', en: 'Play sound' },

    warn: { note: 'Menu heading over the warning choices. In its last minutes the timer turns amber.', en: 'Warning' },
    'warn.off': { note: 'Menu row under Warning. No warning.', en: 'Off' },
    'warn.minutes': { note: 'Menu rows under Warning. Counts are 1, 2, and 5.', en: { one: '{n} minute', other: '{n} minutes' } }
  },
  dynamic: ['sound.']
});
// Common words used here (edit them in sdk/board21.js):
// b21.start  Start | Iniciar | Старт | Старт
// b21.pause  Pause | Pausar | Пауза | Пауза
// b21.reset  Reset | Restablecer | Сбросить | Скинути
