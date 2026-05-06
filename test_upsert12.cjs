require('dotenv').config();

async function run() {
  const dbItem = {
    id: 'test-insert-rls-fail-3',
    user_id: '11111111-1111-1111-1111-111111111111', // WRONG USER ID
    name: 'test',
    sync_status: 'uploading'
  };
  
  // Call REST directly without auth, but with return=minimal, using POST for INSERT
  const res = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/items`, {
    method: 'POST',
    headers: {
      'apikey': process.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(dbItem)
  });
  console.log(res.status, await res.text());
}
run();
