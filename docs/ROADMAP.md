# Future upgrades

Major changes kept for later. None is scheduled: each needs a design of its own before work starts, and
touches the SDK, Board Sync or every widget, so it is more than a widget's own release.

## Storage shared by a widget's windows

A widget's content belongs to one window (`Board21.save`). It syncs, exports and goes back with Board history
with that window, and a new window starts empty. Some lists would be better shared by all of a widget's
windows: the YouTube Player's History (the last 5 videos), today one per window, is the first.

What it would involve:
- A new SDK call, and a new protocol version for widgets that use it.
- Where it is kept: per page, per board (all pages), or per device.
- Board Sync: how changes from two devices are merged.
- Export and import, Board history, and what Reset and Erase clear.
- The widget dev window and the lab.
- Moving each YouTube Player window's History into it.

## Telling copies of a widget apart (names, for finding one again)

A page can have several windows of one widget, open or closed: two Notes, three Timers. Each title bar shows only
the widget's name, and Settings › This page › Saved widgets lists them as "Notes", "Notes 2", "Notes 3". So a
closed one is hard to find again without opening each. Work out ways to identify each copy, so a teacher can find
the one they want later.

What it would involve:
- Ways to identify a copy, to choose from or combine:
  - a name the teacher gives it (Rename… in the window menu);
  - a name the widget suggests from its content (a note's first line, a Timer's time, the YouTube Player's video
    title);
  - a color or mark;
  - when it was last used;
  - a small preview.
- Where it shows: the title bar (at every Size, with room for long names), the window menu, Saved widgets, Board
  history, and Board Sync's labelled copies ("Copy · 9:41 AM").
- Finding one again: Saved widgets sorted or searched by name; perhaps that widget's saved copies offered from its
  tile in the Widget Picker.
- Where it is kept: with the window, not its content. That means deciding:
  - whether it goes into exports, blank templates and Board history;
  - how Board Sync merges a copy renamed on two devices;
  - what Reset does to it.
- The SDK: whether a widget can suggest a name or read the one it was given (a new call, a protocol version), and
  the widget dev window and lab.
- Screen readers: each window's accessible name includes its own name.

## Localization (21Board in other languages)

Every word 21Board shows is written in English in `board.js` and `index.html`, and each built-in widget has
its own.

What it would involve:
- A table of strings for each language, and a language setting (synced like the theme and text style, or not).
- Dates and times in the language's own form.
- The language passed to widgets through the SDK (as the theme is), and the built-in widgets translated.
- The README, the widget guide and the AI prompt telling widget authors how.
- Tests in each language. Right-to-left languages would also need the layout mirrored.
