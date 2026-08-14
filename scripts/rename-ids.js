const fs = require('fs');
const path = require('path');

// === CONFIG ===
const VIDEO_DIR = 'E:\\videos';
const THUMB_DIR = 'C:\\thumbnails';
const DB_FILE = path.join(__dirname, '..', 'data', 'database.json');
const DESC_FILE = path.join(__dirname, '..', 'data', 'video-descriptions.json');
const REF_FILE = path.join(__dirname, '..', 'data', 'rename-reference.json');
const REDIRECT_FILE = path.join(__dirname, '..', 'data', 'old-id-redirects.json');

// Vulgar words to strip (Google penalizes these)
const VULGAR = new Set([
  // Malay explicit
  'skandal','pancut','henjut','lucah','batang','kulum','pepek','isap','crot','bontot','jilat','bogel',
  // English explicit
  'doggy','squirt','fuck','fucks','fucking','fucked','cum','cums','cumming',
  'slut','blowjob','creampie','gangbang','doublepenetration','buttfuck',
  'masturbation','bdsm','titfuck','footjob','deepthroat','cowgirl','anal','rimjob',
  'threesome','foursome','handjob','squirting','blowjobs','handjobs','creampies',
  // Non-consensual / degrading
  'revenge','non-con','blackmail','objectification','degradation',
  // Sex acts
  'sex','seks','sexual','seduction','seducing',
  // Brand terms
  'xxx','xnxx','xvideo','hentai','nsfw'
]);

function sanitize(id) {
  const parts = id.split('-');
  const lastPart = parts[parts.length - 1];
  const isHash = /^[A-Fa-f0-9]{6}$/.test(lastPart);
  const hash = isHash ? lastPart : '';
  const descriptive = isHash ? parts.slice(0, -1) : parts;
  // Strip vulgar, strip duplicates, strip empty
  const seen = new Set();
  const cleaned = [];
  for (const w of descriptive) {
    const low = w.toLowerCase();
    if (VULGAR.has(low)) continue;
    if (seen.has(low)) continue;
    seen.add(low);
    cleaned.push(w);
  }
  if (cleaned.length === 0) cleaned.push('video');
  return cleaned.join('-') + (hash ? '-' + hash : '');
}

// === LOAD DATA ===
console.log('Loading database...');
const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const vids = db.collections.find(c => c.name === 'videos').data;

let descs = {};
if (fs.existsSync(DESC_FILE)) {
  descs = JSON.parse(fs.readFileSync(DESC_FILE, 'utf8'));
}

// === BUILD MAPPING ===
console.log('Building rename mapping...');
const mapping = []; // { oldId, newId }
let changed = 0, unchanged = 0;

for (const v of vids) {
  if (!v.id) continue;
  const newId = sanitize(v.id);
  if (newId !== v.id) {
    mapping.push({ oldId: v.id, newId });
    changed++;
  } else {
    unchanged++;
  }
}

console.log(`\nStats: ${changed} to rename, ${unchanged} unchanged, ${vids.length} total`);

// === CHECK COLLISIONS ===
const newIds = new Set(mapping.map(m => m.newId));
// Also check against unchanged IDs
for (const v of vids) {
  const newId = sanitize(v.id);
  if (newId === v.id) newIds.add(newId); // unchanged ones keep their ID
}
const allNewIds = [...newIds];
const uniqCount = new Set(allNewIds).size;
console.log(`Unique new IDs: ${uniqCount} (expected: ${vids.length})`);

if (uniqCount !== vids.length) {
  console.error('COLLISION DETECTED! Aborting.');
  process.exit(1);
}

// === RENAME PHYSICAL FILES ===
function renameFiles(dir, exts, idMap) {
  if (!fs.existsSync(dir)) {
    console.log(`  Directory not found: ${dir}`);
    return 0;
  }
  let renamed = 0;
  for (const { oldId, newId } of idMap) {
    for (const ext of exts) {
      const oldFile = path.join(dir, oldId + ext);
      const newFile = path.join(dir, newId + ext);
      if (fs.existsSync(oldFile)) {
        try {
          fs.renameSync(oldFile, newFile);
          renamed++;
        } catch (e) {
          console.error(`  Failed: ${oldId}${ext} -> ${e.message}`);
        }
      }
    }
  }
  return renamed;
}

console.log('\n--- Renaming video files (E:\\videos) ---');
const videoRenamed = renameFiles(VIDEO_DIR, ['.mp4', '.MP4'], mapping);
console.log(`  Renamed: ${videoRenamed} video files`);

console.log('\n--- Renaming thumbnails (C:\\thumbnails) ---');
const thumbRenamed = renameFiles(THUMB_DIR, ['.jpg', '.JPG', '.webp', '.WEBP'], mapping);
console.log(`  Renamed: ${thumbRenamed} thumbnail files`);

// === UPDATE DATABASE.JSON ===
console.log('\nUpdating database.json...');
const idMap = {};
mapping.forEach(m => { idMap[m.oldId] = m.newId; });

let dbUpdated = 0;
for (const v of vids) {
  if (idMap[v.id]) {
    v.id = idMap[v.id];
    dbUpdated++;
  }
}
fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
console.log(`  Updated ${dbUpdated} video entries in database.json`);

// === UPDATE VIDEO-DESCRIPTIONS.JSON ===
console.log('Updating video-descriptions.json...');
let descUpdated = 0;
const newDescs = {};
for (const [key, val] of Object.entries(descs)) {
  if (idMap[key]) {
    newDescs[idMap[key]] = val;
    descUpdated++;
  } else {
    newDescs[key] = val;
  }
}
fs.writeFileSync(DESC_FILE, JSON.stringify(newDescs, null, 2), 'utf8');
console.log(`  Updated ${descUpdated} description keys`);

// === SAVE REFERENCE FILE ===
console.log('Saving rename-reference.json...');
const reference = {
  generatedAt: new Date().toISOString(),
  totalVideos: vids.length,
  renamedCount: changed,
  unchangedCount: unchanged,
  mapping: mapping.map(m => ({ old: m.oldId, new: m.newId }))
};
fs.writeFileSync(REF_FILE, JSON.stringify(reference, null, 2), 'utf8');
console.log(`  Saved ${mapping.length} entries to rename-reference.json`);

// === SAVE REDIRECT MAP ===
console.log('Saving old-id-redirects.json...');
fs.writeFileSync(REDIRECT_FILE, JSON.stringify(idMap, null, 2), 'utf8');
console.log(`  Saved ${Object.keys(idMap).length} redirects to old-id-redirects.json`);

console.log('\n=== DONE ===');
console.log(`Videos renamed: ${videoRenamed}`);
console.log(`Thumbnails renamed: ${thumbRenamed}`);
console.log(`Database updated: ${dbUpdated}`);
console.log(`Descriptions updated: ${descUpdated}`);
console.log(`Reference file: ${REF_FILE}`);
console.log(`Redirect map: ${REDIRECT_FILE}`);
