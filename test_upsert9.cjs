require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); // use service role to sign JWT

async function run() {
  const { data: { user } } = await supabase.auth.admin.getUserById('64914e0b-ef8e-4bb4-afc6-da953c30c1cd');
  // I cannot easily generate a JWT. But wait! I CAN JUST USE SUPABASE JS CLIENT LOGGED IN AS THE USER!
  const client = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const { data: sessionData, error: authErr } = await client.auth.signInWithPassword({
    email: 'test@example.com',
    password: 'password123' // I don't know the password
  });
}
run();
