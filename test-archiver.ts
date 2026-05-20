import archiver from "npm:archiver";

async function test() {
  const archive = archiver('zip', {
    zlib: { level: 0 } // Store only
  });

  const chunks: Uint8Array[] = [];
  archive.on('data', chunk => chunks.push(chunk));
  archive.on('end', () => {
    const totalLength = chunks.reduce((acc, val) => acc + val.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    Deno.writeFileSync("test_archiver.zip", result);
    console.log("Done");
  });

  archive.append("Hello World!", { name: "test.txt" });
  archive.finalize();
}
test();
