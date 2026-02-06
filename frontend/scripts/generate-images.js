const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '../public');

async function generate() {
  // Icon (512x512)
  await sharp(path.join(publicDir, 'icon.svg'))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'icon.png'));
  console.log('✓ icon.png');

  // Hero/Splash (1200x630)
  await sharp(path.join(publicDir, 'hero.svg'))
    .resize(1200, 630)
    .png()
    .toFile(path.join(publicDir, 'hero.png'));
  console.log('✓ hero.png');

  // Copy hero as splash
  fs.copyFileSync(
    path.join(publicDir, 'hero.png'),
    path.join(publicDir, 'splash.png')
  );
  console.log('✓ splash.png');

  // OG Image (1200x630)
  await sharp(path.join(publicDir, 'og.svg'))
    .resize(1200, 630)
    .png()
    .toFile(path.join(publicDir, 'og.png'));
  console.log('✓ og.png');

  // Screenshot placeholder (390x844) - create a simple dark image
  await sharp({
    create: {
      width: 390,
      height: 844,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 }
    }
  })
    .png()
    .toFile(path.join(publicDir, 'screenshot.png'));
  console.log('✓ screenshot.png (placeholder)');

  console.log('\nDone! Images generated in /public');
}

generate().catch(console.error);
