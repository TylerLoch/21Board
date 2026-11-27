// Traffic Light: every word it shows, in English, Spanish, Russian, and Ukrainian.
// window: inside the window. It follows the window's language.
// board: menu rows and the title bar. English for now.
// Change any text in quotes. Rules: docs/TRANSLATING.md.
Board21.words({
  window: {
    red: { note: 'Screen reader name of the red lamp, a button. Just the color word. The title bar shows it in English.',
      en: 'Red',
      es: 'Rojo',
      ru: 'Красный',
      uk: 'Червоний' },
    yellow: { note: 'Screen reader name of the yellow lamp. US lights are yellow, never amber.',
      en: 'Yellow',
      es: 'Amarillo',
      ru: 'Жёлтый',
      uk: 'Жовтий' },
    green: { note: 'Screen reader name of the green lamp.',
      en: 'Green',
      es: 'Verde',
      ru: 'Зелёный',
      uk: 'Зелений' }
  },
  board: {
    'menu.off': { note: 'Menu row. Turns the light off.', en: 'All off' },
    'menu.follow': { note: 'Menu row with a check. The light shows the color of the timer closest to ending.', en: 'Follow timers' }
  }
});
