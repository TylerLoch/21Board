/*
 * 21Board — Widget registry
 * ===========================
 * This file is the single list of every widget that ships with 21Board.
 * It is loaded by BOTH the board (index.html) and the service worker (sw.js),
 * so anything listed in a widget's `files` array is automatically cached for
 * offline use.
 *
 * To add a widget:
 *   1. Put it in its own folder:  widgets/<id>/index.html  (id = lowercase, a-z 0-9 -)
 *   2. Add an entry below.
 *   3. Bump VERSION in sw.js and run `node tools/release.js`, so installed copies pick up the change.
 *
 * Field reference (see docs/WIDGET-SDK.md for details):
 *   id           Unique, stable id. NEVER change it after release: saved data is keyed by it.
 *   name         Shown in the Widget Picker and in the window title bar.
 *   description  The tile's tooltip in the Widget Picker. One short sentence that starts with a verb.
 *   version      The widget's own version string.
 *   entry        Path of the page loaded into the window's iframe.
 *   files        Every file the widget needs, so it works offline (entry included).
 *   icon         Inline SVG (24x24 viewBox, stroke icons render white on `color`).
 *   color        Tile color in the Widget Picker.
 *   window       Default window behavior. Sizes are the CONTENT area in CSS px
 *                (the title bar is added on top).
 *                  width, height       default content size
 *                  minWidth, minHeight minimum content size
 *                  maxWidth, maxHeight optional maximum content size
 *                  aspectRatio         optional width/height lock for the content area
 *                  resizable           false to disable resize grips
 *                  dragFromContent     false if the widget needs drags itself (typing or selecting
 *                                      text, drawing...): then it moves by its title bar or with
 *                                      two fingers. Default true: drag from anywhere inside.
 *   permissions  Browser features the iframe may use, e.g. ["microphone"].
 *   devOnly      true = only listed when Developer mode is on (Settings).
 *   single       true = one window only. The Widget Picker brings it to the front, or opens it again, instead
 *                of opening a second one. Adding a file's windows skips it when the board already has one.
 *   clash        'later' = when two devices change the same window at once, Board Sync keeps the later change.
 *                Use it when the content is only a setting, such as a timer's time. Otherwise both are kept, one as a copy.
 *   external     true = one of the district's own apps, loaded from its own site. `entry` is its https address
 *                and `files` is empty. The app keeps its own work, and its own offline copy once it has one.
 *                21Board saves only where its window is. No SDK. For the Traffic Light, the board reads how much
 *                time 21Timer has left. It stores nothing. See README, "District apps".
 */
self.BOARD21_WIDGETS = [
  {
    id: 'timer',
    name: 'Timer',
    description: 'Count down with presets and an alarm.',
    version: '1.0.0',
    entry: 'widgets/timer/index.html',
    files: ['widgets/timer/index.html'],
    color: '#ef4444',
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5"/><path d="M10 2.5h4"/><path d="M12 2.5V6"/><path d="M18.5 6.5l1.5-1.5"/></svg>',
    window: { width: 380, height: 260, minWidth: 240, minHeight: 170 },
    clash: 'later',
    permissions: []
  },
  {
    id: 'stopwatch',
    name: 'Stopwatch',
    description: 'Count up with laps and a class record.',
    version: '1.0.0',
    entry: 'widgets/stopwatch/index.html',
    files: ['widgets/stopwatch/index.html'],
    color: '#a16207',
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="14" r="7.5"/><path d="M12 14l3.2-3.2"/><rect x="9.5" y="1.8" width="5" height="2.6" rx="1" fill="currentColor" stroke="none"/><path d="M12 4.4v2.1"/><path d="M17.6 7.1l1.6-1.6"/><path d="M18.4 4.6l1.8 1.8"/><path d="M12 8.2v1.2M17.8 14h-1.2M12 19.8v-1.2M6.2 14h1.2"/></svg>',
    window: { width: 600, height: 380, minWidth: 280, minHeight: 200 },
    clash: 'later',   // its content is a run's state and the class's records, like a timer's time
    permissions: []
  },
  {
    id: 'task-timer',
    name: 'Task Timer',
    description: 'Count down a schedule of activities on a pie, with an alarm.',
    version: '1.0.0',
    entry: 'widgets/task-timer/index.html',
    files: ['widgets/task-timer/index.html'],
    color: '#0891b2',
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 12V3.5a8.5 8.5 0 0 1 8.5 8.5z" fill="currentColor"/><path d="M12 12l-6 6"/></svg>',
    window: { width: 420, height: 480, minWidth: 300, minHeight: 350, dragFromContent: false }, // typing in its editor: title bar or two fingers
    permissions: []
  },
  {
    id: 'calendar',
    name: 'Calendar',
    description: 'See the month, with today highlighted.',
    version: '1.0.0',
    entry: 'widgets/calendar/index.html',
    files: ['widgets/calendar/index.html'],
    color: '#db2777',
    icon: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17"/><path d="M8 3v4"/><path d="M16 3v4"/><rect x="13" y="13.5" width="4" height="3.5" rx="0.8" fill="currentColor" stroke="none"/></svg>',
    window: { width: 420, height: 380, minWidth: 220, minHeight: 200 },
    permissions: []
  },
  {
    id: 'clock',
    name: 'Clock',
    description: 'Show the time, analog or digital, and the date.',
    version: '2.0.0',
    entry: 'widgets/clock/index.html',
    files: ['widgets/clock/index.html'],
    color: '#2563eb',
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    window: { width: 300, height: 300, minWidth: 140, minHeight: 140 },   // (the Clock sets its own shape lock for each mix)
    clash: 'later',   // its content is a set time and a mark, like a timer's time
    permissions: []
  },
  {
    id: 'notes',
    name: 'Notes',
    description: 'Write directions, reminders, or the day’s agenda.',
    version: '1.1.0',
    entry: 'widgets/notes/index.html',
    files: ['widgets/notes/index.html', 'widgets/notes/fonts/CrayonLibre-21Board.woff2', 'widgets/notes/fonts/CrayonLibre-LICENSE.txt', 'widgets/notes/fonts/Excalifont-Regular.woff2', 'widgets/notes/fonts/Excalifont-OFL.txt'],
    color: '#eab308',
    icon: '<svg viewBox="0 0 24 24"><path d="M4 4h16v10l-6 6H4z"/><path d="M14 20v-6h6"/><path d="M8 9h8"/><path d="M8 13h4"/></svg>',
    window: { width: 320, height: 280, minWidth: 180, minHeight: 120, dragFromContent: false }, // typing: title bar or two fingers
    permissions: []
  },
  {
    id: 'name-picker',
    name: 'Name Picker',
    description: 'Pick names at random, or make groups and brackets.',
    version: '2.0.0',
    entry: 'widgets/name-picker/index.html',
    // (One file for each pick style, and for each of Versus's looks: the page loads them all.)
    files: ['widgets/name-picker/index.html', 'widgets/name-picker/style-bigname.js', 'widgets/name-picker/style-wheel.js', 'widgets/name-picker/style-spotlight.js', 'widgets/name-picker/style-lotto.js', 'widgets/name-picker/style-versus.js',
      'widgets/name-picker/vs-lightning.js', 'widgets/name-picker/vs-forged.js', 'widgets/name-picker/vs-crest.js', 'widgets/name-picker/vs-comic.js', 'widgets/name-picker/vs-flame.js',
      'widgets/name-picker/style-groups.js', 'widgets/name-picker/style-bracket.js'],
    color: '#8b5cf6',
    icon: '<svg viewBox="0 0 24 24"><circle cx="10" cy="8" r="4"/><path d="M3 21v-1a7 7 0 0 1 11-5.7"/><path d="M17 14l1.2 2.6 2.8.4-2 2 .5 2.8-2.5-1.3-2.5 1.3.5-2.8-2-2 2.8-.4z"/></svg>',
    window: { width: 420, height: 320, minWidth: 260, minHeight: 200 },
    permissions: []
  },
  {
    id: 'first-then-board',
    name: 'First/Then Board',
    description: 'Pick a First card and a Then card, and mark each one done.',
    version: '1.0.0',
    entry: 'widgets/first-then-board/index.html',
    files: ['widgets/first-then-board/index.html'],
    color: '#65a30d',
    icon: '<svg viewBox="0 0 24 24"><rect x="2" y="5" width="7.5" height="14" rx="1.8"/><rect x="14.5" y="5" width="7.5" height="14" rx="1.8"/><path d="M10.8 12h2.6"/><path d="M12 10.3l1.7 1.7-1.7 1.7"/><path d="M3.9 12.3l1.6 1.6 2.4-3"/></svg>',
    window: { width: 540, height: 360, minWidth: 280, minHeight: 200, dragFromContent: false }, // a search box to type in
    permissions: []
  },
  {
    // Students' check-ins are its content: no clash, so Board Sync keeps both. Not single: each window keeps its own counts.
    id: 'zones-check-in',
    name: 'Zones Check-In',
    description: 'Check in on how your class feels.',
    version: '1.0.0',
    entry: 'widgets/zones-check-in/index.html',
    files: ['widgets/zones-check-in/index.html'],
    color: '#15803d',
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><circle cx="9" cy="9.75" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="9.75" r="1.1" fill="currentColor" stroke="none"/></svg>',
    window: { width: 560, height: 420, minWidth: 260, minHeight: 220 },
    permissions: []
  },
  {
    id: 'dice',
    name: 'Dice',
    description: 'Roll one to six dice.',
    version: '1.0.0',
    entry: 'widgets/dice/index.html',
    files: ['widgets/dice/index.html'],
    color: '#10b981',
    icon: '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>',
    window: { width: 360, height: 240, minWidth: 200, minHeight: 160 },
    clash: 'later',
    permissions: []
  },
  {
    id: 'traffic-light',
    name: 'Traffic Light',
    description: 'Show noise level or work time in red, yellow, and green.',
    version: '1.0.0',
    entry: 'widgets/traffic-light/index.html',
    files: ['widgets/traffic-light/index.html'],
    color: '#f97316',
    icon: '<svg viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="19" rx="3"/><circle cx="12" cy="7" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="17" r="1.6"/></svg>',
    window: { width: 170, height: 380, minWidth: 90, minHeight: 90 },   // (no shape lock: wider than tall, it turns sideways)
    clash: 'later',
    permissions: []
  },
  {
    // Its window plays a video from another company's site: YouTube, Google Drive or Vimeo (README). Its id is from
    // when it played YouTube only, kept so saved boards and files still open it.
    id: 'youtube-player',
    name: 'Video Player',
    description: 'Play a video from YouTube, Google Drive, or Vimeo.',
    version: '1.0.0',
    entry: 'widgets/youtube-player/index.html',
    files: ['widgets/youtube-player/index.html', 'widgets/youtube-player/video-links.js'],   // (the board loads video-links.js too)
    color: '#b91c1c',
    icon: '<svg viewBox="0 0 24 24"><rect x="2.5" y="4.5" width="19" height="15" rx="3.5"/><path d="M10 9.2v5.6l4.8-2.8z" fill="currentColor"/></svg>',
    // YouTube's player must be at least 200 × 200 px (kept for all three): where the board draws the window smaller
    // than its CSS size, the widget raises its minimum to match (Board21.window.setMinSize). No shape lock: Shorts are
    // tall.
    window: { width: 480, height: 270, minWidth: 200, minHeight: 200 },
    clash: 'later',   // its content is which video, like a timer's time
    permissions: []
  },
  {
    // A picture opened, pasted or dropped on the board (board.js section 15c opens one of these for each). Its id is
    // 'image', so that a new name changes nothing saved.
    id: 'image',
    name: 'Picture',
    description: 'Show a picture you open or paste.',
    version: '1.0.0',
    entry: 'widgets/image/index.html',
    files: ['widgets/image/index.html'],
    color: '#c026d3',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.8" cy="9.8" r="1.7"/><path d="M3.5 17.5l5.2-5.2 3.8 3.8 2.6-2.6 5.4 5.4"/></svg>',
    window: { width: 480, height: 360, minWidth: 160, minHeight: 120 },
    clash: 'later',   // its content is which picture, a choice (Board history keeps the other)
    permissions: []
  },
  {
    // Teach's canvas and steps, its keys, and History drawn as Desmos draws its lines. Desmos's math, through its
    // engine (calc-engine.js, tested by tests/calc-engine.js).
    id: 'calculator',
    name: 'Calculator',
    description: 'Work out problems and show each step.',
    version: '1.0.0',
    entry: 'widgets/calculator/index.html',
    files: ['widgets/calculator/index.html', 'widgets/calculator/calc-engine.js'],
    color: '#1e3a8a',
    icon: '<svg viewBox="0 0 24 24"><rect x="5" y="2.5" width="14" height="19" rx="2.5"/><path d="M8.5 6.5h7v3h-7z"/><circle cx="9" cy="13.5" r=".9" fill="currentColor" stroke="none"/><circle cx="12" cy="13.5" r=".9" fill="currentColor" stroke="none"/><circle cx="15" cy="13.5" r=".9" fill="currentColor" stroke="none"/><circle cx="9" cy="17" r=".9" fill="currentColor" stroke="none"/><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none"/><circle cx="15" cy="17" r=".9" fill="currentColor" stroke="none"/></svg>',
    // 900 × 600: the canvas beside the keys from the start, its problem big enough to read from the back of the room,
    // and keys 44 px or more on the screen of a 1366 × 768 Chromebook, where the board draws windows at 57%. Advanced
    // keys make the window taller to keep them so. History still fits beside them. At 280 × 400, the keys under a small
    // display are 44 px.
    window: { width: 900, height: 600, minWidth: 280, minHeight: 400 },
    clash: 'later',   // its content is scratch work, a problem and its History: the later change wins, Board history keeps the other
    permissions: []
  },
  {
    // Goes online for the weather: the forecast and air quality from Open-Meteo, and the weather right now, watches and
    // warnings from the National Weather Service (README, Weather). Offline, it shows the forecast saved in its window.
    // calendar.js is the district's school year, for What to wear.
    id: 'weather',
    name: 'Weather',
    description: 'See the weather and what to wear.',
    version: '1.0.0',
    entry: 'widgets/weather/index.html',
    files: ['widgets/weather/index.html', 'widgets/weather/calendar.js'],
    color: '#0369a1',
    icon: '<svg viewBox="0 0 24 24"><circle cx="9" cy="9" r="3.2"/><path d="M9 2.8v1.4M2.8 9h1.4M4.6 4.6l1 1M13.4 4.6l-1 1"/><path d="M8.5 19.5h9a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6 1 3 3 0 0 0 .2 6z"/></svg>',
    window: { width: 480, height: 360, minWidth: 260, minHeight: 220 },
    clash: 'later',   // its content is the last forecast it saved, which changes by itself: the later one wins, Board history keeps the other
    permissions: []   // (never the device's location: a teacher searches for a town)
  },
  // The district's own apps, each from its own site (they keep their own work; see `external` above). Their pages
  // are another site's, so their windows move by the title bar only: dragFromContent false.
  {
    id: '21sketch',
    name: '21Sketch',
    description: 'Draw with the district’s whiteboard app.',
    entry: 'https://sketchapp.ccsd21.org/',
    files: [],
    color: '#4f46e5',
    icon: '<svg viewBox="0 0 24 24"><path d="M4.5 19.5l.8-4.3L15.6 4.9a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8L8.8 18.7z"/><path d="M13.8 6.7l3.5 3.5"/><path d="M12.5 20.5h7"/></svg>',
    window: { width: 900, height: 560, minWidth: 520, minHeight: 360, dragFromContent: false }, // room for its two toolbars (taller than wide, it hides one)
    permissions: [],
    single: true,
    external: true
  },
  {
    id: '21timer',
    name: '21Timer',
    description: 'Run the district’s classroom timer app.',
    entry: 'https://timerapp.ccsd21.org/',
    files: [],
    color: '#b45309',
    icon: '<svg viewBox="0 0 24 24"><path d="M6 3h12"/><path d="M6 21h12"/><path d="M7.5 3c0 4.5 4.5 5.5 4.5 9s-4.5 4.5-4.5 9"/><path d="M16.5 3c0 4.5-4.5 5.5-4.5 9s4.5 4.5 4.5 9"/></svg>',
    window: { width: 400, height: 300, minWidth: 200, minHeight: 170, dragFromContent: false }, // (the minimum is its own manifest's)
    permissions: [],
    single: true,
    external: true
  },
  {
    id: '21doccam',
    name: '21DocCam',
    description: 'Show work with the district’s document camera app.',
    entry: 'https://doccamapp.ccsd21.org/',
    files: [],
    color: '#0d9488',
    icon: '<svg viewBox="0 0 24 24"><path d="M3 20.5h18"/><path d="M6.5 20.5V5h6.5"/><rect x="12.5" y="3.5" width="7" height="4.5" rx="1.3"/><path d="M16 8v1.8"/><path d="M11.5 20.5l1-3.5h7l1 3.5"/></svg>',
    window: { width: 720, height: 480, minWidth: 360, minHeight: 260, dragFromContent: false },
    permissions: ['camera'],
    single: true,
    external: true
  },
  {
    id: 'sdk-playground',
    name: 'SDK Playground',
    description: 'Try every SDK call with your own values.',
    version: '2.0.0',
    entry: 'widgets/sdk-playground/index.html',
    files: ['widgets/sdk-playground/index.html'],
    color: '#475569',
    icon: '<svg viewBox="0 0 24 24"><path d="M8 7l-5 5 5 5"/><path d="M16 7l5 5-5 5"/><path d="M13.5 4l-3 16"/></svg>',
    window: { width: 720, height: 520, minWidth: 320, minHeight: 260, dragFromContent: false },
    permissions: [],
    devOnly: true
  }
];
