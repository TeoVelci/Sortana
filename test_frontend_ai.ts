import { generateTagsForBatch } from './aiService';
import fs from 'fs';

// Mock File API for Node since we're importing a frontend file
class MockFile extends Blob {
  name: string;
  constructor(bits: any[], name: string, options?: any) {
    super(bits, options);
    this.name = name;
  }
}
globalThis.File = MockFile as any;

const run = async () => {
    try {
        const fileData = fs.readFileSync('test_image_1778213003892.png');
        const file = new MockFile([fileData], 'test.png', { type: 'image/png' });
        
        console.log("Calling generateTagsForBatch...");
        const result = await generateTagsForBatch([{ id: '1', file: file as any }]);
        console.log("Result:", result);
    } catch (e) {
        console.error("Fatal Error:", e);
    }
}
run();
