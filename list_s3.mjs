import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
    const { data: bucket, error: bucketError } = await supabase.storage.getBucket('sortana-video-storage');
    console.log("Bucket public:", bucket?.public);
    
    const { data: files, error } = await supabase.storage.from('sortana-video-storage').list('exports', { limit: 10, sortBy: { column: 'created_at', order: 'desc' } });
    console.log("Exports folder files:", files);
}
run();
