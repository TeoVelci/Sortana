const archiver = require("archiver");
const fs = require("fs");

const archive = archiver("zip", { zlib: { level: 1 } });
const output = fs.createWriteStream("test_archiver.zip");
archive.pipe(output);

archive.append("Hello World", { name: "test.txt" });
archive.append(Buffer.from(""), { name: "folder/" });

archive.finalize();

output.on("close", () => {
  console.log("Done");
  const { execSync } = require("child_process");
  console.log(execSync("zipinfo -v test_archiver.zip | grep 'extended local header' || true").toString());
});
