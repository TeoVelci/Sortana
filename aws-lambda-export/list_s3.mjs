import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '../supabase/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data, error } = await supabase.storage.from('sortana-video-storage').list('exports');
    if (error) {
        console.error("Error:", error);
        return;
    }
    console.log(data);
}
run();
