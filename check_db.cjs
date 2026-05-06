const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf-8').split('\n');
let url = '', key = '';
for (const line of env) {
    if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1];
    if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) key = line.split('=')[1];
}

const supabase = createClient(url, key);

async function run() {
    const { data } = await supabase.from('FileSystemItem').select('id, name, s3Key, proxyS3Key').order('createdAt', { ascending: false }).limit(5);
    console.log(JSON.stringify(data, null, 2));
}
run().catch(console.error);
