import fs from 'fs';
import { Zip, ZipPassThrough } from 'fflate';

const out = fs.createWriteStream('test_store5.zip');
const zip = new Zip();
zip.ondata = (err, data, final) => {
  out.write(data);
  if (final) out.end();
};

const f = new ZipPassThrough('test.txt');
f.os = 3;
f.size = 5;
f.attrs = (0o100644 << 16) | 0x20;
f.mtime = new Date();
zip.add(f);
f.push(Buffer.from('hello'), true);

zip.end();
