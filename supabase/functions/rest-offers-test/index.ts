import {createClient} from 'npm:@supabase/supabase-js@2.49.10';
import {createOfferHandler} from './handler.js';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
// Dedicated test endpoint: own authentication, role checks and fixed test scope.
Deno.serve(createOfferHandler({db,enabled:true}));
