const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="29" fill="#2b604b"/><g transform="rotate(15 64 64)" fill="#e5efbf"><rect x="43" y="30" width="15" height="68" rx="7.5"/><rect x="72" y="48" width="15" height="50" rx="7.5"/></g></svg>';
async function main() {
  fs.mkdirSync(path.join(__dirname, '../extension/icons'), { recursive: true });
  for (const size of [16, 32, 48, 128]) await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(__dirname, `../extension/icons/${size}.png`));
  console.log('Generated four extension icons.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
