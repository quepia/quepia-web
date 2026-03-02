require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);
async function run() {
  const { data: user } = await supabase.from('sistema_users').select('id, role').limit(1).single();
  console.log('User:', user);
  
  // Test the RLS logic manually via RPC if we have one, or just inserting with anon key simulating this user
  // To simulate user RLS, we can create a signed JWT for this user.
  const jwt = require('jsonwebtoken'); // Need to check if installed
}
run();
