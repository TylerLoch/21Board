/*
 * 21Board Video Player: reading a video's link (video-links.js)
 * ===============================================================
 * The one place that knows what a YouTube, Google Drive or Vimeo link looks like. The Video Player reads the link box
 * with it, and the board uses it to tell whether text pasted or dropped on the board is a video's link (board.js,
 * section 15c), so the two never disagree. Plain JavaScript, no dependencies: load it with <script src> (it defines
 * self.B21VideoLinks) or require() it from Node.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.B21VideoLinks = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MAX_LINK = 2000, MAX_START = 86400;   // characters; seconds (a day)
  const ID_RE = /^[A-Za-z0-9_-]{11}$/;
  const isId = s => ID_RE.test(s) && s !== 'videoseries';   // (embed/videoseries is a playlist's embed address, not a video)
  // Each site's ids and keys, checked before any of them goes into an address: a Drive file's id (28 or 33 characters
  // today, 44 for some), its resource key; Vimeo's number, an unlisted video's hash (10 hex digits today).
  const DRIVE_ID = /^[A-Za-z0-9_-]{25,50}$/, DRIVE_KEY = /^[A-Za-z0-9_-]{8,64}$/;
  const VIMEO_ID = /^[1-9][0-9]{0,11}$/, VIMEO_HASH = /^[0-9a-f]{8,16}$/;

  // "1h2m3s", "1m30s", "90s" or "90" → seconds (0: none, or not a time).
  function seconds(t) {
    const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/i.exec(String(t || '').trim());
    if (!m || !(m[1] || m[2] || m[3])) return 0;
    const s = (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
    return s > 0 && s <= MAX_START ? s : 0;
  }
  // Text with a link to a video in it → { video: { source, id, hash, resourceKey, start, link } } (link: the part of
  // the text that is the link, so a sentence, quotes or brackets around it are left out, as is the rest of an embed
  // code), or { why } if there is none: what the link box says (the Video Player's SAY), from the first link that told
  // what it is.
  function readText(text) {
    const all = String(text == null ? '' : text).replace(/&amp;/gi, '&').trim();   // (an embed code writes & as &amp;)
    if (!all) return { why: 'empty' };
    if (isId(all)) return { video: { source: 'youtube', id: all, start: 0, link: all } };
    let why = null;
    // (Words are split at quotes too, curly ones and guillemets as well: Docs, Slides and Word write those.)
    for (const word of all.split(/[\s"'\u2018-\u201f\u00ab\u00bb\u2039\u203a\u200b-\u200d\u2060]+/)) {
      const r = fromAddress(word.replace(/^[(<\[]+|[)>\].,;:!?\u3001\u3002\uff0c]+$/g, ''));
      if (r && r.video) return r;
      if (r && r.why && !why) why = r.why;
    }
    return { why: why || 'none' };
  }
  // Text that is just one link to a video, pasted or dropped on the board → that link (trimmed), else ''. Not a
  // sentence with a link in it, an embed code, an id on its own (eleven letters could be anything) or a link to a
  // folder or a list: those do nothing on the board.
  function oneLink(text) {
    const t = String(text == null ? '' : text).trim();
    if (!t || t.length > MAX_LINK || /\s/.test(t) || isId(t)) return '';
    const r = readText(t);
    return r.video ? t : '';
  }
  function fromAddress(word) {
    let u;
    try { u = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(word) ? word : 'https://' + word); } catch (e) { return null; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    const host = u.hostname, path = u.pathname.split('/').filter(Boolean);
    const r = host === 'youtu.be' || host === 'www.youtu.be' || /^((www|m|music)\.)?youtube\.com$/.test(host) || /^(www\.)?youtube-nocookie\.com$/.test(host) ? fromYouTube(u, host, path)
      : host === 'drive.google.com' || host === 'docs.google.com' ? fromDrive(u, host, path)
      : /^((www|player)\.)?vimeo\.com$/.test(host) ? fromVimeo(u, host, path) : null;
    if (r && r.video) r.video.link = word;
    return r;
  }
  const timeIn = (u, ...names) => seconds(names.map(n => u.searchParams.get(n)).find(t => t) || new URLSearchParams(u.hash.slice(1)).get('t'));
  // youtube.com (www., m., music.) /watch?v=…, /embed/…, /v/…, /shorts/…, /live/…; youtube-nocookie.com; youtu.be/….
  // A playlist (a link with a list and no video in it) or a channel is a list.
  function fromYouTube(u, host, path) {
    let id = null;
    if (host === 'youtu.be' || host === 'www.youtu.be') id = path.length === 1 ? path[0] : null;
    else if (path.length === 1 && path[0] === 'watch') id = u.searchParams.get('v');
    else if (path.length === 2 && /^(embed|v|shorts|live)$/.test(path[0])) id = path[1];
    if (id && isId(id)) return { video: { source: 'youtube', id, start: timeIn(u, 't', 'start') } };
    return path[0] === 'playlist' || (path[0] === 'embed' && path[1] === 'videoseries') || u.searchParams.get('list') || /^@./.test(path[0] || '') || /^(channel|c|user)$/.test(path[0] || '') ? { why: 'list' } : null;
  }
  // drive.google.com/file/d/<id>/… (also /file/u/<n>/d/<id>/…, and a school's older /a/<domain>/file/d/<id>/…),
  // /open?id=<id>, /uc?id=<id>; docs.google.com/file/d/<id>/…; with the resource key, if any. Drive's player has no
  // start time. A folder, or a Google Doc, Sheet or Slides, is not a video.
  const DOCS = { document: 'doc', spreadsheets: 'sheet', presentation: 'slides' };
  function fromDrive(u, host, path) {
    const p = path[0] === 'a' && path.length > 2 ? path.slice(2) : path;
    let id = null;
    if (p[0] === 'file') { const q = p[1] === 'u' && /^\d+$/.test(p[2] || '') ? p.slice(3) : p.slice(1); if (q[0] === 'd') id = q[1] || null; }
    else if (host === 'drive.google.com' && p.length === 1 && (p[0] === 'open' || p[0] === 'uc')) id = u.searchParams.get('id');
    else if (host === 'drive.google.com' && /^(drive|folderview|embeddedfolderview)$/.test(p[0] || '')) return { why: 'folder' };
    else if (host === 'docs.google.com' && Object.prototype.hasOwnProperty.call(DOCS, p[0] || '')) return { why: DOCS[p[0]] };
    const key = u.searchParams.get('resourcekey');
    if (!id || !DRIVE_ID.test(id) || (key !== null && !DRIVE_KEY.test(key))) return null;
    return { video: { source: 'drive', id, resourceKey: key || '', start: 0 } };
  }
  // vimeo.com/<id>, /<id>/<hash> (unlisted), /channels/<name>/<id>, /groups/<name>/videos/<id>,
  // /showcase/<n>/video/<id>, /manage/videos/<id>(/<hash>) (the uploader's own address for it);
  // player.vimeo.com/video/<id>?h=<hash>; a start time (#t=90, #t=1m30s). A showcase, album, channel, group (with no
  // video's number at its end) or someone's page is a list.
  function fromVimeo(u, host, path) {
    let id = null, hash = '';
    if (host === 'player.vimeo.com') { if (path.length === 2 && path[0] === 'video') { id = path[1]; hash = u.searchParams.get('h') || ''; } }
    else if (/^\d+$/.test(path[0] || '')) { if (path.length <= 2) { id = path[0]; hash = path[1] || ''; } }
    else if (/^(channels|groups)$/.test(path[0]) && !/^\d+$/.test(path[path.length - 1])) return { why: 'list' };
    else if (path[0] === 'channels' && path.length === 3) id = path[2];
    else if (path[0] === 'groups' && path.length === 4 && path[2] === 'videos') id = path[3];
    else if ((path[0] === 'showcase' || path[0] === 'album') && path.length === 4 && path[2] === 'video') id = path[3];
    else if (path[0] === 'manage' && path[1] === 'videos' && (path.length === 3 || path.length === 4)) { id = path[2]; hash = path[3] || ''; }
    else if (/^(showcase|album|channels|groups)$/.test(path[0] || '') || (/^[A-Za-z][\w-]*$/.test(path[0] || '') && (path.length === 1 || (path.length === 2 && path[1] === 'videos')))) return { why: 'list' };
    if (!id || !VIMEO_ID.test(id) || (hash && !VIMEO_HASH.test(hash))) return null;
    return { video: { source: 'vimeo', id, hash, start: timeIn(u, 't') } };
  }

  return Object.freeze({ readText, oneLink, isId, DRIVE_ID, DRIVE_KEY, VIMEO_ID, VIMEO_HASH, MAX_LINK, MAX_START });
}));
