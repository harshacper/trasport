import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://sevwgvzexehstbpxsnuu.supabase.co';
const supabaseKey = 'sb_publishable_VcCG5VJ7CrBYLTPhdtAlmw_EPE4yd1U';

export const supabase = createClient(supabaseUrl, supabaseKey);
