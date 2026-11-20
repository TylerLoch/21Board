The Teacher Guide: 21Board for K-8 teachers, with every widget.

It's published at https://claude.ai/artifact/2vXnMT4JJAkm5y6dnjC8YG.

## Update it

1. Change the words in `page-src.html`. `[W]` draws ▦, and `[L]` the padlock. `{{tile:id}}` and `{{icon:id}}` draw a
   widget's tile or icon from `tiles.json`. `{{version}}` is the release's name, from `sw.js`.
2. Retake the screenshots that changed: `node docs/teacher-guide/work/shoot.js <scene> …`. With no scene it takes them
   all. The scenes are in `work/scenes.js`.
3. Build it: `node docs/teacher-guide/build.js`.
4. Check it: `node docs/teacher-guide/check.js`.
5. Publish `dist/page.html` to the link above, with the screenshots in `dist/files.json` as its files.

## For IT

- The screenshots come from this checkout of 21Board, served on this computer. Nothing reaches YouTube, Vimeo or
  Google. 21Sketch, 21Timer and 21DocCam are fetched from their sites.
- 21DocCam films `work/worksheet.png`. To change that picture, run `work/worksheet.py` (Python with Pillow), then make
  5 frames at 5 fps and gzip them:
  `ffmpeg -loop 1 -i worksheet.png -frames:v 5 -r 5 -pix_fmt yuvj420p -f yuv4mpegpipe worksheet.y4m && gzip -9 worksheet.y4m`.
