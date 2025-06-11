const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://miojaflixmncmhsgyabd.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pb2phZmxpeG1uY21oc2d5YWJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM2NTU0NTUsImV4cCI6MjA1OTIzMTQ1NX0.e3nU5sBvHsFHZP48jg1vjYsP-N2S4AgYuQgt8opHE_g';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

module.exports = { supabase, supabaseAdmin };
