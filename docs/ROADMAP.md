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

## Localization (21Board in other languages)

Every word 21Board shows is written in English in `board.js` and `index.html`, and each built-in widget has
its own.

What it would involve:
- A table of strings for each language, and a language setting (synced like the theme and text style, or not).
- Dates and times in the language's own form.
- The language passed to widgets through the SDK (as the theme is), and the built-in widgets translated.
- The README, the widget guide and the AI prompt telling widget authors how.
- Tests in each language. Right-to-left languages would also need the layout mirrored.
