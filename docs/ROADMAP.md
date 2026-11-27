# Future upgrades

Major changes kept for later. None is scheduled. Each needs its own design before work starts, and each
touches the SDK, Board Sync, or every widget, so it's bigger than one widget's release.

## Storage shared by a widget's windows

A widget's content belongs to one window (`Board21.save`). It syncs, exports, and goes back in Board history
with that window. A new window starts empty. Some lists would be better shared by all of a widget's windows.
The first is the Video Player's History, its last 5 videos, which each window now keeps for itself.

What it would involve:
- A new SDK call, and a new protocol version for widgets that use it.
- Where it is kept: per page, per board (all pages), or per device.
- Board Sync: how changes from two devices are merged.
- Export and import, Board history, and what Reset and Erase clear.
- The dev window and the widget lab.
- Moving each Video Player window's History into it.

## Telling copies of a widget apart

A page can have several windows of one widget, open or closed: two Notes, three Timers. Each title bar shows only
the widget's name. Settings › This page › Windows lists them as "Notes", "Notes 2", "Notes 3". A closed
one is hard to find without opening each. Find ways to tell each copy apart, so a teacher can find the one they
want.

What it would involve:
- Ways to tell a copy apart, alone or combined:
  - a name the teacher gives it (Rename… in the window menu);
  - a name the widget suggests from its content (a note's first line, a Timer's time, the Video Player's video
    title);
  - a color or mark;
  - when it was last used;
  - a small preview.
- Where it shows: the title bar (at every Size, with room for long names), the window menu, This page › Windows,
  Board history, and Board Sync's labeled copies ("Copy · 9:41 AM").
- Finding one again: This page › Windows sorted or searched by name, or a widget's saved copies offered from its
  tile in the Widget Picker.
- Where it is kept: with the window, not its content. That means deciding:
  - whether it goes into exports, blank templates, and Board history;
  - how Board Sync merges a copy renamed on two devices;
  - what Reset does to it.
- The SDK: whether a widget can suggest a name or read the one it was given, which means a new call and protocol
  version. Also the dev window and the widget lab.
- Screen readers: each window's accessible name includes its own name.

## 21Board in other languages

Done:
- The SDK reads each widget's words table, with plurals, and shows dates in the window's language. Numbers stay in
  English form.
- The Timer and the Traffic Light have their words in English, Spanish, Russian, and Ukrainian.

Next:
- A Language row in each window's menu, and a default for new windows in Settings.
- Then the other widgets, a few at a time.
- Then the board's own words. Its menus and Settings stay English for now.
