const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const session = require('express-session');
const bcrypt = require('bcrypt');
const fetch = require('node-fetch');
const multer = require('multer');
// Supabase client moved to utils
const { supabase, supabaseAdmin } = require('../utils/supabaseClient');
const { inject } = require('@vercel/analytics');
const sharp = require('sharp');
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // Limit file size to 10MB
});
const { Pool } = require('pg');
const pgSession = require('connect-pg-simple')(session);
const app = express();
const PORT = process.env.PORT || 3000;
const path = require('path');
const cookieParser = require('cookie-parser');
const authRoutes = require('../routes/authRoutes');
const { generateETag, setCacheHeaders, shouldCache } = require('../utils/cache');
const { incrementViewCount } = require('../utils/lessonUtils');

// --- Global Error Handling ---
process.on('uncaughtException', (error) => {
  console.error('FATAL: Uncaught Exception:', error);
  // Implement more graceful shutdown if possible (e.g., close DB connections)
  process.exit(1); 
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('FATAL: Unhandled Rejection at:', promise, 'reason:', reason);
  // Log appropriately, maybe trigger alerts
  // Consider if shutdown is necessary depending on the rejection
});
// --- End Global Error Handling ---

// Initialize Vercel Analytics
inject();

// Supabase initialization handled in utils/supabaseClient.js

const IMAGE_BUCKET = 'lesson-images';
const MAX_IMAGE_DIMENSION = 480;

// Set proper charset for all responses
app.use((req, res, next) => {
    res.charset = 'utf-8';
    next();
});

// Middleware to inject Speed Insights script
app.use((req, res, next) => {
    const originalSend = res.send;
    
    res.send = function(body) {
        // Only inject script into HTML responses
        if (typeof body === 'string' && body.includes('</head>')) {
            // Inject the Speed Insights script before the closing head tag
            const speedInsightsScript = '<script defer src="/_vercel/speed-insights/script.js"></script>';
            body = body.replace('</head>', `${speedInsightsScript}</head>`);
        }
        return originalSend.call(this, body);
    };
    
    next();
});

app.use(cookieParser());
app.use(bodyParser.json({ limit: '10mb', extended: true }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true, parameterLimit: 50000 }));
app.use(express.static(path.join(process.cwd(), 'public'), { 
    maxAge: '1d',
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
        if (path.extname(filePath) === '.html') {
            res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        }
    } 
}));

// Configure express-session
app.set('trust proxy', 1); // Trust first proxy, crucial for Vercel/Heroku/etc.

// --- NEW: Setup PostgreSQL Pool for Sessions ---
// Ensure you have DATABASE_URL environment variable set!
// Example: postgres://postgres:your_password@db.abcdefghi.supabase.co:5432/postgres
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('FATAL ERROR: DATABASE_URL environment variable is not set.');
  process.exit(1); // Exit if the database connection string is missing
}

const pgPool = new Pool({
  connectionString: connectionString,
  // Optional: Add SSL configuration if needed, Supabase typically requires it
  ssl: {
    rejectUnauthorized: false // Adjust as per Supabase requirements or use proper CA certs
  }
});

pgPool.on('error', (err, client) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1); // Consider a more graceful shutdown strategy
});

// --- NEW: Create PostgreSQL Session Store ---
const sessionStore = new pgSession({
  pool: pgPool,                // Connection pool
  tableName: 'session',        // Use the table created earlier
  createTableIfMissing: false  // We created it manually
});

app.use(session({
    store: sessionStore, // Use the PostgreSQL store
    secret: process.env.SESSION_SECRET || 'fallback-secret-replace-me!', // !! USE AN ENV VAR FOR SECRET !!
    resave: false, // Recommended: Don't save session if unmodified
    saveUninitialized: false, // Recommended: Don't create session until something stored
    name: 'connect.sid', // Explicitly set the default session cookie name
    cookie: { 
        secure: process.env.NODE_ENV === 'production', // Ensure cookies are sent only over HTTPS in production
        httpOnly: true, // Prevent client-side JS from accessing the cookie
        sameSite: 'lax', // Recommended for most cases to prevent CSRF
        path: '/', // Ensure cookie is valid for all paths
        maxAge: 24 * 60 * 60 * 1000 // 1 day
        // Consider setting domain explicitly if needed
        // domain: process.env.NODE_ENV === 'production' ? '.yourdomain.com' : undefined
    },
    proxy: true // Trust the reverse proxy when setting secure cookies (Vercel/Heroku)
}));



// Middleware to protect admin routes
const requireAuth = (req, res, next) => {
    
    if (req.session.isAuthenticated) {
        console.log('Admin authenticated, proceeding to route');
        next();
    } else {
        console.log('Admin authentication failed, redirecting to login');
        // Check if the request likely originated from a fetch() call
        const isApiRequest = req.headers.accept && req.headers.accept.includes('application/json') 
                           || req.headers['x-requested-with'] === 'XMLHttpRequest';
                           
        if (isApiRequest) {
            // For API requests, return JSON response
            console.log('Auth failed for API request, sending 401 JSON');
            return res.status(401).json({ error: 'Authentication required' });
        }
        // For browser requests, redirect to login
        console.log('Auth failed for browser request, redirecting to /admin/login');
        res.redirect('/admin/login');
    }
};

// Middleware to protect student routes
const requireStudentAuth = (req, res, next) => {

    if (req.session.studentId) { // Check ONLY for studentId
        console.log('Student authenticated, proceeding.');
        next();
    } else {
        console.log('Student authentication failed.');
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            return res.status(401).json({ error: 'Student authentication required' });
        } else {
            // Redirect to student login, preserving intended URL
            return res.redirect('/student/login?redirect=' + encodeURIComponent(req.originalUrl));
        }
    }
};

// Add this middleware
function requireStudentInfo(req, res, next) {
    const path = req.path;
    if (path.startsWith('/lesson/') && !path.includes('/admin/')) {
        if (!req.session.studentInfo) {
            return res.redirect('/?error=no_student_info');
        }
    }
    next();
}

// Apply student authentication middleware to relevant routes
app.use('/lythuyet', requireStudentAuth);
app.use('/multiplechoice', requireStudentAuth);
app.use('/quizgame', requireStudentAuth);
app.use('/truefalse', requireStudentAuth);
app.use('/lesson/:id', requireStudentAuth);
app.use('/result', requireStudentAuth);
app.use('/result/:id', requireStudentAuth);
app.use('/api/results', requireStudentAuth);
app.use('/api/explain', requireStudentAuth);

// Apply the middleware to relevant routes
app.use('/lesson/', requireStudentInfo);
// Authentication and account-related API routes
app.use('/api', authRoutes);

// Routes
app.get('/', (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'landing.html')));
app.get('/student/login', (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'student-login.html')));
app.get('/student/register', (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'student-register.html')));
app.get('/lythuyet', (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'gallery.html')));
app.get('/multiplechoice', (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'index.html')));
app.get('/quizgame', (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'quizgame.html')));
app.get('/truefalse', (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'index.html')));
app.get('/lesson/:id', (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'lesson.html')));
app.get('/result', (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'result.html')));
app.get('/result/:id', (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'result.html')));
app.get('/admin', requireAuth, (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'admin-list.html')));
app.get('/admin/new', requireAuth, (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'admin-edit.html')));
app.get('/admin/edit/:id', requireAuth, (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'admin-edit.html')));
app.get('/admin/configure', requireAuth, (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'admin-configure.html')));
app.get('/admin/configure/:id', requireAuth, (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'admin-configure.html')));
app.get('/admin/login', (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'login.html')));
app.get('/admin/students', requireAuth, (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'admin-students.html')));
app.get('/admin/statistics/:id', requireAuth, (req, res) => {
    res.sendFile(path.join(process.cwd(), 'views', 'lesson-statistics.html'));
});
app.get('/history', requireAuth, (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'history.html')));
app.get('/admin/quiz', requireAuth, (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'admin-quiz-edit.html')));


// --- FIXED Leaderboard Route (No Auth Required) ---
app.get('/leaderboard', (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'leaderboard.html')));

// --- ADDED Profile Page Route --- 
// Decide if authentication is needed here
app.get('/profile/:studentId', (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'profile.html'))); 


app.get('/api/lessons', async (req, res) => {
    try {
        // --- Pagination, Sorting, Searching Parameters ---
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';
        const sort = req.query.sort || 'order';

        const startIndex = (page - 1) * limit;
        // endIndex is not directly used in the same way for RPC pagination

        // Determine sorting parameters (used in both RPC and non-RPC paths)
        let orderAscending = true;
        let orderColumn = 'order';
        switch (sort) {
            case 'newest': orderColumn = 'created'; orderAscending = false; break;
            case 'oldest': orderColumn = 'created'; orderAscending = true; break;
            case 'az': orderColumn = 'title'; orderAscending = true; break;
            case 'za': orderColumn = 'title'; orderAscending = false; break;
            case 'newest-changed': orderColumn = 'lastUpdated'; orderAscending = false; break;
            case 'popular': orderColumn = 'views'; orderAscending = false; break;
            case 'order': orderColumn = 'order'; orderAscending = true; break;
            // Add other sort cases if needed
        }

        let lessons = [];
        let total = 0;

        if (search) {
            // --- Use RPC for search ---
            // Call the PostgreSQL function 'search_lessons' we created
            let rpcQuery = supabase
                .rpc('search_lessons', { search_term: search })
                // Apply sorting to the results returned by the RPC function
                .order(orderColumn, { ascending: orderAscending })
                // Apply pagination to the results returned by the RPC function
                .range(startIndex, startIndex + limit - 1);

            const { data: rpcData, error: rpcError } = await rpcQuery;

            if (rpcError) throw rpcError; // Throw error if RPC call fails

            lessons = rpcData || [];

            // Limitation: Basic RPC doesn't easily return total count for pagination when searching.
            // We need a separate query or a modified RPC function to get the accurate total count.
            // For now, we'll estimate total based on whether we received a full page,
            // or ideally, make another call just for the count.
            const { count, error: countError } = await supabase
                .rpc('search_lessons', { search_term: search }, { count: 'exact', head: true }); // Perform a head request to get only the count

            if (countError) {
                console.warn('Could not get total count for search results:', countError);
                // Fallback or estimate count if needed, here setting total to length if count fails
                total = lessons.length + startIndex; // Simplistic estimate
            } else {
                total = count || 0;
            }

        } else {
            // --- Original non-search query ---
            let nonSearchQuery = supabase
                .from('lessons')
                .select('id, title, color, created, lastUpdated, views, order, subject, grade, tags, description, purpose, pricing, lessonImage, randomQuestions', { count: 'exact' })
                .order(orderColumn, { ascending: orderAscending })
                .range(startIndex, startIndex + limit - 1);

            const { data: nonSearchData, error: nonSearchError, count: nonSearchCount } = await nonSearchQuery;

            if (nonSearchError) throw nonSearchError; // Throw error if query fails

            lessons = nonSearchData || [];
            total = nonSearchCount || 0;
        }

        // --- Caching Logic Removed ---
        const responsePayload = {
            lessons: lessons,
            total: total,
            page: page,
            limit: limit,
            search: search,
            sort: sort
        };
        
        // Implement caching only for non-admin routes
        if (shouldCache(req)) {
            const etag = generateETag(responsePayload);
            const clientETag = req.headers['if-none-match'];
            if (clientETag && clientETag === `"${etag}"`) {
                console.log('Cache hit for /api/lessons');
                return res.status(304).send();
            }
            console.log('Cache miss for /api/lessons');
            setCacheHeaders(res, etag, 60 * 5); // Cache for 5 minutes
        }

        // Send response directly
        res.json(responsePayload);
        // --- End Caching Logic Removal ---

    } catch (error) {
        console.error('Error fetching lessons:', error);
        const errorDetails = error.details || error.message || 'Unknown error';
        const statusCode = error.status || 500;
        res.status(statusCode).json({ error: 'Failed to fetch lessons', details: errorDetails });
    }
});

app.get('/api/lessons/:id', async (req, res) => {
    const lessonId = req.params.id;
    try {
        const { data: lesson, error: fetchError } = await supabase
            .from('lessons')
            .select('*')
            .eq('id', lessonId)
            .single();

        if (fetchError || !lesson) {
            if (fetchError && fetchError.code === 'PGRST116') {
                return res.status(404).json({ error: 'Lesson not found' });
            }
            throw fetchError || new Error('Lesson not found');
        }

        // --- Caching Logic Removed ---
        // const etag = generateETag(lesson);
        // const clientETag = req.headers['if-none-match'];
        // if (clientETag && clientETag === `"${etag}"`) {
        //     console.log(`Cache hit for /api/lessons/${lessonId}`);
        //     // Send 304 without updating views if cache is valid
        //     return res.status(304).send();
        // }
        // console.log(`Cache miss for /api/lessons/${lessonId}`);
        // setCacheHeaders(res, etag, 60 * 10);
        // --- End Caching Logic Removal ---

        // Re-implement caching only for non-admin routes
        let wasServedFromCache = false;
        if (shouldCache(req)) {
            const etag = generateETag(lesson);
            const clientETag = req.headers['if-none-match'];
            if (clientETag && clientETag === `"${etag}"`) {
                console.log(`Cache hit for /api/lessons/${lessonId}`);
                // Send 304 without updating views if cache is valid
                wasServedFromCache = true;
                
                // Still increment view count even on cache hit
                incrementViewCount(lessonId, lesson.views || 0).catch(error => {
                    console.warn('Failed to update view count on cache hit for lesson', lessonId, error);
                });
                
                return res.status(304).send();
            }
            console.log(`Cache miss for /api/lessons/${lessonId}`);
            setCacheHeaders(res, etag, 60 * 10); // Cache for 10 minutes
        }

        // Only update view count if not served from cache
        if (!wasServedFromCache) {
        // Update view count (this logic remains)
        const currentViews = lesson.views || 0;
        const { error: updateError } = await supabase
            .from('lessons')
            .update({ views: currentViews + 1 })
            .eq('id', lessonId);

        if (updateError) {
            // Log warning but don't fail the request just because view count update failed
            console.warn('Failed to update view count for lesson', lessonId, updateError);
            }
        }

        // Send the full lesson data
        res.json(lesson);

    } catch (error) {
        console.error(`Error fetching lesson ${lessonId}:`, error);
        // Removed cache header cleanup as they are not set
        // res.removeHeader('ETag');
        // res.removeHeader('Cache-Control');
        // res.removeHeader('Last-Modified');
        res.status(500).json({ error: 'Failed to fetch lesson', details: error.message });
    }
});

app.post('/api/lessons', requireAuth, async (req, res) => {
    const now = new Date().toISOString();
    
    let nextOrder = 0;
    try {
        const { data: maxOrderLesson, error: maxOrderError } = await supabase
            .from('lessons')
            .select('order')
            .order('order', { ascending: false })
            .limit(1)
            .single();
            
        if (maxOrderError && maxOrderError.code !== 'PGRST116') {
             throw maxOrderError;
        }
        if (maxOrderLesson && typeof maxOrderLesson.order === 'number') {
             nextOrder = maxOrderLesson.order + 1;
        }
    } catch(error) {
         console.error('Error getting max order for new lesson:', error);
    }

    const newLessonData = {
        ...req.body,
        id: req.body.id || Date.now().toString(),
        views: 0,
        lastUpdated: now,
        created: now,
        order: nextOrder
    };

    try {
        const { data, error } = await supabase
            .from('lessons')
            .insert(newLessonData)
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, lesson: data });
    } catch (error) {
        console.error('Error creating lesson:', error);
        res.status(500).json({ error: 'Failed to create lesson', details: error.message });
    }
});

app.delete('/api/lessons/:id', requireAuth, async (req, res) => {
    const lessonId = req.params.id;
    try {
        const { error } = await supabase
            .from('lessons')
            .delete()
            .eq('id', lessonId);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error(`Error deleting lesson ${lessonId}:`, error);
        res.status(500).json({ error: 'Failed to delete lesson', details: error.message });
    }
});

app.put('/api/lessons/:id', requireAuth, async (req, res) => {
    const lessonId = req.params.id;
    const updatedData = {
        ...req.body,
        lastUpdated: new Date().toISOString()
    };
    // Ensure ID is not part of the update payload if it exists
    delete updatedData.id;
     // Ensure created timestamp isn't overwritten
    delete updatedData.created;
    // Do not automatically delete views or order - only update what's sent
    // delete updatedData.views; 
    // delete updatedData.order;

    // Construct the object with only the fields sent by the client + lastUpdated
    const updatePayload = {};
    for (const key in updatedData) {
        // Exclude potentially harmful or read-only fields if necessary, 
        // but for now, trust the client or add specific checks.
        if (key !== 'id' && key !== 'created') { // Example: always exclude id and created
             updatePayload[key] = updatedData[key];
        }
    }
    // Ensure lastUpdated is always included
    updatePayload.lastUpdated = updatedData.lastUpdated;

    try {
        const { data, error } = await supabase
            .from('lessons')
            .update(updatePayload) // Use the filtered payload
            .eq('id', lessonId)
            .select() // Optionally return the updated row

        if (error) {
             if (error.code === 'PGRST116') {
                return res.status(404).json({ error: 'Lesson not found' });
            }
            throw error;
        }
        res.json({ success: true, lesson: data });
    } catch (error) {
        console.error(`Error updating lesson ${lessonId}:`, error);
        res.status(500).json({ error: 'Failed to update lesson', details: error.message });
    }
});

app.post('/api/lessons/reorder', requireAuth, async (req, res) => {
    const orderedLessons = req.body;
    
    try {
        const updates = orderedLessons.map((lesson, index) => 
             supabase
                .from('lessons')
                .update({ order: index })
                .eq('id', lesson.id)
        );

        const results = await Promise.all(updates);

        const errors = results.filter(result => result.error);
        if (errors.length > 0) {
            console.error('Errors updating lesson order:', errors);
            throw new Error('One or more lessons failed to update order.');
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error reordering lessons:', error);
        res.status(500).json({ error: 'Failed to reorder lessons', details: error.message });
    }
});

app.post('/api/results', requireStudentAuth, async (req, res) => {
    const now = new Date().toISOString();
    const studentIdFromSession = req.session.studentId;
    if (!studentIdFromSession) {
        return res.status(401).json({ error: 'Unauthorized: No student session found.' });
    }

    // Extract all necessary data from the request body
    const {
        lessonId,
        questions,
        score,
        totalPoints,
        ipAddress,
        timeTaken, // Added
        streak    // Added
    } = req.body;

    const newResultData = {
        id: Date.now().toString(), // Consider using UUID or database sequence
        lessonId: lessonId,
        timestamp: now,
        questions: questions,
        score: score,
        totalPoints: totalPoints,
        student_id: studentIdFromSession,
        ipAddress: ipAddress
        // timeTaken and streak are not part of the 'results' table schema based on search results
    };

    try {
        // 1. Save the result first
        const { data: savedResult, error: saveError } = await supabase
            .from('results')
            .insert(newResultData)
            .select('id') // Select the ID of the newly inserted row
            .single();

        if (saveError) {
            console.error('Error saving result to database:', saveError);
            return res.status(500).json({ error: 'Failed to save result', details: saveError.message });
        }
        
        if (!savedResult || !savedResult.id) {
            console.error('Result saved but no ID returned.');
            return res.status(500).json({ error: 'Failed to save result (ID missing)'});
        }
        
        // --- ADDED: Update rating *after* saving result --- 
        try {
            // Call the existing updateStudentRating function 
            // Pass the necessary data: studentId, lessonId, score, totalPoints, timeTaken, streak
            await updateStudentRating(
                studentIdFromSession,
                lessonId,
                score,
                totalPoints,
                timeTaken,
                streak
            );
            console.log(`Rating updated for student ${studentIdFromSession} after saving result ${savedResult.id}`);
        } catch (ratingError) {
            // Log the rating error but don't fail the entire request
            // The result was saved successfully, which is the primary goal here.
            console.error(`Failed to update rating for student ${studentIdFromSession} after saving result ${savedResult.id}:`, ratingError);
            // Optionally, you could add a flag in the response indicating rating update failure
        }
        // --- END Rating Update ---

        // Send success response with the ID of the saved result
        res.json({ success: true, resultId: savedResult.id });

    } catch (error) { // Catch any unexpected error during the process
        console.error('Unexpected error in /api/results:', error);
        res.status(500).json({ error: 'Failed to process result submission', details: error.message });
    }
});

app.get('/api/results/:id', async (req, res) => {
    const resultId = req.params.id;
    try {
        const { data: result, error } = await supabase
            .from('results')
            .select('*')
            .eq('id', resultId)
            .single();

        if (error || !result) {
             if (error && error.code === 'PGRST116') {
                 return res.status(404).json({ error: 'Result not found' });
            }
            throw error || new Error('Result not found');
        }

        // --- Caching Logic Removed ---
        // const etag = generateETag(result);
        // const clientETag = req.headers['if-none-match'];
        // if (clientETag && clientETag === `"${etag}"`) {
        //     console.log(`Cache hit for /api/results/${resultId}`);
        //     return res.status(304).send();
        // }
        // console.log(`Cache miss for /api/results/${resultId}`);
        // setCacheHeaders(res, etag, 60 * 60 * 24);
        // --- End Caching Logic Removal ---

        res.json(result);
    } catch (error) {
        console.error(`Error fetching result ${resultId}:`, error);
        // Removed cache header cleanup
        // res.removeHeader('ETag');
        // res.removeHeader('Cache-Control');
        res.status(500).json({ error: 'Failed to fetch result', details: error.message });
    }
});

app.delete('/api/history/:resultId', requireAuth, async (req, res) => {
    const resultId = req.params.resultId;
    try {
        const { error } = await supabase
            .from('results')
            .delete()
            .eq('id', resultId);

        if (error) throw error;
        res.json({ success: true, message: 'History entry deleted.' });
    } catch (error) {
        console.error(`Error deleting history entry ${resultId}:`, error);
        res.status(500).json({ error: 'Failed to delete history entry', details: error.message });
    }
});

app.delete('/api/history/all', requireAuth, async (req, res) => {
    console.warn("Attempting to delete ALL history entries!");
    try {
        return res.status(501).json({ success: false, message: 'Bulk delete not safely implemented via this API route. Consider using Supabase dashboard or RPC.' });
    } catch (error) {
        console.error('Error deleting all history entries:', error);
        res.status(500).json({ error: 'Failed to delete all history entries', details: error.message });
    }
});

app.get('/api/lessons/:id/statistics', requireAuth, async (req, res) => {
    const lessonId = req.params.id;

    try {
        // Fetch lesson data (needed for potential cache key or headers)
        const { data: lessonData, error: lessonError } = await supabase
            .from('lessons')
            .select('lastUpdated') // Fetch only what's needed, e.g., lastUpdated
            .eq('id', lessonId)
            .maybeSingle(); // Use maybeSingle in case lesson is deleted

        if (lessonError) {
            console.error('Error fetching lesson data for stats:', lessonError);
            // Decide if this is fatal or if you can proceed without lesson info
            // For caching, we might need the lastUpdated time
        }

        // Fetch results data
        const { data: lessonResults, error: resultsError } = await supabase
            .from('results')
            .select(`
                *,
                students ( full_name )
            `)
            .eq('lessonId', lessonId); // Removed order for consistency in ETag
            // .order('timestamp', { ascending: false }); // Ordering might change ETag unnecessarily if data is the same

        if (resultsError) throw resultsError;

        // Process statistics (existing logic)
        let statsPayload;
        if (!lessonResults || lessonResults.length === 0) {
            statsPayload = {
                uniqueStudents: 0,
                totalAttempts: 0,
                averageScore: 0,
                // ... other default stats ...
                lowScores: 0,
                highScores: 0,
                scoreDistribution: { labels: [], data: [] },
                questionStats: [],
                transcripts: []
            };
        } else {
            // ... existing statistics calculation logic ...
            const uniqueStudents = new Set(lessonResults.map(r => r.student_id)).size;
            const scores = lessonResults.map(r => {/* ... */ return (typeof r.score === 'number' ? r.score : 0) / (r.totalPoints || 1) * 100; });
            const averageScore = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
            const scoreRanges = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
            const distribution = new Array(scoreRanges.length - 1).fill(0);
            lessonResults.forEach((result) => {
                 const scorePercent = (typeof result.score === 'number' ? result.score : 0) / (result.totalPoints || 1) * 100;
                 const normalizedScore = Math.max(0, Math.min(100, scorePercent));
                 const rangeIndex = normalizedScore === 100 ? 9 : Math.floor(normalizedScore / 10);
                 if (rangeIndex >= 0 && rangeIndex < distribution.length) distribution[rangeIndex]++;
            });
            const questionStats = {}; /* ... existing logic ... */
            lessonResults.forEach(result => {
                if (Array.isArray(result.questions)) {
                    result.questions.forEach(q => {
                        const questionKey = q.question || `question_${q.originalIndex || Date.now()}`;
                        if (!questionStats[questionKey]) { /* init stats */ questionStats[questionKey] = { questionText: q.question, total: 0, completed: 0, correct: 0, incorrect: 0 }; }
                        questionStats[questionKey].total++;
                        questionStats[questionKey].completed++;
                        if (q.isCorrect) questionStats[questionKey].correct++; else questionStats[questionKey].incorrect++;
                    });
                }
            });
            // Corrected formatting logic to avoid map error
            const formattedQuestionStats = Object.values(questionStats).map((stats) => ({
                question: stats.questionText,
                total: stats.total,
                completed: stats.completed,
                correct: stats.correct,
                incorrect: stats.incorrect,
                accuracy: stats.completed > 0 ? ((stats.correct / stats.completed) * 100).toFixed(1) + '%' : 'N/A'
            }));
            // Corrected formatting logic for transcripts
            const transcripts = lessonResults.map(r => ({
                studentName: r.students?.full_name || 'Unknown',
                timestamp: r.timestamp,
                score: ((typeof r.score === 'number' ? r.score : 0) / (r.totalPoints || 1) * 100).toFixed(1) + '%'
            }));

            statsPayload = {
                uniqueStudents,
                totalAttempts: lessonResults.length,
                averageScore: averageScore.toFixed(1),
                lowScores: scores.filter(s => s < 50).length,
                highScores: scores.filter(s => s >= 50).length,
                scoreDistribution: { labels: scoreRanges.slice(0, -1).map((n, i) => i === 9 ? '90-100%' : `${n}-${n+9}%`), data: distribution },
                questionStats: formattedQuestionStats,
                transcripts: transcripts
            };
        }

        // --- Caching Logic Removed ---
        // const cacheData = { stats: statsPayload, lessonLastUpdated: lessonData?.lastUpdated };
        // const etag = generateETag(cacheData);
        // const clientETag = req.headers['if-none-match'];
        // if (clientETag && clientETag === `"${etag}"`) {
        //     console.log(`Cache hit for /api/lessons/${lessonId}/statistics`);
        //     return res.status(304).send();
        // }
        // console.log(`Cache miss for /api/lessons/${lessonId}/statistics`);
        // setCacheHeaders(res, etag, 60 * 5);
        // --- End Caching Logic Removal ---

        res.json(statsPayload);

    } catch (error) {
        console.error(`Error fetching statistics for lesson ${lessonId}:`, error);
        // Removed cache header cleanup
        // res.removeHeader('ETag');
        // res.removeHeader('Cache-Control');
        res.status(500).json({ error: 'Failed to load statistics', details: error.message });
    }
});

app.post('/api/student-info', (req, res) => {
    req.session.studentInfo = req.body;
    res.json({ success: true });
});

app.get('/api/check-student-auth', (req, res) => {
    if (req.session.studentId) {
        res.json({ 
            isAuthenticated: true, 
            student: { 
                id: req.session.studentId, 
                name: req.session.studentName 
            } 
        });
    } else {
        res.json({ isAuthenticated: false });
    }
});

app.get('/api/gallery-images', async (req, res) => {
    const imagesDir = path.join(__dirname, '..', 'public', 'lesson_images');
    try {
        // Ensure directory exists asynchronously
        try {
            await fs.access(imagesDir);
        } catch (dirError) {
            if (dirError.code === 'ENOENT') {
                await fs.mkdir(imagesDir, { recursive: true });
            } else {
                throw dirError; // Re-throw unexpected errors
            }
        }

        // Read directory asynchronously
        const dirents = await fs.readdir(imagesDir, { withFileTypes: true });
        const files = dirents
            .filter(dirent => dirent.isFile() && /\.(jpg|jpeg|png|gif)$/i.test(dirent.name))
            .map(dirent => `/lesson_images/${dirent.name}`)
            .sort(); // Sort filenames for consistent ETag generation

        // --- Caching Logic Removed ---
        // const etag = generateETag(files);
        // const clientETag = req.headers['if-none-match'];
        // if (clientETag && clientETag === `"${etag}"`) {
        //     console.log('Cache hit for /api/gallery-images');
        //     return res.status(304).send();
        // }
        // console.log('Cache miss for /api/gallery-images');
        // setCacheHeaders(res, etag, 60 * 10);
        // --- End Caching Logic Removal ---

        res.json(files);
    } catch (error) {
        console.error('Error reading gallery images:', error);
        // Removed cache header cleanup
        // res.removeHeader('ETag');
        // res.removeHeader('Cache-Control');
        res.status(500).json({ error: 'Failed to load gallery images' });
    }
});

app.get('/api/quiz', requireStudentAuth, async (req, res) => {
    try {
        const { data: quizConfig, error } = await supabase
            .from('quizzes')
            .select('quiz_data')
            .eq('id', 'main_quiz')
            .maybeSingle();

        if (error) throw error;

        const quizData = quizConfig?.quiz_data || { questions: [] }; // Ensure we have a default value

        // --- Caching Logic Removed ---
        // const etag = generateETag(quizData);
        // const clientETag = req.headers['if-none-match'];
        // if (clientETag && clientETag === `"${etag}"`) {
        //     console.log('Cache hit for /api/quiz');
        //     return res.status(304).send();
        // }
        // console.log('Cache miss for /api/quiz');
        // setCacheHeaders(res, etag, 60 * 30);
        // --- End Caching Logic Removal ---

        // Re-implement caching for quiz data
        if (shouldCache(req)) {
            const etag = generateETag(quizData);
            const clientETag = req.headers['if-none-match'];
            if (clientETag && clientETag === `"${etag}"`) {
                console.log('Cache hit for /api/quiz');
                return res.status(304).send();
            }
            console.log('Cache miss for /api/quiz');
            setCacheHeaders(res, etag, 60 * 30); // Cache for 30 minutes
        }

        res.json(quizData);

    } catch (error) {
        console.error('Error loading quiz data:', error);
        // Removed cache header cleanup
        // res.removeHeader('ETag');
        // res.removeHeader('Cache-Control');
        res.status(500).json({ error: 'Failed to load quiz data', details: error.message });
    }
});

app.post('/api/quiz/submit', requireStudentAuth, async (req, res) => {
     const resultId = Date.now().toString();
     const studentIdFromSession = req.session.studentId;
     if (!studentIdFromSession) {
         return res.status(401).json({ error: 'Unauthorized: No student session found.' });
     }
     
     const newResult = {
         id: resultId,
         timestamp: new Date().toISOString(),
         student_id: studentIdFromSession,
         lessonId: 'quiz_game',
         score: req.body.score,
         totalPoints: req.body.totalPoints,
         questions: req.body.answers,
         ipAddress: req.body.ipAddress
     };

    try {
        const { data, error } = await supabase
            .from('quiz_results')
            .insert(newResult)
            .select('id')
            .single();
            
        if (error) throw error;
        
        res.json({ success: true, resultId: data.id });
    } catch (error) {
        console.error('Error saving quiz results:', error);
        res.status(500).json({ error: 'Failed to save quiz results', details: error.message });
    }
});

app.post('/api/quiz/save', requireAuth, async (req, res) => {
    const quizData = req.body;
    try {
        const { error } = await supabase
            .from('quizzes')
            .upsert({ id: 'main_quiz', quiz_data: quizData });

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving quiz:', error);
        res.status(500).json({ error: 'Failed to save quiz', details: error.message });
    }
});

app.get('/api/tags', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('lessons')
            .select('tags');

        if (error) throw error;

        const allTags = new Set();
        if (data) {
            data.forEach(lesson => {
                if (Array.isArray(lesson.tags)) {
                    lesson.tags.forEach(tag => {
                        if (tag && typeof tag === 'string') {
                           allTags.add(tag.trim());
                        }
                    });
                }
            });
        }

        const uniqueSortedTags = Array.from(allTags).sort();

        // --- Caching Logic Removed ---
        // const etag = generateETag(uniqueSortedTags);
        // const clientETag = req.headers['if-none-match'];
        // if (clientETag && clientETag === `"${etag}"`) {
        //     console.log('Cache hit for /api/tags');
        //     return res.status(304).send();
        // }
        // console.log('Cache miss for /api/tags');
        // setCacheHeaders(res, etag, 60 * 15); // Cache tags for 15 minutes
        // --- End Caching Logic Removal ---

        // Re-implement caching for tags
        if (shouldCache(req)) {
            const etag = generateETag(uniqueSortedTags);
            const clientETag = req.headers['if-none-match'];
            if (clientETag && clientETag === `"${etag}"`) {
                console.log('Cache hit for /api/tags');
                return res.status(304).send();
            }
            console.log('Cache miss for /api/tags');
            setCacheHeaders(res, etag, 60 * 15); // Cache tags for 15 minutes
        }

        res.json(uniqueSortedTags);

    } catch (error) {
        console.error('Error fetching tags:', error);
        // Removed cache header cleanup
        // res.removeHeader('ETag');
        // res.removeHeader('Cache-Control');
        res.status(500).json({ error: 'Failed to fetch tags', details: error.message });
    }
});

app.get('/api/admin/unapproved-students', requireAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('students')
            .select('id, full_name, phone_number, date_of_birth, created_at')
            .eq('is_approved', false)
            .order('created_at', { ascending: true });

        if (error) throw error;

        const studentsData = data || [];

        // --- Caching Logic Removed ---
        // const etag = generateETag(studentsData);
        // const clientETag = req.headers['if-none-match'];
        // if (clientETag && clientETag === `"${etag}"`) {
        //     console.log('Cache hit for /api/admin/unapproved-students');
        //     return res.status(304).send();
        // }
        // console.log('Cache miss for /api/admin/unapproved-students');
        // setCacheHeaders(res, etag, 60 * 1); // 1 minute cache
        // --- End Caching Logic Removal ---

        res.json(studentsData);
    } catch (error) {
        console.error('Error fetching unapproved students:', error);
        // Removed cache header cleanup
        // res.removeHeader('ETag');
        // res.removeHeader('Cache-Control');
        res.status(500).json({ error: 'Failed to fetch unapproved students', details: error.message });
    }
});

// New endpoint for fetching approved students
app.get('/api/admin/approved-students', requireAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('students')
            .select('id, full_name, phone_number, date_of_birth, created_at, approved_device_fingerprint')
            .eq('is_approved', true)
            .order('full_name', { ascending: true });

        if (error) throw error;

        const studentsData = data || [];

        // --- Caching Logic Removed ---
        // const etag = generateETag(studentsData);
        // const clientETag = req.headers['if-none-match'];
        // if (clientETag && clientETag === `"${etag}"`) {
        //     console.log('Cache hit for /api/admin/approved-students');
        //     return res.status(304).send();
        // }
        // console.log('Cache miss for /api/admin/approved-students');
        // setCacheHeaders(res, etag, 60 * 5);
        // --- End Caching Logic Removal ---

        res.json(studentsData);
    } catch (error) {
        console.error('Error fetching approved students:', error);
        // Removed cache header cleanup
        // res.removeHeader('ETag');
        // res.removeHeader('Cache-Control');
        res.status(500).json({ error: 'Failed to fetch approved students', details: error.message });
    }
});

app.post('/api/admin/approve-student/:studentId', requireAuth, async (req, res) => {
    const studentId = req.params.studentId;
    try {
        const { data, error } = await supabase
            .from('students')
            .update({ is_approved: true })
            .eq('id', studentId)
            .select('id')
            .single();

        if (error) {
            if (error.code === 'PGRST116') { 
                return res.status(404).json({ success: false, message: 'Student not found.' });
            }
            throw error;
        }

        if (!data) {
             return res.status(404).json({ success: false, message: 'Student not found (post-update check).' });
        }

        console.log(`Student ${studentId} approved by admin.`);
        res.json({ success: true, message: 'Student approved successfully.' });
    } catch (error) {
        console.error(`Error approving student ${studentId}:`, error);
        res.status(500).json({ error: 'Failed to approve student', details: error.message });
    }
});

app.delete('/api/admin/reject-student/:studentId', requireAuth, async (req, res) => {
    const studentId = req.params.studentId;
    try {
        const { error } = await supabase
            .from('students')
            .delete()
            .eq('id', studentId);

        if (error) throw error;
        
        console.log(`Student registration ${studentId} rejected (deleted) by admin.`);
        res.json({ success: true, message: 'Student registration rejected.' });
    } catch (error) {
        console.error(`Error rejecting student ${studentId}:`, error);
        res.status(500).json({ error: 'Failed to reject student', details: error.message });
    }
});

// New endpoint to unbind a device from a student
app.post('/api/admin/unbind-device/:studentId', requireAuth, async (req, res) => {
    const studentId = req.params.studentId;
    try {
        const { data, error } = await supabase
            .from('students')
            .update({ approved_device_fingerprint: null })
            .eq('id', studentId)
            .select('id') // Select something to confirm the update happened
            .single();

        if (error) {
            if (error.code === 'PGRST116') { // Code for "No rows returned"
                return res.status(404).json({ success: false, message: 'Student not found.' });
            }
            console.error(`Error unbinding device for student ${studentId}:`, error);
            throw error; // Throw for generic server error
        }

        if (!data) {
            // Should be caught by PGRST116, but as a fallback
            return res.status(404).json({ success: false, message: 'Student not found (post-update check).' });
        }

        console.log(`Device unbind successful for student ${studentId}.`);
        res.json({ success: true, message: 'Device unbound successfully. The student can now log in from a new device.' });

    } catch (error) {
        console.error(`Error processing unbind request for student ${studentId}:`, error);
        res.status(500).json({ success: false, error: 'Failed to unbind device', details: error.message });
    }
});

// --- NEW Endpoint: Delete Student and Associated Data ---
app.delete('/api/admin/delete-student/:studentId', requireAuth, async (req, res) => {
    const studentId = req.params.studentId;
    console.warn(`ADMIN ACTION: Attempting to permanently delete student ${studentId} and all related data.`);

    // Use the Supabase Admin client for operations that might need to bypass RLS
    const adminClient = supabaseAdmin; // Assuming supabaseAdmin is initialized with service key

    try {
        // Start a transaction if your database supports it, otherwise run sequentially
        // Note: Supabase JS client doesn't directly support multi-statement transactions.
        // For atomicity, consider creating a PostgreSQL function (RPC).
        // Running sequentially is simpler but less robust if one step fails.

        // 1. Delete related data first (order might matter based on foreign key constraints)
        console.log(`Deleting rating history for student ${studentId}...`);
        const { error: historyError } = await adminClient
            .from('rating_history')
            .delete()
            .eq('student_id', studentId);
        if (historyError) {
            console.error('Error deleting rating history:', historyError);
            // Decide if you want to proceed or stop
            // throw new Error(`Failed to delete rating history: ${historyError.message}`);
        }

        console.log(`Deleting ratings for student ${studentId}...`);
        const { error: ratingError } = await adminClient
            .from('ratings')
            .delete()
            .eq('student_id', studentId);
        if (ratingError) {
            console.error('Error deleting ratings:', ratingError);
            // throw new Error(`Failed to delete ratings: ${ratingError.message}`);
        }

        console.log(`Deleting quiz results for student ${studentId}...`);
        const { error: quizResultsError } = await adminClient
            .from('quiz_results')
            .delete()
            .eq('student_id', studentId);
        if (quizResultsError) {
            console.error('Error deleting quiz results:', quizResultsError);
            // throw new Error(`Failed to delete quiz results: ${quizResultsError.message}`);
        }

        console.log(`Deleting lesson results for student ${studentId}...`);
        const { error: resultsError } = await adminClient
            .from('results')
            .delete()
            .eq('student_id', studentId);
        if (resultsError) {
            console.error('Error deleting lesson results:', resultsError);
            // throw new Error(`Failed to delete lesson results: ${resultsError.message}`);
        }
        
        // Potentially delete from other related tables if necessary
        // console.log(`Deleting temp content for student ${studentId}...`);
        // await adminClient.from('temp_lesson_content').delete().eq('user_id', studentId); 
        // Uncomment and adjust if 'temp_lesson_content' uses student ID

        // 2. Finally, delete the student record
        console.log(`Deleting student record ${studentId}...`);
        const { error: studentDeleteError } = await adminClient
            .from('students')
            .delete()
            .eq('id', studentId);

        if (studentDeleteError) {
            // If the student record itself fails to delete, this is a critical error
            console.error('Critical error deleting student record:', studentDeleteError);
            throw new Error(`Failed to delete student record: ${studentDeleteError.message}`);
        }

        console.log(`Successfully deleted student ${studentId} and associated data.`);
        res.json({ success: true, message: 'Student and all associated data deleted successfully.' });

    } catch (error) {
        console.error(`Error processing delete request for student ${studentId}:`, error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to delete student', 
            details: error.message 
        });
    }
});
// --- END NEW Endpoint ---

// This is the correct endpoint to apply caching to
app.get('/api/history', requireAuth, async (req, res) => {
    try {
        // --- Pagination, Sorting, Searching Parameters ---
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15; // Default limit for history
        const search = req.query.search || '';
        const sort = req.query.sort || 'time-desc'; // Default sort: newest first

        const startIndex = (page - 1) * limit;

        // Determine sorting parameters
        let orderAscending = false;
        let orderColumn = 'timestamp'; // Default is results.timestamp

        // Map frontend sort keys to potential database columns
        const sortMap = {
            'time-asc': { column: 'timestamp', ascending: true },
            'time-desc': { column: 'timestamp', ascending: false },
            'name-asc': { column: 'students.full_name', ascending: true }, // Requires join
            'name-desc': { column: 'students.full_name', ascending: false }, // Requires join
            'lesson-asc': { column: 'lessons.title', ascending: true }, // Requires join
            'lesson-desc': { column: 'lessons.title', ascending: false }, // Requires join
            'score-asc': { column: 'score', ascending: true },
            'score-desc': { column: 'score', ascending: false },
        };

        if (sortMap[sort]) {
            orderColumn = sortMap[sort].column;
            orderAscending = sortMap[sort].ascending;
        } else {
            // Default if invalid sort provided
            orderColumn = 'timestamp';
            orderAscending = false;
        }

        // --- Base Query ---
        let query = supabase
            .from('results')
            .select(`
                id,
                student_id,
                timestamp,
                score,
                totalPoints,
                lessonId,
                students!inner ( full_name ),
                lessons ( title )
            `, { count: 'exact' }); // Request total count

        // --- Apply Search Filter ---
        if (search) {
            // Search across student name (joined) and lesson title (joined)
            // Note: Searching joined tables might require an RPC function for optimal performance,
            // especially with large datasets. This 'or' filter might be slow.
            // We also need to handle the 'quiz_game' case for lessonTitle.
             query = query.or(`students.full_name.ilike.%${search}%,lessons.title.ilike.%${search}%${search.toLowerCase().includes('chinh') || search.toLowerCase().includes('phục') ? ',lessonId.eq.quiz_game' : ''}`);
             // The ilike operator performs case-insensitive matching.
             // Added condition to search for 'quiz_game' if search term contains 'chinh' or 'phục'
        }

        // --- Apply Sorting ---
        // Handle sorting on joined tables carefully. Supabase might require specific syntax.
        // If sorting on joined fields doesn't work directly, consider an RPC or view.
        if (orderColumn.includes('.')) {
            // Syntax for ordering by related table column
            const [relatedTable, relatedColumn] = orderColumn.split('.');
            query = query.order(relatedColumn, { foreignTable: relatedTable, ascending: orderAscending });
        } else {
            query = query.order(orderColumn, { ascending: orderAscending });
        }

        // --- Apply Pagination ---
        query = query.range(startIndex, startIndex + limit - 1);

        // --- Execute Query ---
        const { data: historyData, error, count: totalCount } = await query;

        if (error) throw error;

        const history = historyData.map(result => ({
            resultId: result.id, // Use the actual result ID
            studentName: result.students?.full_name || 'Unknown Student',
            lessonTitle: result.lessons?.title || (result.lessonId === 'quiz_game' ? 'Trò chơi chinh phục' : 'Unknown Lesson'),
            submittedAt: result.timestamp,
            score: result.score,
            totalPoints: result.totalPoints,
            // Keep scorePercentage calculation or remove if not needed
            scorePercentage: result.totalPoints ? ((result.score / result.totalPoints) * 100).toFixed(1) + '%' : 'N/A'
        }));

        // --- Caching Logic (already removed/commented) ---
        /*
        const etag = generateETag({ history, totalCount, page, limit, search, sort });
        const clientETag = req.headers['if-none-match'];

        if (clientETag && clientETag === `"${etag}"`) {
            console.log('Cache hit for /api/history');
            return res.status(304).send();
        }

        console.log('Cache miss for /api/history');
        setCacheHeaders(res, etag, 60 * 1); // Cache for 1 minute? Adjust as needed
        */
        // --- End Caching Logic ---

        // Return paginated data and total count
        res.json({
            history: history,
            total: totalCount,
            page: page,
            limit: limit
        });

    } catch (error) {
        console.error('Failed to load history:', error);
        // Removed cache header cleanup (was already commented out)
        // res.removeHeader('ETag');
        // res.removeHeader('Cache-Control');
        res.status(500).json({ error: 'Failed to load history', details: error.message });
    }
});

// --- Corrected Admin Image Upload Endpoint with Resizing ---
app.post('/api/admin/upload-image', requireAuth, upload.single('imageFile'), async (req, res) => {
    console.log('Received image upload/URL request.');
    let imageBuffer;
    let originalFilename = 'uploaded_image'; // Default filename

    try {
        // Check if file was uploaded or URL was provided
        if (req.file) {
            console.log('Processing uploaded file:', req.file.originalname);
            if (!req.file.mimetype.startsWith('image/')) {
                return res.status(400).json({ success: false, error: 'Invalid file type. Only images are allowed.' });
            }
            imageBuffer = req.file.buffer;
            originalFilename = req.file.originalname;
        } else if (req.body.imageUrl) {
            const imageUrl = req.body.imageUrl;
            console.log('Fetching image from URL:', imageUrl);
            // Basic URL validation
            if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
                return res.status(400).json({ success: false, error: 'Invalid image URL provided. Must start with http:// or https://' });
            }
            const response = await fetch(imageUrl, { timeout: 10000 }); // Add timeout
            if (!response.ok) {
                throw new Error(`Failed to fetch image from URL: ${response.status} ${response.statusText}`);
            }
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.startsWith('image/')) {
                 throw new Error(`URL did not point to a valid image. Content-Type: ${contentType}`);
            }
            imageBuffer = await response.buffer();
            // Try to get a filename from the URL path
            try {
                 const urlParts = new URL(imageUrl);
                 const baseName = path.basename(urlParts.pathname);
                 if (baseName) originalFilename = baseName;
            } catch (urlError) {
                 console.warn('Could not parse filename from URL:', urlError.message);
                 // Keep default filename if parsing fails
            }
        } else {
            console.log('No image file or URL provided in the request.');
            return res.status(400).json({ success: false, error: 'No image file or image URL provided.' });
        }

        // Sanitize filename (remove extension, non-alphanumeric chars, add timestamp)
        const safeFilenameBase = path.parse(originalFilename).name.replace(/[^a-zA-Z0-9_.-]/g, '_');
        const timestamp = Date.now();
        const uniqueFilename = `${safeFilenameBase}_${timestamp}.webp`; // Save as webp

        // Resize image using sharp
        console.log('Resizing image...');
        const resizedBuffer = await sharp(imageBuffer)
            .resize({
                width: MAX_IMAGE_DIMENSION,
                height: MAX_IMAGE_DIMENSION,
                fit: 'inside', // Scale down to fit within dimensions, preserving aspect ratio
                withoutEnlargement: true // Don't upscale if image is smaller
            })
            .webp({ quality: 80 }) // Convert to webp for efficiency (adjust quality as needed)
            .toBuffer();
        console.log('Image resized successfully.');

        // Upload to Supabase Storage
        console.log(`Uploading processed image to Supabase Storage bucket '${IMAGE_BUCKET}' as '${uniqueFilename}'...`);
        // Use the ADMIN client with service role key to bypass RLS
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from(IMAGE_BUCKET)
            .upload(uniqueFilename, resizedBuffer, {
                contentType: 'image/webp', // Set correct content type
                cacheControl: '3600', // Example: cache for 1 hour
                upsert: false // Don't overwrite existing files
            });

        if (uploadError) {
            console.error('Supabase storage upload error:', uploadError);
            // Check for specific errors if possible (e.g., permissions)
            if (uploadError.message && uploadError.message.includes('bucket not found')) {
                 throw new Error(`Storage bucket '${IMAGE_BUCKET}' not found. Please create it in Supabase.`);
            } else if (uploadError.message && uploadError.message.includes('policy')) {
                 throw new Error(`Storage upload failed due to RLS policy. Check bucket permissions.`);
            }
            throw uploadError; // Re-throw generic error
        }

        if (!uploadData || !uploadData.path) {
             console.error('Supabase storage upload seemed successful but no path was returned.');
             // This scenario might warrant trying to delete the file if possible
             await supabaseAdmin.storage.from(IMAGE_BUCKET).remove([uniqueFilename]).catch(e => console.error('Cleanup attempt failed:', e));
             throw new Error('Supabase storage upload failed: No path returned.');
        }

        console.log('Image uploaded successfully. Path:', uploadData.path);

        // Get public URL for the uploaded image
        const { data: urlData } = supabaseAdmin.storage
            .from(IMAGE_BUCKET)
            .getPublicUrl(uploadData.path);

        if (!urlData || !urlData.publicUrl) {
            console.error('Failed to get public URL from Supabase even after successful upload.');
            // Maybe the bucket isn't public? Or an issue with Supabase?
            // Try to remove the uploaded file
            await supabaseAdmin.storage.from(IMAGE_BUCKET).remove([uniqueFilename]).catch(e => console.error('Cleanup attempt failed:', e));
            throw new Error('Could not get public URL for the uploaded image. File removed.');
        }

        const publicUrl = urlData.publicUrl;
        console.log('Public URL:', publicUrl);

        // Return the public URL
        res.json({ success: true, imageUrl: publicUrl });

    } catch (error) {
        console.error('Error processing image upload/URL request:', error);
        // Attempt to clean up only if uniqueFilename was generated
        if (typeof uniqueFilename === 'string') {
            try {
                console.warn(`Upload failed. Attempting cleanup for: ${uniqueFilename}`);
                await supabaseAdmin.storage.from(IMAGE_BUCKET).remove([uniqueFilename]);
                console.log(`Cleanup successful for: ${uniqueFilename}`);
            } catch (cleanupError) {
                console.error('Error during upload cleanup attempt:', cleanupError);
            }
        }
        res.status(500).json({ success: false, error: 'Failed to process image', details: error.message });
    }
});
// --- END Corrected Endpoint ---

// --- Endpoint for saving raw lesson content (used as session storage fallback) ---
app.post('/api/admin/save-raw-lesson', requireAuth, async (req, res) => {
    try {
        const { id, rawContent } = req.body;
        
        if (!rawContent) {
            return res.status(400).json({ success: false, error: 'No content provided' });
        }
        
        if (!id) {
            return res.status(400).json({ success: false, error: 'No ID provided' });
        }
        
        // Save the raw content to a temporary table or file
        // Use Supabase to store this in a custom table
        const { data, error } = await supabaseAdmin
            .from('temp_lesson_content')
            .upsert({ 
                id: id,
                content: rawContent,
                created_at: new Date().toISOString(),
                user_id: req.session.user?.id || 'unknown'
            });
            
        if (error) {
            console.error('Error saving raw lesson content:', error);
            return res.status(500).json({ success: false, error: error.message });
        }
        
        console.log(`Raw lesson content saved for ID: ${id}`);
        return res.json({ success: true, id: id });
        
    } catch (error) {
        console.error('Error in save-raw-lesson endpoint:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Endpoint for retrieving raw lesson content ---
app.get('/api/admin/raw-lesson/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!id) {
            return res.status(400).json({ success: false, error: 'No ID provided' });
        }
        
        // Retrieve the raw content from storage
        const { data, error } = await supabaseAdmin
            .from('temp_lesson_content')
            .select('content')
            .eq('id', id)
            .single();
            
        if (error) {
            console.error('Error retrieving raw lesson content:', error);
            return res.status(500).json({ success: false, error: error.message });
        }
        
        if (!data) {
            return res.status(404).json({ success: false, error: 'Content not found' });
        }
        
        console.log(`Raw lesson content retrieved for ID: ${id}`);
        return res.json({ success: true, content: data.content });
        
    } catch (error) {
        console.error('Error in get-raw-lesson endpoint:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- NEW Share Lesson Route ---
app.get('/share/lesson/:lessonId', async (req, res) => {
    const lessonId = req.params.lessonId;
    const loggedInStudentId = req.session.studentId; // Check if student is logged in
    console.log(`Attempting to serve share page for lesson ID: ${lessonId}. Logged in student: ${loggedInStudentId || 'None'}`);

    try {
        // 1. Fetch lesson details including randomQuestions
        const { data: lessonData, error: lessonError } = await supabase
            .from('lessons')
            .select('id, title, lessonImage, questions, randomQuestions') // Added randomQuestions
            .eq('id', lessonId)
            .single();

        if (lessonError) throw new Error(`Database error fetching lesson: ${lessonError.message}`);
        if (!lessonData) throw new Error('Lesson not found');
        console.log(`Lesson found: ${lessonData.title}`);

        // 2. Fetch TOTAL submission count from 'results' table
        const { count: submissionCount, error: countError } = await supabase
            .from('results') // Changed from 'submissions' to 'results'
            .select('*', { count: 'exact', head: true })
            .eq('lessonId', lessonId); // Changed from 'lesson_id' to 'lessonId'

        if (countError) {
            console.error(`Error fetching total submission count for lesson ${lessonId}:`, countError.message);
        }
        const totalSubmissions = submissionCount || 0;
        console.log(`Total submission count: ${totalSubmissions}`);

        // 3. Determine the question count to display
        // Use randomQuestions if available and valid, otherwise fallback to total questions
        const totalQuestionsAvailable = Array.isArray(lessonData.questions) ? lessonData.questions.length : 0;
        const questionsPerAttempt = (typeof lessonData.randomQuestions === 'number' && lessonData.randomQuestions > 0)
            ? lessonData.randomQuestions
            : totalQuestionsAvailable; // Fallback to total if randomQuestions is not set/valid
        console.log(`Questions per attempt: ${questionsPerAttempt}`);

        // 4. Fetch USER'S past results (if logged in)
        let userHistoryHtml = '';
        if (loggedInStudentId) {
            console.log(`Fetching history for student ${loggedInStudentId} and lesson ${lessonId}`);
            const { data: historyData, error: historyError } = await supabase
                .from('results')
                .select('id, score, totalPoints, timestamp, questions')
                .eq('student_id', loggedInStudentId)
                .eq('lessonId', lessonId)
                .order('timestamp', { ascending: false })
                .limit(3); // Limit to latest 3 attempts

        if (historyError) {
                console.error(`Error fetching user history:`, historyError.message);
                // Don't fail the page load, just show no history
            } else if (historyData && historyData.length > 0) {
                console.log(`Found ${historyData.length} history entries for the user.`);
                // Generate HTML for history cards
                userHistoryHtml = '<h2 style="text-align: left; margin-top: 30px; margin-bottom: 15px; font-size: 1.4em; color: #333;">Lịch sử làm bài của bạn</h2>';
                historyData.forEach(result => {
                    const score = result.score ?? 0;
                    const totalPoints = result.totalPoints ?? 0;
                    const scorePercent = totalPoints > 0 ? ((score / totalPoints) * 100).toFixed(2) : 'N/A';
                    const correctAnswers = Array.isArray(result.questions)
                        ? result.questions.filter(q => q.isCorrect).length
                        : 0;
                    const submissionTime = new Date(result.timestamp).toLocaleString('vi-VN', {
                         day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    }); // Format like 17/03/2025 05:35

                    // Basic card structure - styles can be improved later
                    userHistoryHtml += `
                        <div style="background-color: #f9f9f9; border: 1px solid #eee; border-radius: 8px; padding: 15px; margin-bottom: 10px; text-align: left;">
                            <p style="margin: 5px 0; font-size: 1.2em; font-weight: bold; color: #1877f2;">Điểm của bạn: ${scorePercent}</p>
                            <p style="margin: 5px 0;">Thời gian nộp bài: ${submissionTime}</p>
                            <p style="margin: 5px 0;">Số lượng đúng: <strong style="color: green;">${correctAnswers}</strong> / ${totalPoints}</p>
                             <!-- Add link to detailed result page if available -->
                             ${result.id ? `<a href="/result/${result.id}" style="display: inline-block; margin-top: 10px; font-size: 0.9em; color: #555; text-decoration: none;">Xem chi tiết ›</a>` : ''}
                        </div>
                    `;
                });
            } else {
                 console.log(`No history found for student ${loggedInStudentId} on lesson ${lessonId}`);
            }
        }

        // 5. Read the HTML template
        const templatePath = path.join(process.cwd(), 'views', 'share-lesson.html');
        let htmlContent = await fs.readFile(templatePath, 'utf-8');

        // 6. Replace placeholders
        htmlContent = htmlContent.replace(/{{LESSON_NAME}}/g, lessonData.title || 'Không có tiêu đề');

        // Use the URL directly from the database (it should already be the full public URL)
        let imageUrl = lessonData.lessonImage || ''; 

        // Remove the previous logic that tried to regenerate the URL
        // if (imageUrl && !imageUrl.startsWith('http')) { ... }

        htmlContent = htmlContent.replace(/{{LESSON_IMAGE_URL}}/g, imageUrl);
        htmlContent = htmlContent.replace(/{{QUESTION_COUNT}}/g, questionsPerAttempt);
        htmlContent = htmlContent.replace(/{{SUBMISSION_COUNT}}/g, totalSubmissions);
        htmlContent = htmlContent.replace(/{{LESSON_ID}}/g, lessonData.id);
        htmlContent = htmlContent.replace(/{{USER_HISTORY_HTML}}/g, userHistoryHtml);

        // 7. Send the response
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.status(200).send(htmlContent);
        console.log(`Successfully served share page for lesson ID: ${lessonId}`);

    } catch (error) {
        console.error(`Error generating share page for lesson ${lessonId}:`, error.message);
        // Send a user-friendly error page
        res.status(404).send(`
            <!DOCTYPE html>
            <html lang="vi">
            <head><meta charset="UTF-8"><title>Lỗi</title></head>
            <body style="font-family: sans-serif; padding: 20px;">
                <h1>Không tìm thấy bài học</h1>
                <p>Bài học bạn yêu cầu (${lessonId}) không tồn tại hoặc đã xảy ra lỗi khi tải.</p>
                <a href="/">Quay lại trang chủ</a>
            </body>
            </html>
        `);
    }
});
// --- END Share Lesson Route ---

// --- Rating System Endpoints ---
app.get('/api/ratings', async (req, res) => {
    try {
        const { data: ratings, error } = await supabase
            .from('ratings')
            .select(`
                *,
                students ( full_name )
            `)
            .order('rating', { ascending: false })
            .limit(100);

        if (error) {
            console.error('Supabase error fetching ratings:', error);
            // Return a specific error instead of throwing
            return res.status(500).json({ 
                error: 'Failed to fetch ratings from database', 
                details: error.message 
            });
        }

        // Ensure ratings is always an array
        const ratingsData = Array.isArray(ratings) ? ratings : [];

        res.json(ratingsData); // Send array (could be empty)

    } catch (error) { // Catch other unexpected errors
        console.error('Error in /api/ratings endpoint:', error);
        res.status(500).json({ 
            error: 'Internal server error fetching ratings', 
            details: error.message 
        });
    }
});

app.get('/api/ratings/:studentId', async (req, res) => {
    try {
        const { data: rating, error } = await supabase
            .from('ratings')
            .select(`
                *,
                students ( full_name )
            `)
            .eq('student_id', req.params.studentId)
            .single();

        if (error) throw error;
        res.json(rating);
    } catch (error) {
        console.error('Error fetching student rating:', error);
        res.status(500).json({ error: 'Failed to fetch student rating' });
    }
});

app.get('/api/ratings/:studentId/history', async (req, res) => {
    try {
        const { data: history, error } = await supabase
            .from('rating_history')
            .select('*')
            .eq('student_id', req.params.studentId)
            .order('timestamp', { ascending: false })
            .limit(50);

        if (error) throw error;
        res.json(history);
    } catch (error) {
        console.error('Error fetching rating history:', error);
        res.status(500).json({ error: 'Failed to fetch rating history' });
    }
});

// --- Rating Calculation Helper Functions ---
function calculateRatingChange(previousRating, performance, timeTaken, streak) {
    // Base K-factor (sensitivity of rating changes)
    const baseK = 32;
    
    // Time bonus (faster completion = higher bonus)
    const timeBonus = Math.max(0, 1 - (timeTaken / 300)); // 5 minutes max time bonus
    
    // Streak multiplier
    const streakMultiplier = 1 + (Math.min(streak, 10) * 0.1); // Max 2x multiplier at 10 streak
    
    // Performance factor (0-1)
    const performanceFactor = performance;
    
    // Calculate expected score (ELO formula)
    const expectedScore = 1 / (1 + Math.pow(10, (1500 - previousRating) / 400));
    
    // Calculate rating change
    const ratingChange = baseK * (performanceFactor - expectedScore) * timeBonus * streakMultiplier;
    
    return Math.round(ratingChange);
}

// --- Update Rating on Lesson Completion ---
async function updateStudentRating(studentId, lessonId, score, totalPoints, timeTaken, streak) {
    try {
        // Get current rating
        const { data: currentRating, error: ratingError } = await supabase
            .from('ratings')
            .select('*')
            .eq('student_id', studentId)
            .single();

        if (ratingError && ratingError.code !== 'PGRST116') throw ratingError;

        const previousRating = currentRating?.rating || 1500; // Default starting rating
        const performance = score / totalPoints;
        
        // Calculate new rating
        const ratingChange = calculateRatingChange(previousRating, performance, timeTaken, streak);
        const newRating = previousRating + ratingChange;

        // Update or insert rating
        const { error: upsertError } = await supabase
            .from('ratings')
            .upsert({
                student_id: studentId,
                rating: newRating,
                last_updated: new Date().toISOString()
            });

        if (upsertError) throw upsertError;

        // Record rating history
        const { error: historyError } = await supabase
            .from('rating_history')
            .insert({
                student_id: studentId,
                lesson_id: lessonId,
                previous_rating: previousRating,
                rating_change: ratingChange,
                new_rating: newRating,
                performance: performance,
                time_taken: timeTaken,
                streak: streak,
                timestamp: new Date().toISOString()
            });

        if (historyError) throw historyError;

        return { newRating, ratingChange };
    } catch (error) {
        console.error('Error updating student rating:', error);
        throw error;
    }
}

app.post('/api/ratings/update', requireAuth, async (req, res) => {
    try {
        const { lessonId, score, totalPoints, timeTaken, streak } = req.body;
        const studentId = req.session.studentId;

        if (!studentId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Get current rating
        const { data: currentRating, error: ratingError } = await supabase
            .from('ratings')
            .select('*')
            .eq('student_id', studentId)
            .single();

        if (ratingError && ratingError.code !== 'PGRST116') throw ratingError;

        const previousRating = currentRating?.rating || 1500; // Default starting rating
        const performance = score / totalPoints;
        
        // Calculate new rating
        const ratingChange = calculateRatingChange(previousRating, performance, timeTaken, streak);
        const newRating = previousRating + ratingChange;

        // Update or insert rating
        const { error: upsertError } = await supabase
            .from('ratings')
            .upsert({
                student_id: studentId,
                rating: newRating,
                last_updated: new Date().toISOString()
            });

        if (upsertError) throw upsertError;

        // Record rating history
        const { error: historyError } = await supabase
            .from('rating_history')
            .insert({
                student_id: studentId,
                lesson_id: lessonId,
                previous_rating: previousRating,
                rating_change: ratingChange,
                new_rating: newRating,
                performance: performance,
                time_taken: timeTaken,
                streak: streak,
                timestamp: new Date().toISOString()
            });

        if (historyError) throw historyError;

        res.json({ 
            success: true,
            ratingChange,
            newRating,
            previousRating
        });

    } catch (error) {
        console.error('Error updating rating:', error);
        res.status(500).json({ error: 'Failed to update rating' });
    }
});

// --- ADDED API Endpoint for Profile Data --- 
app.get('/api/profile/:studentId', async (req, res) => {
    const requestedStudentId = req.params.studentId;
    // Optional: Check if viewing user is allowed to see this profile
    // const viewingUserId = req.session.studentId;
    // if (!viewingUserId) { return res.status(401).json({ error: 'Authentication required' }); }
    // Add logic here if profiles are not public

    try {
        // 1. Fetch Student Info
        const { data: student, error: studentError } = await supabase
            .from('students')
            .select('id, full_name, created_at') // Select needed fields
            .eq('id', requestedStudentId)
            .maybeSingle(); // Use maybeSingle in case ID doesn't exist

        if (studentError) throw studentError;
        if (!student) return res.status(404).json({ error: 'Student not found' });

        // 2. Fetch Current Rating
        const { data: rating, error: ratingError } = await supabase
            .from('ratings')
            .select('rating')
            .eq('student_id', requestedStudentId)
            .maybeSingle();
            
        if (ratingError) {
            console.warn(`Could not fetch rating for student ${requestedStudentId}:`, ratingError.message);
            // Don't fail the request, rating might not exist yet
        }

        // 3. Fetch Rating History (Join with lessons to get titles)
        const { data: ratingHistory, error: historyError } = await supabase
            .from('rating_history')
            .select(`
                *,
                lessons ( title )
            `)
            .eq('student_id', requestedStudentId)
            .order('timestamp', { ascending: false })
            .limit(20); // Limit history entries shown
            
        if (historyError) {
             console.error(`Error fetching rating history for student ${requestedStudentId}:`, historyError);
             // Don't necessarily fail the request, just might not show history
             // throw historyError; 
        }
        
        // Format history to include lesson title directly
        const formattedHistory = ratingHistory?.map(item => ({
            ...item,
            lesson_title: item.lessons?.title // Flatten the structure
        })) || [];

        // 4. Combine and Send Response
        res.json({
            student: student,
            rating: rating, // Send rating object (might be null)
            ratingHistory: formattedHistory // Send formatted history (might be empty array)
        });

    } catch (error) {
        console.error(`Error fetching profile data for student ${requestedStudentId}:`, error);
        res.status(500).json({ error: 'Failed to fetch profile data', details: error.message });
    }
});

module.exports = app;