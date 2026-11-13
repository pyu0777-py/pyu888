const fs = require('fs');
const path = require('path');
const root = 'E:\my-new-site\public';
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
const videoExtensions = new Set(['.mp4', '.webm', '.mov']);

async function loadProjectCards(rootPath) {
  const monthEntries = await fs.promises.readdir(rootPath, { withFileTypes: true });
  const projectFolders = [];
  for (const monthEntry of monthEntries) {
    if (!monthEntry.isDirectory()) continue;
    const monthPath = path.join(rootPath, monthEntry.name);
    const folderEntries = await fs.promises.readdir(monthPath, { withFileTypes: true });
    for (const folderEntry of folderEntries) {
      if (!folderEntry.isDirectory()) continue;
      projectFolders.push({ folderName: folderEntry.name, folderPath: path.join(monthPath, folderEntry.name) });
    }
  }
  if (!projectFolders.length) {
    for (const entry of monthEntries) {
      if (!entry.isDirectory()) continue;
      const folderPath = path.join(rootPath, entry.name);
      const childEntries = await fs.promises.readdir(folderPath, { withFileTypes: true });
      const hasSupportedMediaFiles = childEntries.some((child) => child.isFile() && (imageExtensions.has(path.extname(child.name).toLowerCase()) || videoExtensions.has(path.extname(child.name).toLowerCase())));
      if (!hasSupportedMediaFiles) continue;
      projectFolders.push({ folderName: entry.name, folderPath });
    }
  }
  const projectCards = await Promise.all(projectFolders.map(async ({ folderName, folderPath }) => {
    const fileEntries = await fs.promises.readdir(folderPath, { withFileTypes: true });
    const fileNames = fileEntries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }));
    const images = fileNames.filter((f) => imageExtensions.has(path.extname(f).toLowerCase())).map((f) => '/' + path.relative(root, path.join(folderPath, f)).split(path.sep).join('/'));
    const videoFileNames = fileNames.filter((f) => videoExtensions.has(path.extname(f).toLowerCase()));
    const videos = videoFileNames.map((f) => '/' + path.relative(root, path.join(folderPath, f)).split(path.sep).join('/'));
    const previewVideoSrc = videoFileNames[0] ? '/' + path.relative(root, path.join(folderPath, videoFileNames[0])).split(path.sep).join('/') : undefined;
    const coverImageFileName = fileNames.find((f) => path.parse(f).name === '0' && imageExtensions.has(path.extname(f).toLowerCase()));
    const coverSrc = coverImageFileName ? '/' + path.relative(root, path.join(folderPath, coverImageFileName)).split(path.sep).join('/') : (images[0] ?? previewVideoSrc);
    if (!coverSrc) return null;
    return { folderName, coverSrc, images, videos, imageCount: images.length, sortTime: (await fs.promises.stat(folderPath)).mtimeMs };
  }));
  const filtered = projectCards.filter(Boolean).sort((a, b) => b.sortTime - a.sortTime || a.folderName.localeCompare(b.folderName, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }));
  console.log('projectCards length', filtered.length);
  console.log(filtered.slice(0, 5).map((x) => ({ folderName: x.folderName, coverSrc: x.coverSrc, imageCount: x.imageCount, videoCount: x.videos.length })));
}

loadProjectCards(path.join(root, '2c', '2y')).catch((err) => { console.error(err); process.exit(1); });
