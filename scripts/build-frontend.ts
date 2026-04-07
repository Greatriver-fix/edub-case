import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dir, '..');
const buildDir = path.join(rootDir, 'build');
const publicDir = path.join(rootDir, 'public');
const version = Date.now().toString();

const rewriteIndexHtml = async () => {
  const indexHtmlPath = path.join(buildDir, 'index.html');
  const indexHtml = await readFile(indexHtmlPath, 'utf8');
  const updatedHtml = indexHtml
    .replace('</head>', `  <link rel="stylesheet" href="/index.css?v=${version}">\n</head>`)
    .replace('src="/src/index.tsx"', `src="/index.js?v=${version}"`);

  await writeFile(indexHtmlPath, updatedHtml);
};

const main = async () => {
  await rm(buildDir, { recursive: true, force: true });

  const result = await Bun.build({
    entrypoints: [path.join(rootDir, 'src', 'index.tsx')],
    minify: true,
    outdir: buildDir,
    sourcemap: 'none',
    target: 'browser',
  });

  if (!result.success) {
    for (const log of result.logs) {
      console.error(log.message);
    }
    process.exit(1);
  }

  await cp(publicDir, buildDir, { force: true, recursive: true });
  await rewriteIndexHtml();
};

main().catch((error) => {
  console.error('Frontend build failed:', error);
  process.exit(1);
});
