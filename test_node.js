import fs from 'fs';
import { generateTagsForBatch } from './aiService.js';

globalThis.Worker = class {
    constructor() {}
    postMessage() {}
};

// Polyfill atob and btoa
globalThis.atob = (str) => Buffer.from(str, 'base64').toString('binary');
globalThis.btoa = (str) => Buffer.from(str, 'binary').toString('base64');

class MockFile extends Blob {
  constructor(bits, name, options) {
    super(bits, options);
    this.name = name;
  }
}
globalThis.File = MockFile;

const run = async () => {
    try {
        const fileData = fs.readFileSync('test_image_1778213003892.png');
        const file = new MockFile([fileData], 'test.png', { type: 'image/png' });
        
        console.log("Calling generateTagsForBatch...");
        const result = await generateTagsForBatch([{ id: '1', file: file }]);
        console.log("Result:", result);
    } catch (e) {
        console.error("Fatal Error:", e);
    }
}
run();
