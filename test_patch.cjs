require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error, status } = await supabase.from('items').update({ sync_status: 'synced' }).eq('id', 'does-not-exist');
  console.log('Status:', status);
  console.log('Error:', error);
}
run();
