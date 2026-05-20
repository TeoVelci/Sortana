const { Zip, ZipDeflate } = require("/tmp/testzip/node_modules/fflate");
const fs = require("fs");

const zip = new Zip();
const chunks = [];
zip.ondata = (err, data, final) => {
  if (data) chunks.push(data);
  if (final) {
    fs.writeFileSync("test_attrs.zip", Buffer.concat(chunks));
  }
};
const f = new ZipDeflate("2024/", { attrs: 0x10, os: 0 }); // DOS Directory
zip.add(f);
f.push(new Uint8Array(0), true);
zip.end();
