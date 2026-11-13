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
 *   description  One line, shown in Settings.
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
 *   single       true = one window only: the Widget Picker brings it to the front (or opens it again)
 *                instead of opening a second one, and "Add to my board" adds none from a file if the board
 *                has one.
 *   external     true = one of the district's own apps, shown from its own site: `entry` is its https
 *                address and `files` is empty. The app keeps its own work on the device (and its own offline
 *                copy, once it has one); 21Board saves only where its window is. No SDK. (README, "District apps")
 */
self.BOARD21_WIDGETS = [
  {
    id: 'timer',
    name: 'Timer',
    description: 'Countdown timer with presets and an alarm.',
    version: '1.0.0',
    entry: 'widgets/timer/index.html',
    files: ['widgets/timer/index.html'],
    color: '#ef4444',
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5"/><path d="M10 2.5h4"/><path d="M12 2.5V6"/><path d="M18.5 6.5l1.5-1.5"/></svg>',
    window: { width: 380, height: 260, minWidth: 240, minHeight: 170 },
    permissions: []
  },
  {
    id: 'task-timer',
    name: 'Task Timer',
    description: 'A schedule of activities as a pie, with a countdown and an alarm.',
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
    description: 'Month calendar with today highlighted.',
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
    description: 'Analog, digital, or date-only clock.',
    version: '1.0.0',
    entry: 'widgets/clock/index.html',
    files: ['widgets/clock/index.html'],
    color: '#2563eb',
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    window: { width: 300, height: 300, minWidth: 140, minHeight: 140, aspectRatio: 1 },
    permissions: []
  },
  {
    id: 'notes',
    name: 'Notes',
    description: 'A sticky note for directions, reminders, or the day\'s agenda.',
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
    description: 'Pick names from your list at random, one to five at a time: Big name, Spinning wheel, Spotlight, or Lotto.',
    version: '2.0.0',
    entry: 'widgets/name-picker/index.html',
    // (One file for each pick style: the page loads them all.)
    files: ['widgets/name-picker/index.html', 'widgets/name-picker/style-bigname.js', 'widgets/name-picker/style-wheel.js', 'widgets/name-picker/style-spotlight.js', 'widgets/name-picker/style-lotto.js'],
    color: '#8b5cf6',
    icon: '<svg viewBox="0 0 24 24"><circle cx="10" cy="8" r="4"/><path d="M3 21v-1a7 7 0 0 1 11-5.7"/><path d="M17 14l1.2 2.6 2.8.4-2 2 .5 2.8-2.5-1.3-2.5 1.3.5-2.8-2-2 2.8-.4z"/></svg>',
    window: { width: 420, height: 320, minWidth: 260, minHeight: 200 },
    permissions: []
  },
  {
    id: 'first-then-board',
    name: 'First/Then Board',
    description: 'A First/Then picture schedule: pick two cards and mark each one done.',
    version: '1.0.0',
    entry: 'widgets/first-then-board/index.html',
    files: ['widgets/first-then-board/index.html'],
    color: '#65a30d',
    icon: '<svg viewBox="0 0 24 24"><rect x="2" y="5" width="7.5" height="14" rx="1.8"/><rect x="14.5" y="5" width="7.5" height="14" rx="1.8"/><path d="M10.8 12h2.6"/><path d="M12 10.3l1.7 1.7-1.7 1.7"/><path d="M3.9 12.3l1.6 1.6 2.4-3"/></svg>',
    window: { width: 540, height: 360, minWidth: 280, minHeight: 200, dragFromContent: false }, // a search box to type in
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
    permissions: []
  },
  {
    id: 'traffic-light',
    name: 'Traffic Light',
    description: 'Red / yellow / green signal for noise level or work time.',
    version: '1.0.0',
    entry: 'widgets/traffic-light/index.html',
    files: ['widgets/traffic-light/index.html'],
    color: '#f97316',
    icon: '<svg viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="19" rx="3"/><circle cx="12" cy="7" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="17" r="1.6"/></svg>',
    window: { width: 170, height: 380, minWidth: 90, minHeight: 200, aspectRatio: 170 / 380 },
    permissions: []
  },
  // The district's own apps, each from its own site (they keep their own work; see `external` above). Their pages
  // are another site's, so their windows move by the title bar only: dragFromContent false.
  {
    id: '21sketch',
    name: '21Sketch',
    description: 'The district’s drawing whiteboard, from its own site.',
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
    description: 'The district’s classroom timer, from its own site.',
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
    description: 'The district’s document camera, from its own site.',
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
    description: 'Developer tool: exercise every 21Board SDK call and watch events.',
    version: '1.0.0',
    entry: 'widgets/sdk-playground/index.html',
    files: ['widgets/sdk-playground/index.html'],
    color: '#475569',
    icon: '<svg viewBox="0 0 24 24"><path d="M8 7l-5 5 5 5"/><path d="M16 7l5 5-5 5"/><path d="M13.5 4l-3 16"/></svg>',
    window: { width: 520, height: 440, minWidth: 320, minHeight: 260, dragFromContent: false },
    permissions: [],
    devOnly: true
  }
];
