import fs from 'fs';
const base64Data = fs.readFileSync('test.jpg', 'base64');
console.log(base64Data.substring(0, 50));
