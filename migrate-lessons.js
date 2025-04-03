const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// --- Configuration ---
// IMPORTANT: For production or shared environments, use environment variables
// instead of hardcoding credentials.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://miojaflixmncmhsgyabd.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pb2phZmxpeG1uY21oc2d5YWJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM2NTU0NTUsImV4cCI6MjA1OTIzMTQ1NX0.e3nU5sBvHsFHZP48jg1vjYsP-N2S4AgYuQgt8opHE_g'; // Use the service_role key if anon key lacks insert permissions

const lessonsFilePath = path.join(__dirname, 'data', 'lessons.json');
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- Migration Function ---
async function migrateLessons() {
    console.log('Starting lesson migration...');

    // 1. Read JSON data
    let lessonsData;
    try {
        const jsonData = fs.readFileSync(lessonsFilePath, 'utf-8');
        lessonsData = JSON.parse(jsonData);
        console.log(`Read ${lessonsData.length} lessons from ${lessonsFilePath}`);
    } catch (error) {
        console.error(`Error reading or parsing ${lessonsFilePath}:`, error);
        return; // Stop migration if file reading fails
    }

    if (!Array.isArray(lessonsData)) {
        console.error('Error: lessons.json does not contain a valid JSON array.');
        return;
    }

    // 2. Iterate and Upsert to Supabase
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < lessonsData.length; i++) {
        const lesson = lessonsData[i];
        console.log(`\nProcessing lesson ${i + 1}/${lessonsData.length}: ID ${lesson.id}, Title: ${lesson.title}`);

        // Basic validation/transformation (add more as needed)
        const lessonPayload = {
            ...lesson,
            order: lesson.order !== undefined ? lesson.order : i, // Assign order based on index if not present
            created: lesson.created || new Date().toISOString(), // Ensure created exists
            lastUpdated: lesson.lastUpdated || new Date().toISOString(), // Ensure lastUpdated exists
            views: lesson.views || 0 // Ensure views exists
            // Ensure other fields match your Supabase table schema
            // e.g., questions should be valid JSONB, tags an array/JSONB etc.
        };
         
        // Make sure 'id' is a string if your Supabase column expects text
        lessonPayload.id = String(lessonPayload.id);

        try {
            // Using upsert: inserts if ID doesn't exist, updates if it does.
            // Assumes 'id' is the primary key or has a unique constraint in Supabase.
            const { data, error } = await supabase
                .from('lessons')
                .upsert(lessonPayload, { onConflict: 'id' }) // Specify the conflict column
                .select(); // Optional: select the upserted data

            if (error) {
                console.error(`Error upserting lesson ID ${lesson.id}:`, error.message);
                // Optionally log more details: console.error('Details:', error);
                errorCount++;
            } else {
                console.log(`Successfully upserted lesson ID ${lesson.id}`);
                successCount++;
                // Optional: log the returned data: console.log('Upserted data:', data);
            }
        } catch (err) {
            console.error(`Unexpected error during upsert for lesson ID ${lesson.id}:`, err);
            errorCount++;
        }
         
        // Optional: Add a small delay between requests if hitting rate limits
        // await new Promise(resolve => setTimeout(resolve, 50)); 
    }

    // 3. Log Summary
    console.log('\n--- Migration Summary ---');
    console.log(`Total lessons processed: ${lessonsData.length}`);
    console.log(`Successfully upserted: ${successCount}`);
    console.log(`Failed: ${errorCount}`);
    console.log('------------------------');
}

// --- Run Migration ---
migrateLessons().catch(err => {
    console.error('Unhandled error during migration:', err);
}); 