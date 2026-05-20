import sys

with open('ExportModal.tsx', 'r') as f:
    content = f.read()

bad_code = "const blob = await response.blob();"

safe_code = """          // Consume the stream manually to bypass WebKit response.blob() deadlock bug
          const reader = response.body!.getReader();
          const blobChunks: Uint8Array[] = [];
          while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) blobChunks.push(value);
          }
          const blob = new Blob(blobChunks, { type: 'application/zip' });"""

content = content.replace(bad_code, safe_code)

with open('ExportModal.tsx', 'w') as f:
    f.write(content)

print("Fixed WebKit response.blob() deadlock bug in ExportModal.tsx")

