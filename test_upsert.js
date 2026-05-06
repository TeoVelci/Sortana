import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function main() {
  const { data: { user } } = await supabase.auth.getUser();
  console.log("User:", user?.id);

  const dbItem = {
    id: "test-upsert-123",
    user_id: user?.id,
    name: "test.mp4",
    type: "file",
    sync_status: "uploading"
  };

  const { data, error } = await supabase.from('items').upsert(dbItem).select();
  console.log("Upsert result:", { data, error });
}
main();
