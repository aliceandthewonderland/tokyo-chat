const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');
const pngToIco = require('png-to-ico');

async function convertToIco() {
  try {
    // Input and output paths
    const inputPath = path.join(__dirname, 'assets', 'tokyo_chat.jpg');
    const pngPath = path.join(__dirname, 'assets', 'tokyo_chat.png');
    const icoPath = path.join(__dirname, 'assets', 'icon.ico');

    console.log('Reading image...');
    // Read the image
    const image = await Jimp.read(inputPath);
    
    // Resize to 256x256 (standard icon size)
    image.resize(256, 256);
    
    console.log('Saving as PNG...');
    // Save as PNG
    await image.writeAsync(pngPath);
    
    console.log('Converting to ICO...');
    // Convert PNG to ICO
    const pngBuffer = fs.readFileSync(pngPath);
    const icoBuffer = await pngToIco([pngBuffer]);
    
    // Write ICO file
    fs.writeFileSync(icoPath, icoBuffer);
    
    console.log('Icon created successfully at:', icoPath);
  } catch (error) {
    console.error('Error:', error);
  }
}

convertToIco(); 