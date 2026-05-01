import fs from 'fs';
import path from 'path';

const outputFileName = 'restore_sortana.js';
const excludeDirs = ['node_modules', '.git', 'dist', '.next', '.gemini'];
const excludeFiles = [outputFileName, 'bundle_project.ts', 'bundle_tar.ts', 'package-lock.json', 'Sortana_Project_Backup.zip', 'Sortana_Backup.tar.gz'];

function getFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const relPath = path.relative(process.cwd(), filePath);
    
    if (fs.statSync(filePath).isDirectory()) {
      if (!excludeDirs.includes(file)) {
        getFiles(filePath, fileList);
      }
    } else {
      if (!excludeFiles.includes(file)) {
        fileList.push({
          path: relPath,
          content: fs.readFileSync(filePath, 'utf8')
        });
      }
    }
  });
  return fileList;
}

async function createRestoreScript() {
  console.log('Bundling project into a single Python restore script...');
  const allFiles = getFiles(process.cwd());
  
  // Base64 encode contents to be safe
  const simplifiedFiles = allFiles.map(f => ({
    path: f.path,
    content: Buffer.from(f.content).toString('base64')
  }));

  const scriptContent = `
import os
import base64

project_files = ${JSON.stringify(simplifiedFiles, null, 2)}

print('--- SORTANA PROJECT RESTORE (PYTHON) START ---')

for file_info in project_files:
    file_path = file_info['path']
    content_encoded = file_info['content']
    
    # Create directories if they don't exist
    directory = os.path.dirname(file_path)
    if directory and not os.path.exists(directory):
        os.makedirs(directory)
        
    # Decode and write the file
    content = base64.b64decode(content_encoded)
    with open(file_path, 'wb') as f:
        f.write(content)
        
    print(f'Created: ' + file_path)

print('--- RESTORE COMPLETE ---')
`;

  fs.writeFileSync('restore_sortana.py', scriptContent);
  console.log('Success! Created restore_sortana.py');
}

createRestoreScript();
