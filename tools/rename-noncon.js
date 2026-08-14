#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const INDEX_FILE = path.join(__dirname, '..', 'data', 'video-index.json');
const VIDEO_DIR = 'E:/videos';
const THUMB_DIR = 'C:/thumbnails';

function renameNoncon(name) {
  return name.replace(/noncon/gi, 'xxx');
}

function main() {
  // 1. Rename video files
  console.log('--- Videos ---');
  if (fs.existsSync(VIDEO_DIR)) {
    for (const f of fs.readdirSync(VIDEO_DIR)) {
      if (/noncon/i.test(f)) {
        const newName = renameNoncon(f);
        fs.renameSync(path.join(VIDEO_DIR, f), path.join(VIDEO_DIR, newName));
        console.log(`  ${f} -> ${newName}`);
      }
    }
  } else {
    console.log('  E:/videos not found, skipping');
  }

  // 2. Rename thumbnail files
  console.log('--- Thumbnails ---');
  if (fs.existsSync(THUMB_DIR)) {
    for (const f of fs.readdirSync(THUMB_DIR)) {
      if (/noncon/i.test(f)) {
        const newName = renameNoncon(f);
        fs.renameSync(path.join(THUMB_DIR, f), path.join(THUMB_DIR, newName));
        console.log(`  ${f} -> ${newName}`);
      }
    }
  } else {
    console.log('  C:/thumbnails not found, skipping');
  }

  // 3. Update index
  console.log('--- Index ---');
  if (fs.existsSync(INDEX_FILE)) {
    const raw = fs.readFileSync(INDEX_FILE, 'utf8');
    const videos = JSON.parse(raw);
    let changed = 0;
    for (const v of videos) {
      if (/noncon/i.test(v.id) || /noncon/i.test(v.video) || /noncon/i.test(v.thumbnail) || (v.keywords || []).some(k => /noncon/i.test(k))) {
        v.id = renameNoncon(v.id);
        v.name = renameNoncon(v.name);
        v.title = renameNoncon(v.title);
        v.video = renameNoncon(v.video);
        v.thumbnail = renameNoncon(v.thumbnail);
        if (v.keywords) v.keywords = v.keywords.map(k => renameNoncon(k));
        if (v.subTags) v.subTags = v.subTags.map(t => renameNoncon(t));
        changed++;
        console.log(`  Updated: ${v.id}`);
      }
    }
    fs.writeFileSync(INDEX_FILE, JSON.stringify(videos, null, 2), 'utf8');
    console.log(`  ${changed} entries updated in index`);
  } else {
    console.log('  video-index.json not found, skipping');
  }

  console.log('\nDone.');
}

main();
