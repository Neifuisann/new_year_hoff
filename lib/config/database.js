const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');

// Supabase configuration
// Server-side data access must go directly to Supabase. The public URL may be a
// CDN/proxy, but sending service-role REST requests through a shared public cache
// can serve one authorization context's response to another caller.
const defaultSupabaseUrl = 'https://miojaflixmncmhsgyabd.supabase.co';
const supabaseUrl = process.env.SUPABASE_URL || defaultSupabaseUrl;
const supabasePublicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || supabaseUrl;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pb2phZmxpeG1uY21oc2d5YWJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM2NTU0NTUsImV4cCI6MjA1OTIzMTQ1NX0.e3nU5sBvHsFHZP48jg1vjYsP-N2S4AgYuQgt8opHE_g';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// Validate required environment variables
if (!supabaseServiceKey) {
  console.error('FATAL ERROR: SUPABASE_SERVICE_KEY is required for backend operations with RLS enabled.');
  console.error('Please set SUPABASE_SERVICE_KEY in your environment variables.');
  console.error('Without it, the application cannot write to the database due to Row Level Security policies.');
  process.exit(1);
}

// Database connection string validation
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('FATAL ERROR: DATABASE_URL environment variable is not set.');
  process.exit(1);
}

// Create Supabase clients
// For server-side operations, use service key by default to bypass RLS
const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);
// Public client is used only to construct/cache public asset URLs.
const supabaseAnon = createClient(supabasePublicUrl, supabaseAnonKey);

// Optimized PostgreSQL connection pool configuration
const pgPool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false // Adjust as per Supabase requirements or use proper CA certs
  },
  // Performance optimization settings
  max: 20,                      // Maximum pool size
  min: 2,                       // Minimum pool size
  idleTimeoutMillis: 30000,     // Close idle connections after 30 seconds
  connectionTimeoutMillis: 2000, // Timeout for getting connection from pool
  maxUses: 7500,                // Retire connections after 7500 uses
  allowExitOnIdle: true,        // Allow process to exit when all connections idle
  application_name: 'onluyen_vatly_app' // Application name for monitoring
});

// PostgreSQL pool error handling
pgPool.on('error', (err, client) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1); // Consider a more graceful shutdown strategy
});

module.exports = {
  supabase,
  supabaseAdmin,
  supabaseAnon,
  pgPool,
  supabaseUrl,
  supabasePublicUrl,
  supabaseAnonKey,
  supabaseServiceKey
};
