// One-shot, non-interactive TWA project generator for Home Anchor.
// Run from android-twa/: node generate-twa.cjs
const path = require('path');
const fs = require('fs');
const os = require('os');

const CORE_PKG = path.join(
  os.homedir(), 'AppData', 'Local', 'npm-cache', '_npx',
  '881cef4662d2c421', 'node_modules', '@bubblewrap', 'core'
);
const { TwaManifest, TwaGenerator, ConsoleLog, JdkHelper, KeyTool } = require(CORE_PKG);

const TARGET_DIR = __dirname;
const MANIFEST_URL = 'https://app.home-anchor.org/manifest.json';

async function main() {
  const config = JSON.parse(
    fs.readFileSync(path.join(os.homedir(), '.bubblewrap', 'config.json'), 'utf8')
  );

  console.log('Fetching web manifest and building TWA manifest...');
  const twaManifest = await TwaManifest.fromWebManifest(MANIFEST_URL);

  twaManifest.packageId = 'org.homeanchor.app';
  twaManifest.name = 'Home Anchor';
  twaManifest.launcherName = 'Home Anchor';
  twaManifest.appVersionCode = 1;
  twaManifest.appVersionName = '1.0.0';
  twaManifest.signingKey.path = path.join(TARGET_DIR, 'android.keystore');
  twaManifest.signingKey.alias = 'home-anchor';

  const err = twaManifest.validate();
  if (err) {
    console.error('Manifest validation failed:', err);
    process.exit(1);
  }

  await twaManifest.saveToFile(path.join(TARGET_DIR, 'twa-manifest.json'));
  console.log('Saved twa-manifest.json');

  console.log('Generating Android project...');
  const log = new ConsoleLog('Generating TWA');
  const generator = new TwaGenerator();
  await generator.createTwaProject(TARGET_DIR, twaManifest, log, () => {});
  console.log('Android project generated.');

  const keystorePassword = process.env.KEYSTORE_PASSWORD;
  const keyPassword = process.env.KEY_PASSWORD;
  if (!keystorePassword || !keyPassword) {
    throw new Error('KEYSTORE_PASSWORD and KEY_PASSWORD env vars are required');
  }

  console.log('Generating signing key...');
  const jdkHelper = new JdkHelper(process, config);
  const keytool = new KeyTool(jdkHelper, log);
  await keytool.createSigningKey({
    path: twaManifest.signingKey.path,
    alias: twaManifest.signingKey.alias,
    fullName: 'Home Anchor',
    organizationalUnit: 'Home Anchor',
    organization: 'Home Anchor',
    country: 'US',
    password: keystorePassword,
    keypassword: keyPassword,
  });
  console.log('Signing key generated at', twaManifest.signingKey.path);

  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
