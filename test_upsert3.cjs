require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const dbItem = {
    id: 'test-insert-128',
    user_id: '64914e0b-ef8e-4bb4-afc6-da953c30c1cd',
    name: 'C0260.MP4',
    type: 'file',
    sync_status: 'uploading',
  };

  const { data, error } = await supabase.from('items').upsert(dbItem);
  console.log('Data:', data);
  console.log('Error:', JSON.stringify(error, null, 2));
}
run();
