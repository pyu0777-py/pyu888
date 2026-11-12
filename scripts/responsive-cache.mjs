import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const projectRoot = process.cwd();
const publicRoot = path.join(projectRoot, 'public');
const responsiveRoot = path.join(publicRoot, '__responsive');

const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
const responsiveVariantWidths = [240, 360, 480, 640, 960, 1280];

function getSharpFormat(extension) {
  const normalized = extension.toLowerCase();
  if (normalized === '.jpg' || normalized === '.jpeg') return 'jpeg';
  if (normalized === '.png') return 'png';
  if (normalized === '.webp') return 'webp';
  if (normalized === '.avif') return 'avif';
  return null;
}

async function walkImages(dir, output = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const relative = path.relative(publicRoot, fullPath).split(path.sep).join('/');
      if (relative === '__responsive' || relative.startsWith('__responsive/')) {
        continue;
      }
      await walkImages(fullPath, output);
      continue;
    }

    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (!imageExtensions.has(ext)) continue;
    output.push(fullPath);
  }

  return output;
}

function expectedVariantPaths(sourcePath, sourceWidth) {
  const parsed = path.parse(sourcePath);
  const relativeDir = path.relative(publicRoot, parsed.dir);
  const variantDir = path.join(responsiveRoot, relativeDir);
  const widths = responsiveVariantWidths.filter((width) => width < sourceWidth);

  return widths.map((width) => ({
    width,
    outputPath: path.join(variantDir, `${parsed.name}-w${width}${parsed.ext.toLowerCase()}`),
  }));
}

async function generateVariants(sourcePath, metadata) {
  const ext = path.extname(sourcePath).toLowerCase();
  const sharpFormat = getSharpFormat(ext);

  if (!sharpFormat || ext === '.gif') return { generated: 0, skipped: true };
  if (!metadata.width) return { generated: 0, skipped: true };

  const variants = expectedVariantPaths(sourcePath, metadata.width);
  if (!variants.length) return { generated: 0, skipped: false };

  let generated = 0;

  for (const variant of variants) {
    await fs.mkdir(path.dirname(variant.outputPath), { recursive: true });

    try {
      await fs.access(variant.outputPath);
      continue;
    } catch {
      // File does not exist; generate it.
    }

    let pipeline = sharp(sourcePath).rotate().resize({
      width: variant.width,
      withoutEnlargement: true,
    });

    if (sharpFormat === 'jpeg') pipeline = pipeline.jpeg({ quality: 82, mozjpeg: true });
    if (sharpFormat === 'png') pipeline = pipeline.png({ compressionLevel: 9, palette: true });
    if (sharpFormat === 'webp') pipeline = pipeline.webp({ quality: 82 });
    if (sharpFormat === 'avif') pipeline = pipeline.avif({ quality: 60 });

    await pipeline.toFile(variant.outputPath);
    generated += 1;
  }

  return { generated, skipped: false };
}

async function checkVariants(sourcePath, metadata) {
  const ext = path.extname(sourcePath).toLowerCase();
  const sharpFormat = getSharpFormat(ext);
  if (!sharpFormat || ext === '.gif' || !metadata.width) return [];

  const variants = expectedVariantPaths(sourcePath, metadata.width);
  const missing = [];

  for (const variant of variants) {
    try {
      await fs.access(variant.outputPath);
    } catch {
      missing.push(variant.outputPath);
    }
  }

  return missing;
}

async function run() {
  const mode = process.argv.includes('--check-only')
    ? 'check-only'
    : process.argv.includes('--generate-only')
      ? 'generate-only'
      : 'generate-and-check';

  const sourceImages = await walkImages(publicRoot);

  let generatedCount = 0;
  let skippedCount = 0;
  let checkedCount = 0;
  const missingBySource = [];

  for (const sourcePath of sourceImages) {
    const metadata = await sharp(sourcePath).metadata();

    if (mode !== 'check-only') {
      const generateResult = await generateVariants(sourcePath, metadata);
      generatedCount += generateResult.generated;
      if (generateResult.skipped) skippedCount += 1;
    }

    if (mode !== 'generate-only') {
      checkedCount += 1;
      const missing = await checkVariants(sourcePath, metadata);
      if (missing.length) {
        missingBySource.push({ sourcePath, missing });
      }
    }
  }

  const relative = (targetPath) => path.relative(projectRoot, targetPath).split(path.sep).join('/');

  if (mode !== 'check-only') {
    console.log(`[responsive] sources=${sourceImages.length} generated=${generatedCount} skipped=${skippedCount}`);
  }

  if (mode !== 'generate-only') {
    console.log(`[responsive] checked=${checkedCount} missingGroups=${missingBySource.length}`);

    if (missingBySource.length) {
      console.error('[responsive] Missing responsive variants detected:');
      for (const group of missingBySource.slice(0, 30)) {
        console.error(`- ${relative(group.sourcePath)}`);
        for (const missingFile of group.missing.slice(0, 6)) {
          console.error(`  - ${relative(missingFile)}`);
        }
        if (group.missing.length > 6) {
          console.error(`  - ... +${group.missing.length - 6} more`);
        }
      }
      if (missingBySource.length > 30) {
        console.error(`... +${missingBySource.length - 30} more source files with missing variants`);
      }
      process.exitCode = 1;
    }
  }
}

run().catch((error) => {
  console.error('[responsive] Failed:', error);
  process.exitCode = 1;
});
