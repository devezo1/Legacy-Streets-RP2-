const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');
if (!fs.existsSync(envPath)) {
    console.log('.env file does not exist at:', envPath);
} else {
    const buffer = fs.readFileSync(envPath);
    console.log('File size:', buffer.length, 'bytes');
    console.log('First 4 bytes:', buffer.slice(0, 4));
    console.log('Is UTF-16 LE BOM:', buffer[0] === 0xFF && buffer[1] === 0xFE);
    console.log('Is UTF-16 BE BOM:', buffer[0] === 0xFE && buffer[1] === 0xFF);
    console.log('Is UTF-8 BOM:', buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF);

    const contentUtf8 = buffer.toString('utf8');
    console.log('Parsed content UTF-8 preview:\n', contentUtf8.substring(0, 100));
}

