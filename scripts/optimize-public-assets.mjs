import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);
const projectRoot = process.cwd();
const publicRoot = path.join(projectRoot, 'public');
const ffmpegPath = path.join(projectRoot, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');

const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const videoExtensions = new Set(['.mp4', '.mov', '.m4v', '.webm']);

async function walkFiles(dir, output = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const relative = path.relative(publicRoot, fullPath).split(path.sep).join('/');
      if (relative === '__responsive' || relative.startsWith('__responsive/')) continue;
      await walkFiles(fullPath, output);
      continue;
    }

    if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (imageExtensions.has(ext) || videoExtensions.has(ext)) {
        output.push(fullPath);
      }
    }
  }

  return output;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

async function optimizeImage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const stat = await fs.stat(filePath);
  if (stat.size < 128 * 1024) return { changed: false, before: stat.size, after: stat.size };

  const metadata = await sharp(filePath).metadata();
  const maxDimension = metadata.width && metadata.height
    ? Math.max(metadata.width, metadata.height)
    : 0;

  if (!maxDimension || maxDimension <= 1400) {
    return { changed: false, before: stat.size, after: stat.size };
  }

  const tempPath = `${filePath}.tmp`;
  const resizeOptions = {
    width: 1400,
    height: 1400,
    fit: 'inside',
    withoutEnlargement: true,
    kernel: 'lanczos3',
  };

  try {
    if (ext === '.png') {
      await sharp(filePath)
        .rotate()
        .resize(resizeOptions)
        .png({ quality: 80, compressionLevel: 9, adaptiveFiltering: true, palette: true })
        .toFile(tempPath);
    } else {
      await sharp(filePath)
        .rotate()
        .resize(resizeOptions)
        .jpeg({ quality: 68, mozjpeg: true, progressive: true, chromaSubsampling: '4:2:0' })
        .toFile(tempPath);
    }

    const tempStat = await fs.stat(tempPath);

    if (tempStat.size >= stat.size * 0.98) {
      await fs.rm(tempPath, { force: true });
      return { changed: false, before: stat.size, after: stat.size };
    }

    await fs.rm(filePath, { force: true });
    await fs.rename(tempPath, filePath);

    return { changed: true, before: stat.size, after: tempStat.size };
  } catch (error) {
    try {
      await fs.rm(tempPath, { force: true });
    } catch {}
    throw error;
  }
}

async function optimizeVideo(filePath) {
  const stat = await fs.stat(filePath);
  if (stat.size < 2 * 1024 * 1024) {
    return { changed: false, before: stat.size, after: stat.size };
  }

  const tempPath = `${filePath}.tmp.mp4`;
  try {
    await execFileAsync(ffmpegPath, [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-i', filePath,
      '-vf', "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease,scale='trunc(iw/2)*2':'trunc(ih/2)*2'",
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '28',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      tempPath,
    ]);

    const tempStat = await fs.stat(tempPath);

    if (tempStat.size >= stat.size * 0.98) {
      await fs.rm(tempPath, { force: true });
      return { changed: false, before: stat.size, after: stat.size };
    }

    await fs.rm(filePath, { force: true });
    await fs.rename(tempPath, filePath);

    return { changed: true, before: stat.size, after: tempStat.size };
  } catch (error) {
    try {
      await fs.rm(tempPath, { force: true });
    } catch {}
    throw error;
  }
}

async function main() {
  const ffmpegExists = await fs.access(ffmpegPath).then(() => true).catch(() => false);
  if (!ffmpegExists) {
    throw new Error(`ffmpeg not found at ${ffmpegPath}`);
  }

  const files = await walkFiles(publicRoot);
  let imageCount = 0;
  let videoCount = 0;
  let totalBefore = 0;
  let totalAfter = 0;
  let totalSaved = 0;

  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    const beforeStat = await fs.stat(filePath);
    totalBefore += beforeStat.size;

    let result;
    if (imageExtensions.has(ext)) {
      result = await optimizeImage(filePath);
      imageCount += 1;
    } else if (videoExtensions.has(ext)) {
      result = await optimizeVideo(filePath);
      videoCount += 1;
    }

    totalAfter += result ? result.after : beforeStat.size;
    totalSaved += result && result.changed ? (result.before - result.after) : 0;
  }

  console.log(`images=${imageCount} videos=${videoCount}`);
  console.log(`before=${formatBytes(totalBefore)} after=${formatBytes(totalAfter)} saved=${formatBytes(totalSaved)}`);
  console.log(`targetStatus=${totalAfter <= 1400 * 1024 * 1024 ? 'PASS' : 'NEED_MORE_REDUCTION'}`);
}

main().catch((error) => {
  console.error('Optimization failed:', error);
  process.exitCode = 1;
});
