/*
 * 21Board — Sub-app registry
 * ===========================
 * This file is the single list of every sub-app that ships with 21Board.
 * It is loaded by BOTH the board (index.html) and the service worker (sw.js),
 * so anything listed in an app's `files` array is automatically cached for
 * offline use.
 *
 * To add a sub-app:
 *   1. Put it in its own folder:  apps/<id>/index.html  (id = lowercase, a-z 0-9 -)
 *   2. Add an entry below.
 *   3. Bump VERSION in sw.js so installed copies pick up the change.
 *
 * Field reference (see docs/SUBAPP-SDK.md for details):
 *   id           Unique, stable id. NEVER change it after release: saved data is keyed by it.
 *   name         Shown in the App Picker and in the window title bar.
 *   description  One line, shown in Settings.
 *   version      The sub-app's own version string.
 *   entry        Path of the page loaded into the window's iframe.
 *   files        Every file the app needs, so it works offline (entry included).
 *   icon         Inline SVG (24x24 viewBox, stroke icons render white on `color`).
 *   color        Tile color in the App Picker.
 *   window       Default window behavior. Sizes are the CONTENT area in CSS px
 *                (the title bar is added on top).
 *                  width, height       default content size
 *                  minWidth, minHeight minimum content size
 *                  maxWidth, maxHeight optional maximum content size
 *                  aspectRatio         optional width/height lock for the content area
 *                  resizable           false to disable resize grips
 *                  dragFromContent     false if the app needs drags itself (typing or selecting
 *                                      text, drawing...): then it moves by its title bar or with
 *                                      two fingers. Default true: drag from anywhere inside.
 *   permissions  Browser features the iframe may use, e.g. ["microphone"].
 *   devOnly      true = only listed when Developer mode is on (Settings).
 */
self.BOARD21_APPS = [
  {
    id: 'timer',
    name: 'Timer',
    description: 'Countdown timer with presets and an alarm.',
    version: '1.0.0',
    entry: 'apps/timer/index.html',
    files: ['apps/timer/index.html'],
    color: '#ef4444',
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5"/><path d="M10 2.5h4"/><path d="M12 2.5V6"/><path d="M18.5 6.5l1.5-1.5"/></svg>',
    window: { width: 380, height: 260, minWidth: 240, minHeight: 170 },
    permissions: []
  },
  {
    id: 'calendar',
    name: 'Calendar',
    description: 'Month calendar with today highlighted.',
    version: '1.0.0',
    entry: 'apps/calendar/index.html',
    files: ['apps/calendar/index.html'],
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
    entry: 'apps/clock/index.html',
    files: ['apps/clock/index.html'],
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
    entry: 'apps/notes/index.html',
    files: ['apps/notes/index.html', 'apps/notes/fonts/CrayonLibre-21Board.woff2', 'apps/notes/fonts/CrayonLibre-LICENSE.txt', 'apps/notes/fonts/Excalifont-Regular.woff2', 'apps/notes/fonts/Excalifont-OFL.txt'],
    color: '#eab308',
    icon: '<svg viewBox="0 0 24 24"><path d="M4 4h16v10l-6 6H4z"/><path d="M14 20v-6h6"/><path d="M8 9h8"/><path d="M8 13h4"/></svg>',
    window: { width: 320, height: 280, minWidth: 180, minHeight: 120, dragFromContent: false }, // typing: title bar or two fingers
    permissions: []
  },
  {
    id: 'name-picker',
    name: 'Name Picker',
    description: 'Randomly pick a name from your list, with or without repeats.',
    version: '1.0.0',
    entry: 'apps/name-picker/index.html',
    files: ['apps/name-picker/index.html'],
    color: '#8b5cf6',
    icon: '<svg viewBox="0 0 24 24"><circle cx="10" cy="8" r="4"/><path d="M3 21v-1a7 7 0 0 1 11-5.7"/><path d="M17 14l1.2 2.6 2.8.4-2 2 .5 2.8-2.5-1.3-2.5 1.3.5-2.8-2-2 2.8-.4z"/></svg>',
    window: { width: 420, height: 320, minWidth: 260, minHeight: 200 },
    permissions: []
  },
  {
    id: 'dice',
    name: 'Dice',
    description: 'Roll one to six dice.',
    version: '1.0.0',
    entry: 'apps/dice/index.html',
    files: ['apps/dice/index.html'],
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
    entry: 'apps/traffic-light/index.html',
    files: ['apps/traffic-light/index.html'],
    color: '#f97316',
    icon: '<svg viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="19" rx="3"/><circle cx="12" cy="7" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="17" r="1.6"/></svg>',
    window: { width: 170, height: 380, minWidth: 90, minHeight: 200, aspectRatio: 170 / 380 },
    permissions: []
  },
  {
    id: 'sdk-playground',
    name: 'SDK Playground',
    description: 'Developer tool: exercise every 21Board SDK call and watch events.',
    version: '1.0.0',
    entry: 'apps/sdk-playground/index.html',
    files: ['apps/sdk-playground/index.html'],
    color: '#475569',
    icon: '<svg viewBox="0 0 24 24"><path d="M8 7l-5 5 5 5"/><path d="M16 7l5 5-5 5"/><path d="M13.5 4l-3 16"/></svg>',
    window: { width: 520, height: 440, minWidth: 320, minHeight: 260, dragFromContent: false },
    permissions: [],
    devOnly: true
  }
];
