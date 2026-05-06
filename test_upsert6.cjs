require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const dbItem = {
    id: 'test-insert-rls-fail-1',
    user_id: '11111111-1111-1111-1111-111111111111', // WRONG USER ID
    name: 'test',
    sync_status: 'uploading'
  };
  
  // Call REST directly without auth
  const res = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/items?on_conflict=id`, {
    method: 'POST',
    headers: {
      'apikey': process.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify(dbItem)
  });
  console.log(res.status, await res.text());
}
run();
