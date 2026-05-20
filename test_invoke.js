import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://fkayfefyndhdxfnnquia.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '...'; // I will get it from .env

async function run() {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  
  // Login with a test user to get a valid session
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'user@sortana.ai', // Or whatever test user
    password: 'password123'
  });
  
  if (authError) {
    console.error("Auth error:", authError.message);
    // If login fails, we can't test properly without a user
    return;
  }
  console.log("Logged in:", authData.user.id);

  // Invoke the edge function
  const { data, error } = await supabase.functions.invoke('export-zip', {
    body: {
      files: [{ name: 'test.jpg' }],
      options: {},
      zipName: 'test.zip'
    }
  });

  console.log("Error:", error);
  console.log("Data:", data);
}

run();
