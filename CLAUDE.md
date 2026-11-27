# 21Board

A static, offline PWA "smartboard OS" for CCSD21 (K-8). See README.md, docs/WIDGET-SDK.md, and docs/DATA-FORMAT.md.

## Core value

Your work is stored only on the device, and in the teacher's school Google Drive folder when Board Sync is on.
21Board has no servers. Going online for updates, district apps, videos, and the weather is fine. Storing user data
online is not.

## Voice: every label and every line of prose

Write like Apple. Less is more. Every word must earn its place.

- Short, clear, warm. One idea per sentence. Fragments are fine ("Never on the Internet.").
- Lead with what the teacher cares about. Leave out how it works unless they need it.
- Cut hedges, qualifiers, parentheticals, and stacked clauses. If a sentence needs "(…)", rewrite it or drop it.
- Use teachers' words (board, window, widget, page), not the system's.
- Labels: one to three words, sentence case, no end punctuation. Buttons are verbs. A hint is one short sentence.
- Every list of three or more takes the Oxford comma, such as "red, yellow, and green".
- Messages say what happened and what to do, in a few words: "That's a folder. Paste a link to one video."
- No AI tells: em-dash asides, "not X but Y", colon reveals, "worth noting", triplets for rhythm, scare quotes.
- Docs use the same voice. Details for IT go under **For IT**, still short.

Before: "Everything you make stays on this device. 21Board sends nothing to a server, except that a YouTube Player
window loads its video, and the titles of the videos in its History, from YouTube."
After: "Your work is stored only on this device."

## Languages

Widgets come in English, Spanish, Russian, and Ukrainian. Each window shows the language the teacher picks. A new
widget ships all four. The rest get them one at a time, as docs/ROADMAP.md lists.

- Every word a window shows lives in its widget's words table, all four languages side by side. Never in code.
- Show them through the SDK, with `Board21.t()`, `Board21.ui()`, or `data-t`.
- A new or changed word gets all four languages in the same change. Run `node tools/words.js` before you commit.
- Spanish is US Spanish with Mexican words. Ukrainian is Ukrainian, never Russian in Ukrainian letters.
- docs/GLOSSARY.md has the words CCSD21 uses. Use them first.
- Write for students. Short, plain, and warm, at their reading level.
- Math always follows English rules, with a point for decimals and a comma for thousands.
- Dates follow the window's language. Weeks start on Sunday. Clocks show 12 hours unless the teacher picks 24.
- A widget's menu rows and title bar words stay English for now. They still go in its words table.
- Every font a widget uses needs Latin and Cyrillic letters.
- Save keys in data and config, never the words shown.
- No translation services, on the device or online.
- Draft each translation, then have a second agent check it. Our reviewers check it later in the Sheet.
- Lists in Spanish, Russian, and Ukrainian take no Oxford comma.

## Releasing

Every release follows docs/RELEASING.md, from the spec to the report. A small change takes its short path. Every other
release runs tools/release-workflow.js, which builds, reviews, and fixes it. GitHub runs the whole test file on every
push. tools/ci-wait.js waits for it and prints the failures. Run it in the background.

## Calculator manual

docs/calculator-manual/ is the Calculator's manual, published at https://claude.ai/artifact/8p3dg4r8xSduSD2DmNVjXB.
When the Calculator changes, update the manual in the same change. Build it, check it, then publish it again to that
link.

## Teacher Guide

docs/teacher-guide/ is the Teacher Guide, published at https://claude.ai/artifact/2vXnMT4JJAkm5y6dnjC8YG.
Every change to the interface, a widget, or how the board behaves updates the guide in the same change: its words and
the screenshots that show it. Build it, check it, then publish it again to that link. Its README has the steps.
