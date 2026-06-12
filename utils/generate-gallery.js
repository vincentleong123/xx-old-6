/**
 * Fast Gallery Generator
 * Lists videos with thumbnails -> links to player
 * Uses existing thumbnails (no generation)
 * Includes SEO meta tags
 */

const path = require('path');
const fs = require('fs');

// ========== CONFIG ==========
const VIDEO_DIR = 'e:/videos';
const THUMBNAIL_DIR = 'e:/videos/thumbnails';
const OUTPUT_HTML = 'd:/all-gallery.html';

// ========== AD CONFIG ==========
const AD_BANNER = `
    <div class="ad-banner">
        <a href="https://lucahthaix.cam/" target="_blank">
            <img src="https://lucahthaix.cam/wp-content/uploads/2025/01/adh.jpg" alt="Visit Our Site">
        </a>
    </div>
`;

const AD_SIDEBAR = `
    <div class="ad-sidebar">
        <a href="https://lucahthaix.cam/" target="_blank">
            <img src="https://lucahthaix.cam/wp-content/uploads/2025/01/ads.jpg" alt="Side Ad">
        </a>
    </div>
`;

// ========== SEO META TAGS ==========
function getVideoTitle(filename) {
    const name = path.basename(filename, path.extname(filename));
    return name.replace(/[-_]/g, ' ').trim();
}

function getSEOMeta(filename, index, total) {
    const title = getVideoTitle(filename);
    return `
        <meta property="og:title" content="${title} - ALL Gallery">
        <meta property="og:description" content="Watch ${title} - Video ${index + 1} of ${total}">
        <meta name="description" content="${title} - ALL Gallery with ${total} videos">
        <meta name="keywords" content="${title.replace(/ /g, ', ')}, video, gallery">`;
}

// ========== HTML TEMPLATE ==========
function generateHTML(videoList) {
    const videoCards = videoList.map((v, i) => `
        <a href="player.html?v=${encodeURIComponent(v.filename)}" class="video-card" title="${escapeHtml(v.filename)}">
            <div class="thumbnail">
                <img src="thumbnails/${path.basename(v.thumbnail)}" alt="${escapeHtml(getVideoTitle(v.filename))}" loading="lazy">
                <span class="duration">${formatDuration(v.duration)}</span>
            </div>
            <div class="info">
                <h3>${escapeHtml(getVideoTitle(v.filename))}</h3>
                <p>${v.width}x${v.height} • ${formatDuration(v.duration)}</p>
            </div>
        </a>`).join('');

    const seoJsonLd = videoList.map(v => ({
        "@context": "https://schema.org",
        "@type": "VideoObject",
        "name": getVideoTitle(v.filename),
        "description": `Watch ${getVideoTitle(v.filename)}`,
        "thumbnailUrl": `file:///e:/videos/thumbnails/${path.basename(v.thumbnail)}`,
        "duration": `PT${Math.floor(v.duration)}S`
    }));

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ALL Gallery - ${videoList.length} Videos | Watch Online</title>
    <link rel="canonical" href="https://lucahthaix.cam/ALL-Gallery/">
    <meta name="robots" content="index, follow">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://lucahthaix.cam/ALL-Gallery/">
    <meta property="og:site_name" content="ALL Gallery">
    <meta property="og:image" content="https://lucahthaix.cam/wp-content/uploads/2025/01/adh.jpg">
    ${videoList.slice(0, 5).map((v, i) => getSEOMeta(v.filename, i, videoList.length)).join('\n')}
    <script type="application/ld+json">${JSON.stringify(seoJsonLd, null, 2)}</script>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #1a1a2e; color: #fff; min-height: 100vh; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px 20px; text-align: center; }
        .header h1 { font-size: 2.5rem; margin-bottom: 10px; }
        .header p { opacity: 0.9; }
        .ad-banner { text-align: center; margin: 20px auto; max-width: 100%; padding: 0 20px; }
        .ad-banner img { max-width: 100%; height: auto; border-radius: 8px; }
        .main-container { display: flex; max-width: 1500px; margin: 0 auto; padding: 30px 20px; gap: 30px; }
        .content { flex: 1; }
        .sidebar { width: 220px; position: sticky; top: 20px; height: fit-content; }
        .ad-sidebar img { width: 100%; border-radius: 8px; }
        .video-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; }
        .video-card { display: block; background: #16213e; border-radius: 12px; overflow: hidden; text-decoration: none; color: inherit; transition: transform 0.2s, box-shadow 0.2s; }
        .video-card:hover { transform: translateY(-5px); box-shadow: 0 10px 30px rgba(102, 126, 234, 0.3); }
        .thumbnail { position: relative; aspect-ratio: 16/9; background: #0f0f23; }
        .thumbnail img { width: 100%; height: 100%; object-fit: cover; }
        .duration { position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.85); padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; }
        .info { padding: 12px 15px; }
        .info h3 { font-size: 0.85rem; margin-bottom: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .info p { font-size: 0.7rem; opacity: 0.6; }
        .stats { text-align: center; padding: 25px; background: #0f0f23; margin-top: 40px; border-radius: 12px; }
        .footer { text-align: center; padding: 30px; background: #0f0f23; margin-top: 30px; }
        .footer a { color: #667eea; }
        @media (max-width: 900px) { .main-container { flex-direction: column; } .sidebar { width: 100%; display: flex; justify-content: center; } .ad-sidebar { width: 300px; } }
        @media (max-width: 600px) { .video-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; } }
    </style>
</head>
<body>
    ${AD_BANNER}
    <header class="header">
        <h1>ALL Gallery</h1>
        <p>${videoList.length} curated videos • Click to watch</p>
    </header>
    <main class="main-container">
        <div class="content">
            <div class="video-grid">${videoCards}</div>
            <div class="stats"><h2>Collection Stats</h2><p>${videoList.length} videos • Updated ${new Date().toLocaleDateString()}</p></div>
        </div>
        <aside class="sidebar">${AD_SIDEBAR}</aside>
    </main>
    <footer class="footer"><p>Part of <a href="https://lucahthaix.cam">lucahthaix.cam</a> Network</p></footer>
</body>
</html>`;
}

// ========== PLAYER PAGE ==========
function generatePlayerHTML(filename) {
    const title = getVideoTitle(filename);
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | ALL Gallery</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, sans-serif; background: #000; color: #fff; min-height: 100vh; display: flex; flex-direction: column; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 15px 20px; display: flex; align-items: center; justify-content: space-between; }
        .header a { color: #fff; text-decoration: none; }
        .player-container { flex: 1; display: flex; align-items: center; justify-content: center; }
        video { width: 100%; max-width: 1200px; }
    </style>
</head>
<body>
    <header class="header"><a href="all-gallery.html">Back to Gallery</a><h1>${title}</h1></header>
    <div class="player-container">
        <video id="video" controls playsinline><source src="file:///e:/videos/${encodeURIComponent(filename)}" type="video/mp4"></video>
    </div>
</body>
</html>`;
}

// ========== UTILS ==========
function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
}

function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function walkDir(dir) {
    const results = [];
    const exts = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv'];
    if (!fs.existsSync(dir)) return results;
    for (const file of fs.readdirSync(dir)) {
        const p = path.join(dir, file);
        const stat = fs.statSync(p);
        if (stat.isDirectory()) results.push(...walkDir(p));
        else if (exts.includes(path.extname(file).toLowerCase())) results.push(p);
    }
    return results;
}

// ========== MAIN ==========
async function main() {
    console.log('========================================');
    console.log('    Fast Gallery Generator');
    console.log('========================================');
    console.log(`Videos: ${VIDEO_DIR}`);
    console.log(`Thumbnails: ${THUMBNAIL_DIR}`);
    console.log('');

    const videos = walkDir(VIDEO_DIR);
    console.log(`Found ${videos.length} videos\n`);

    const videoList = [];
    const noThumbnail = [];

    for (let i = 0; i < videos.length; i++) {
        const videoPath = videos[i];
        const filename = path.basename(videoPath);
        const thumbnailPath = path.join(THUMBNAIL_DIR, path.basename(filename, path.extname(filename)) + '.webp');
        const thumbnailExists = fs.existsSync(thumbnailPath);

        process.stdout.write(`[${i + 1}/${videos.length}] ${filename.substring(0, 45)}... `);

        if (!thumbnailExists) {
            console.log('NO THUMBNAIL');
            noThumbnail.push(filename);
            continue;
        }

        videoList.push({ filename, thumbnail: thumbnailPath, duration: 0, width: 0, height: 0 });
        console.log('OK');
    }

    console.log('\nGenerating gallery...');
    fs.writeFileSync(OUTPUT_HTML, generateHTML(videoList));

    if (videoList.length > 0) {
        const playerPath = path.join(path.dirname(OUTPUT_HTML), 'player.html');
        fs.writeFileSync(playerPath, generatePlayerHTML(videoList[0].filename));
    }

    console.log('\n========== COMPLETE ==========');
    console.log(`Videos: ${videoList.length}`);
    console.log(`Missing thumbnails: ${noThumbnail.length}`);
    console.log(`Output: ${OUTPUT_HTML}`);
}

main().catch(console.error);

