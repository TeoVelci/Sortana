const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('items').select('id, name, parent_id, type, make, model').eq('type', 'file');
  if (error) console.error(error);
  else {
      // Find the videos from the screenshot
      const vids = data.filter(d => d.name === 'C0255.MP4' || d.name === 'C0260.MP4');
      console.log('Videos:', vids);
      
      const pIds = vids.map(v => v.parent_id);
      const { data: parents } = await supabase.from('items').select('id, name, parent_id').in('id', pIds);
      console.log('Parents:', parents);
      
      const ppIds = parents.map(p => p.parent_id);
      const { data: pparents } = await supabase.from('items').select('id, name').in('id', ppIds);
      console.log('Grandparents:', pparents);
  }
}
check();
