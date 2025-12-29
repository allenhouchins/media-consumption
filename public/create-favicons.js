// Script to create favicon files
// Run this in Node.js: node public/create-favicons.js

import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicDir = __dirname;

// Function to download emoji as PNG
function downloadEmoji(emoji, size, filename) {
  return new Promise((resolve, reject) => {
    const url = `https://emojicdn.elk.sh/${encodeURIComponent(emoji)}?style=apple&size=${size}`;
    const file = fs.createWriteStream(path.join(publicDir, filename));
    
    https.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log(`✓ Created ${filename}`);
          resolve();
        });
      } else {
        file.close();
        fs.unlinkSync(path.join(publicDir, filename));
        reject(new Error(`Failed to download: ${response.statusCode}`));
      }
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(path.join(publicDir, filename))) {
        fs.unlinkSync(path.join(publicDir, filename));
      }
      reject(err);
    });
  });
}

async function createFavicons() {
  console.log('Creating favicon files...\n');
  
  try {
    // Create 96x96 PNG favicon
    await downloadEmoji('💣', 96, 'favicon-96x96.png');
    
    // Create 180x180 Apple touch icon
    await downloadEmoji('💣', 180, 'apple-touch-icon.png');
    
    // Create 192x192 for manifest
    await downloadEmoji('💣', 192, 'icon-192x192.png');
    
    // Create 512x512 for manifest
    await downloadEmoji('💣', 512, 'icon-512x512.png');
    
    // For ICO, we'll create a simple 32x32 version and note it needs conversion
    await downloadEmoji('💣', 32, 'favicon-32x32.png');
    
    console.log('\n✓ All PNG files created!');
    console.log('\nNote: favicon.ico needs to be created from favicon-32x32.png');
    console.log('You can use an online tool like https://convertio.co/png-ico/');
    console.log('or run: convert favicon-32x32.png favicon.ico (if ImageMagick is installed)');
  } catch (error) {
    console.error('Error creating favicons:', error.message);
    console.log('\nAlternative: Use https://realfavicongenerator.net/ to generate all favicon formats');
  }
}

createFavicons();

