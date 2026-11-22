# 21Board

A static, offline PWA "smartboard OS" for CCSD21 (K-8). See README.md, docs/WIDGET-SDK.md, and docs/DATA-FORMAT.md.

## Core value

Your work is stored only on the device, and in the teacher's school Google Drive folder when Board Sync is on.
21Board has no servers. Going online for updates, district apps, and videos is fine. Storing user data online is not.

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

## Releasing

Every release follows docs/RELEASING.md, from the spec to the report. tools/release-workflow.js builds, reviews, and
fixes each release. tools/test-halves.js runs the whole test file.

## Calculator manual

docs/calculator-manual/ is the Calculator's manual, published at https://claude.ai/artifact/8p3dg4r8xSduSD2DmNVjXB.
When the Calculator changes, update the manual in the same change. Build it, check it, then publish it again to that
link.

## Teacher Guide

docs/teacher-guide/ is the Teacher Guide, published at https://claude.ai/artifact/2vXnMT4JJAkm5y6dnjC8YG.
Every change to the interface, a widget, or how the board behaves updates the guide in the same change: its words and
the screenshots that show it. Build it, check it, then publish it again to that link. Its README has the steps.
