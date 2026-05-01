import os
import json
import base64

output_file_name = 'restore_sortana.py'
exclude_dirs = ['node_modules', '.git', 'dist', '.next', '.gemini']
exclude_files = [output_file_name, 'restore_sortana.js', 'generate_restore.ts', 'bundle_project.ts', 'bundle_tar.ts', 'package-lock.json', 'Sortana_Project_Backup.zip', 'Sortana_Backup.tar.gz']

def get_files(directory):
    file_list = []
    for root, dirs, files in os.walk(directory):
        # Exclude directories
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        
        for file in files:
            if file in exclude_files:
                continue
            
            file_path = os.path.join(root, file)
            rel_path = os.path.relpath(file_path, directory)
            
            try:
                with open(file_path, 'rb') as f:
                    content = f.read()
                    # We encode as base64 to handle any binary-ish characters safely in the script
                    encoded_content = base64.b64encode(content).decode('utf-8')
                    file_list.append({
                        'path': rel_path,
                        'content': encoded_content
                    })
            except Exception as e:
                print(f"Could not read {file_path}: {e}")
                
    return file_list

def create_python_restore_script():
    print('Bundling project into a single Python restore script...')
    all_files = get_files(os.getcwd())
    
    script_template = f'''
import os
import base64

project_files = {json.dumps(all_files, indent=2)}

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
        
    print(f'Created: {{file_path}}')

print('--- RESTORE COMPLETE ---')
print('Note: You will still need to install Node.js to run the project, but all your code is now restored.')
'''

    with open(output_file_name, 'w') as f:
        f.write(script_template)
    print(f'Success! Created {{output_file_name}}')

if __name__ == "__main__":
    create_python_restore_script()
