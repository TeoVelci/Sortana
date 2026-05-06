require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const dbItem = {
    id: 'test-insert-126',
    // INTENTIONALLY OMIT USER ID
    // user_id: '64914e0b-ef8e-4bb4-afc6-da953c30c1cd',
    name: 'C0260.MP4',
    type: 'file',
    file_type: 'video',
    size: 1000000,
    parent_id: null,
    s3_key: undefined,
    preview_url: 'blob:http://localhost:5173/1234',
    tags: [''],
    description: undefined,
    rating: 0,
    flag: null,
    width: undefined,
    height: undefined,
    make: 'Sony',
    model: 'Sony A7 IV',
    date_taken: null,
    sync_status: 'uploading',
    video_metadata: undefined,
    proxy_s3_key: undefined,
    group_id: undefined,
    is_stack_top: undefined,
    is_analyzing: true
  };
  
  // Clean undefined explicitly just like supabase js might
  Object.keys(dbItem).forEach(key => dbItem[key] === undefined && delete dbItem[key]);

  const { data, error } = await supabase.from('items').upsert(dbItem);
  console.log('Error:', JSON.stringify(error, null, 2));
}
run();
