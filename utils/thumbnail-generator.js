/**
 * Video Thumbnail Generator
 * Grabs 11th second of ALL videos as WebP thumbnail
 */

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const FFMPEG_PATH = 'C:\\Users\\babyka\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.0.1-full_build\\bin';
const FFMPEG = path.join(FFMPEG_PATH, 'ffmpeg.exe');
const FFPROBE = path.join(FFMPEG_PATH, 'ffprobe.exe');

const OUTPUT_DIR = 'e:/videos/thumbnails';
const SEEK_TIME = 11; // 11th second for all videos
const WIDTH = 480;
const HEIGHT = 270;
const QUALITY = 85;
const MIN_DURATION = 12; // Video must be at least 12 seconds

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function getVideoInfo(videoPath) {
  const command = `"${FFPROBE}" -v quiet -print_format json -show_format "${videoPath}"`;
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      try {
        const info = JSON.parse(stdout);
        resolve({
          duration: parseFloat(info.format?.duration || 0)
        });
      } catch (e) {
        reject(new Error('Parse error'));
      }
    });
  });
}

async function extractThumbnail(videoPath, outputPath) {
  const filter = `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2`;
  const command = [
    `"${FFMPEG}"`,
    '-ss', String(SEEK_TIME),
    '-i', `"${videoPath}"`,
    '-vframes', '1',
    '-vf', filter,
    '-c:v', 'libwebp',
    '-q:v', String(QUALITY),
    '-y',
    `"${outputPath}"`
  ].join(' ');

  return new Promise((resolve, reject) => {
    exec(command, { timeout: 120000 }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function processVideo(videoPath) {
  const filename = path.basename(videoPath, path.extname(videoPath));
  const outputPath = path.join(OUTPUT_DIR, `${filename}.webp`);

  if (fs.existsSync(outputPath)) {
    return { videoPath, outputPath, skipped: true };
  }

  try {
    const info = await getVideoInfo(videoPath);
    
    if (info.duration < MIN_DURATION) {
      return { videoPath, outputPath, error: 'Too short' };
    }

    await extractThumbnail(videoPath, outputPath);
    
    if (!fs.existsSync(outputPath)) {
      return { videoPath, outputPath, error: 'Not created' };
    }

    return { videoPath, outputPath, success: true };
  } catch (error) {
    return { videoPath, outputPath, error: error.message };
  }
}

async function processAll(videoDir) {
  const extensions = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv'];
  
  function walk(dir) {
    const results = [];
    if (!fs.existsSync(dir)) return results;
    for (const file of fs.readdirSync(dir)) {
      const p = path.join(dir, file);
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        results.push(...walk(p));
      } else if (extensions.includes(path.extname(file).toLowerCase())) {
        results.push(p);
      }
    }
    return results;
  }

  const videos = walk(videoDir);
  console.log(`Found ${videos.length} videos\n`);

  let success = 0, skipped = 0, errors = 0;

  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    const name = path.basename(v).substring(0, 60);
    process.stdout.write(`[${i + 1}/${videos.length}] ${name}... `);
    
    const r = await processVideo(v);
    
    if (r.success) {
      console.log('OK');
      success++;
    } else if (r.skipped) {
      console.log('SKIP');
      skipped++;
    } else {
      console.log(`FAIL: ${r.error}`);
      errors++;
    }
  }

  console.log(`\n========== RESULTS ==========`);
  console.log(`Total: ${videos.length}`);
  console.log(`Success: ${success}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);
  console.log(`Rate: ${((success / videos.length) * 100).toFixed(1)}%`);
}

// CLI
if (require.main === module) {
  const videoDir = process.argv[2] || 'e:/videos';
  const overwrite = process.argv.includes('--overwrite');
  
  console.log('========================================');
  console.log('    Video Thumbnail Generator');
  console.log('========================================');
  console.log(`Input: ${videoDir}`);
  console.log(`Seek: ${SEEK_TIME}s`);
  console.log(`Overwrite: ${overwrite ? 'Yes' : 'No'}`);
  console.log('');

  if (overwrite) {
    // Delete existing thumbnails first
    if (fs.existsSync(OUTPUT_DIR)) {
      for (const f of fs.readdirSync(OUTPUT_DIR)) {
        if (f.endsWith('.webp')) {
          fs.unlinkSync(path.join(OUTPUT_DIR, f));
        }
      }
    }
  }

  processAll(videoDir).then(() => process.exit(0)).catch(e => {
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { processVideo, processAll };

