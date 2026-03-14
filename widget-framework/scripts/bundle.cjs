const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const distDir = path.join(__dirname, '../dist');
const widgetsDir = path.join(distDir, 'widgets');

if (!fs.existsSync(widgetsDir)) {
  fs.mkdirSync(widgetsDir, { recursive: true });
}

async function bundle() {
  try {
    await esbuild.build({
      entryPoints: [path.join(__dirname, '../src/index.ts')],
      bundle: true,
      outfile: path.join(distDir, 'index.js'),
      format: 'esm',
      platform: 'browser',
      target: 'es2020',
      sourcemap: true,
      minify: false,
    });
    console.log('[Bundle] Framework bundle created: dist/index.js');

    await esbuild.build({
      entryPoints: [path.join(__dirname, '../src/widgets/ai-copilot/index.ts')],
      bundle: true,
      outfile: path.join(widgetsDir, 'ai-copilot.js'),
      format: 'esm',
      platform: 'browser',
      target: 'es2020',
      sourcemap: true,
      minify: false,
      external: [],
    });
    console.log('[Bundle] AI Copilot widget bundle created: dist/widgets/ai-copilot.js');

    await esbuild.build({
      entryPoints: [path.join(__dirname, '../src/widgets/ai-settings/index.ts')],
      bundle: true,
      outfile: path.join(widgetsDir, 'ai-settings.js'),
      format: 'esm',
      platform: 'browser',
      target: 'es2020',
      sourcemap: true,
      minify: false,
      external: [],
    });
    console.log('[Bundle] AI Settings widget bundle created: dist/widgets/ai-settings.js');

    await esbuild.build({
      entryPoints: [path.join(__dirname, '../src/widgets/graph-view/index.ts')],
      bundle: true,
      outfile: path.join(widgetsDir, 'graph-view.js'),
      format: 'esm',
      platform: 'browser',
      target: 'es2020',
      sourcemap: true,
      minify: false,
      external: [],
    });
    console.log('[Bundle] Graph View widget bundle created: dist/widgets/graph-view.js');

    console.log('[Bundle] All bundles created successfully!');
  } catch (error) {
    console.error('[Bundle] Build failed:', error);
    process.exit(1);
  }
}

bundle();
