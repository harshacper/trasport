const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://sevwgvzexehstbpxsnuu.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'sb_publishable_VcCG5VJ7CrBYLTPhdtAlmw_EPE4yd1U';

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
