require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

async function run() {
  // Use admin ID we saw: 2aad27aa-b3be-4335-a5c7-06770a580cd3
  const uid = '2aad27aa-b3be-4335-a5c7-06770a580cd3';
  
  const payload = {
    title: 'Test FK Error',
    currency: 'ARS',
    status: 'draft',
    created_by: uid
  };
  
  const { data, error } = await supabase.from('sistema_proposals').insert(payload).select('id');
  console.log('Test INSERT completed.\nDATA:', data, '\nERROR:', error);
}

run();
