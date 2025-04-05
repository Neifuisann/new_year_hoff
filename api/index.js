const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const session = require('express-session');
const bcrypt = require('bcrypt');
const fetch = require('node-fetch');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const { inject } = require('@vercel/analytics');
const upload = multer({ storage: multer.memoryStorage() });
const { Pool } = require('pg');
const pgSession = require('connect-pg-simple')(session);
const app = express();
const PORT = process.env.PORT || 3000;
const path = require('path');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

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

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://miojaflixmncmhsgyabd.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pb2phZmxpeG1uY21oc2d5YWJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM2NTU0NTUsImV4cCI6MjA1OTIzMTQ1NX0.e3nU5sBvHsFHZP48jg1vjYsP-N2S4AgYuQgt8opHE_g';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

// --- Cache Helper Functions ---
function generateETag(data) {
  if (!data) {
    return null; // Or a default ETag for empty data
  }
  // Use JSON.stringify for consistent serialization of JS objects/arrays
  // Sort keys for objects to ensure consistent hashing regardless of key order
  const dataString = JSON.stringify(data, (key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value)
        .sort()
        .reduce((sorted, key) => {
          sorted[key] = value[key];
          return sorted;
        }, {});
    }
    return value;
  });
  // Create a SHA1 hash - strong enough for ETag, reasonably fast
  return crypto.createHash('sha1').update(dataString).digest('hex');
}

function setCacheHeaders(res, etag, maxAgeSeconds = 60) { // Default cache: 1 minute
  if (etag) {
    // ETags should be quoted as per HTTP spec
    res.setHeader('ETag', `"${etag}"`); 
  }
  // Cache-Control: public (allow proxies), max-age (duration), must-revalidate (check ETag before using stale cache)
  res.setHeader('Cache-Control', `public, max-age=${maxAgeSeconds}, must-revalidate`);
  // Optionally add Last-Modified if you have a relevant timestamp for the data
  // res.setHeader('Last-Modified', new Date(data.lastUpdated).toUTCString());
}
// --- End Cache Helper Functions ---

// Admin credentials
const adminCredentials = {
    username: 'admin',
    // This should be properly hashed in production
    password: '$2b$10$R4tMQGVYYReQayD82yx.6.E/4bE.0Ue.vmmWT6t1ggXrJFA3wUCqu' // Use bcrypt to generate this
};

// Middleware to protect admin routes
const requireAuth = (req, res, next) => {
    // ADD THIS LOG: Log the entire session object as seen by this middleware
    console.log('requireAuth - Full Session Object:', JSON.stringify(req.session)); 

    console.log('Auth check - Session:', { 
        isAuthenticated: req.session.isAuthenticated,
        hasSession: !!req.session,
        sessionID: req.sessionID
    });
    
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
    console.log('Student Auth check - Session:', { 
        studentId: req.session.studentId,
        hasSession: !!req.session,
        sessionID: req.sessionID
    });

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

// API Endpoints
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    console.log('Admin login attempt:', { username });
    
    try {
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing username or password' 
            });
        }
        
        const credentialsMatch = username === adminCredentials.username &&
            await bcrypt.compare(password, adminCredentials.password);
            
        if (credentialsMatch) {
            // Set authentication in session
        req.session.isAuthenticated = true;
            
            // Clear any student-related session data
            delete req.session.studentId;
            delete req.session.studentName;
            
            // Save session explicitly to ensure it's stored
            req.session.save(err => {
                if (err) {
                    console.error('Session save error:', err);
                    return res.status(500).json({ 
                        success: false, 
                        message: 'Session error' 
                    });
                }
                
                console.log('Admin login successful');
                return res.json({ 
                    success: true,
                    message: 'Login successful'
                });
            });
    } else {
            console.log('Admin login failed: invalid credentials');
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid credentials'
            });
        }
    } catch (error) {
        console.error('Admin login error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Internal server error'
        });
    }
});

// Student registration endpoint
app.post('/api/register', async (req, res) => {
    const { full_name, date_of_birth, phone_number, password } = req.body;
    
    if (!full_name || !phone_number || !password) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    
    try {
        // Check if phone number is already registered
        const { data: existingUser, error: checkError } = await supabase
            .from('students')
            .select('id')
            .eq('phone_number', phone_number)
            .maybeSingle();
            
        if (checkError) {
            console.error('Error checking for existing user:', checkError);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
        
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: 'Số điện thoại này đã được đăng ký. Vui lòng sử dụng số điện thoại khác.' 
            });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create new student record
        const { data: newStudent, error: insertError } = await supabase
            .from('students')
            .insert({
                full_name,
                phone_number,
                date_of_birth,
                password_hash: hashedPassword,
                is_approved: false,
                created_at: new Date().toISOString()
            })
            .select('id')
            .single();
        
        if (insertError) {
            console.error('Error inserting new student:', insertError);
            return res.status(500).json({ success: false, message: 'Failed to create account' });
        }
        
        res.json({ 
            success: true, 
            message: 'Registration successful! Please wait for admin approval.'
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Student login endpoint
app.post('/api/student/login', async (req, res) => {
    const { phone_number, password, device_fingerprint } = req.body;
    
    if (!phone_number || !password) {
        return res.status(400).json({ success: false, message: 'Missing phone number or password' });
    }
    
    try {
        // Check if student exists and is approved
        const { data: student, error: fetchError } = await supabase
            .from('students')
            .select('id, full_name, password_hash, is_approved, approved_device_fingerprint')
            .eq('phone_number', phone_number)
            .maybeSingle();
            
        if (fetchError) {
            console.error('Error fetching student:', fetchError);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
        
        if (!student) {
            return res.status(401).json({ 
                success: false, 
                message: 'Tài khoản không tồn tại.' 
            });
        }
        
        if (!student.is_approved) {
            return res.status(401).json({ 
                success: false, 
                message: 'Tài khoản của bạn đang chờ được giáo viên phê duyệt.' 
            });
        }
        
        // Verify password using the correct hash field
        const passwordMatch = await bcrypt.compare(password, student.password_hash);
        if (!passwordMatch) {
            return res.status(401).json({ 
                success: false, 
                message: 'Mật khẩu không chính xác.' 
            });
        }
        
        // Check device fingerprint if already set
        if (student.approved_device_fingerprint && 
            student.approved_device_fingerprint !== device_fingerprint) {
            return res.status(401).json({ 
                success: false, 
                message: 'Bạn chỉ có thể đăng nhập từ thiết bị đã đăng ký trước đó.' 
            });
        }
        
        // If first login, store the device fingerprint
        if (device_fingerprint && !student.approved_device_fingerprint) {
            const { error: updateError } = await supabase
                .from('students')
                .update({ approved_device_fingerprint: device_fingerprint })
                .eq('id', student.id);
                
            if (updateError) {
                console.error('Error updating device fingerprint:', updateError);
                // Continue anyway - this is not fatal
            }
        }
        
        // Set session
        req.session.studentId = student.id;
        req.session.studentName = student.full_name;
        
        res.json({ 
            success: true, 
            message: 'Đăng nhập thành công!',
            student: { 
                id: student.id, 
                name: student.full_name 
            }
        });
    } catch (error) {
        console.error('Student login error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Student logout endpoint
app.post('/api/student/logout', (req, res) => {
    try {
        // Clear student session
        delete req.session.studentId;
        delete req.session.studentName;
        
        res.json({ success: true, message: 'Đăng xuất thành công' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Admin logout endpoint
app.post('/api/admin/logout', (req, res) => {
    try {
        req.session.destroy(err => {
            if (err) {
                console.error('Admin logout error - session destroy failed:', err);
                return res.status(500).json({ success: false, message: 'Logout failed' });
            }
            // Clear the cookie on the client side
            res.clearCookie('connect.sid'); // Use your session cookie name if different
            console.log('Admin logout successful');
            return res.json({ success: true, message: 'Admin logout successful' });
        });
    } catch (error) {
        console.error('Admin logout error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

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
        
        // --- Caching Logic --- 
        const responsePayload = {
            lessons: lessons,
            total: total,
            page: page,
            limit: limit,
            // Include search and sort parameters in ETag calculation for uniqueness
            search: search,
            sort: sort
        };
        const etag = generateETag(responsePayload);

        // Check If-None-Match header from the client
        const clientETag = req.headers['if-none-match'];
        if (clientETag && clientETag === `"${etag}"`) { // Compare quoted ETag
            console.log('Cache hit for /api/lessons');
            return res.status(304).send(); // Not Modified
        }

        // If no match or no client ETag, set headers and send response
        console.log('Cache miss for /api/lessons');
        setCacheHeaders(res, etag, 60 * 5); // Cache for 5 minutes
        res.json(responsePayload);
        // --- End Caching Logic --- 

    } catch (error) {
        console.error('Error fetching lessons:', error);
        const errorDetails = error.details || error.message || 'Unknown error';
        // Ensure status is set correctly even for caught errors
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

        // --- Caching Logic ---
        const etag = generateETag(lesson); // ETag based on the lesson data
        const clientETag = req.headers['if-none-match'];

        if (clientETag && clientETag === `"${etag}"`) {
            console.log(`Cache hit for /api/lessons/${lessonId}`);
            // Send 304 without updating views if cache is valid
            return res.status(304).send();
        }

        console.log(`Cache miss for /api/lessons/${lessonId}`);
        // Set cache headers *before* potentially modifying the data (views)
        // Cache for a slightly longer duration? e.g., 10 minutes
        setCacheHeaders(res, etag, 60 * 10);
        // --- End Caching Logic ---

        // Update view count only on cache miss (when sending full data)
        const currentViews = lesson.views || 0;
        const { error: updateError } = await supabase
            .from('lessons')
            .update({ views: currentViews + 1 })
            .eq('id', lessonId);

        if (updateError) {
            // Log warning but don't fail the request just because view count update failed
            console.warn('Failed to update view count for lesson', lessonId, updateError);
        }

        // Send the full lesson data
        res.json(lesson);

    } catch (error) {
        console.error(`Error fetching lesson ${lessonId}:`, error);
        // Avoid sending cache headers on error
        res.removeHeader('ETag');
        res.removeHeader('Cache-Control');
        res.removeHeader('Last-Modified'); // If you added Last-Modified
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

    const newResultData = {
        id: Date.now().toString(),
        lessonId: req.body.lessonId,
        timestamp: now,
        questions: req.body.questions,
        score: req.body.score,
        totalPoints: req.body.totalPoints,
        student_id: studentIdFromSession,
        ipAddress: req.body.ipAddress
    };

    try {
        const { data, error } = await supabase
            .from('results')
            .insert(newResultData)
            .select('id')
            .single();

        if (error) throw error;
        res.json({ success: true, resultId: data.id });
    } catch (error) {
        console.error('Error saving result:', error);
        res.status(500).json({ error: 'Failed to save result', details: error.message });
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
        
        // --- Caching Logic ---
        // Results are typically immutable once submitted, so cache aggressively
        const etag = generateETag(result);
        const clientETag = req.headers['if-none-match'];

        if (clientETag && clientETag === `"${etag}"`) {
            console.log(`Cache hit for /api/results/${resultId}`);
            return res.status(304).send();
        }
        
        console.log(`Cache miss for /api/results/${resultId}`);
        // Cache for a long duration, e.g., 1 day, as results don't change
        setCacheHeaders(res, etag, 60 * 60 * 24); 
        // --- End Caching Logic ---

        res.json(result);
    } catch (error) {
        console.error(`Error fetching result ${resultId}:`, error);
        res.removeHeader('ETag');
        res.removeHeader('Cache-Control');
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
            const formattedQuestionStats = Object.values(questionStats).map((stats) => ({/* ... */ accuracy: stats.completed > 0 ? ((stats.correct / stats.completed) * 100).toFixed(1) + '%' : 'N/A' }));
            const transcripts = lessonResults.map(r => ({/* ... */ score: ((typeof r.score === 'number' ? r.score : 0) / (r.totalPoints || 1) * 100).toFixed(1) + '%' }));

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
        
        // --- Caching Logic ---
        // Include lesson's lastUpdated time in ETag if available, to bust cache when lesson changes
        // Also include results data for accuracy
        const cacheData = { stats: statsPayload, lessonLastUpdated: lessonData?.lastUpdated }; 
        const etag = generateETag(cacheData);
        const clientETag = req.headers['if-none-match'];

        if (clientETag && clientETag === `"${etag}"`) {
            console.log(`Cache hit for /api/lessons/${lessonId}/statistics`);
            return res.status(304).send();
        }
        
        console.log(`Cache miss for /api/lessons/${lessonId}/statistics`);
        // Cache statistics for a moderate duration, e.g., 5 minutes
        setCacheHeaders(res, etag, 60 * 5); 
        // --- End Caching Logic ---

        res.json(statsPayload);

    } catch (error) {
        console.error(`Error fetching statistics for lesson ${lessonId}:`, error);
        res.removeHeader('ETag');
        res.removeHeader('Cache-Control');
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
            
        // --- Caching Logic ---
        const etag = generateETag(files);
        const clientETag = req.headers['if-none-match'];

        if (clientETag && clientETag === `"${etag}"`) {
            console.log('Cache hit for /api/gallery-images');
            return res.status(304).send();
        }
        
        console.log('Cache miss for /api/gallery-images');
        // Cache gallery images list for a reasonable time, e.g., 10 minutes
        setCacheHeaders(res, etag, 60 * 10);
        // --- End Caching Logic ---

        res.json(files);
    } catch (error) {
        console.error('Error reading gallery images:', error);
        res.removeHeader('ETag');
        res.removeHeader('Cache-Control');
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

        // --- Caching Logic ---
        const etag = generateETag(quizData);
        const clientETag = req.headers['if-none-match'];

        if (clientETag && clientETag === `"${etag}"`) {
            console.log('Cache hit for /api/quiz');
            return res.status(304).send();
        }
        
        console.log('Cache miss for /api/quiz');
        // Cache quiz data for a moderate duration, e.g., 30 minutes
        setCacheHeaders(res, etag, 60 * 30); 
        // --- End Caching Logic ---

        res.json(quizData);

    } catch (error) {
        console.error('Error loading quiz data:', error);
        // Avoid sending cache headers on error
        res.removeHeader('ETag');
        res.removeHeader('Cache-Control');
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

        // --- Caching Logic ---
        const etag = generateETag(uniqueSortedTags);
        const clientETag = req.headers['if-none-match'];

        if (clientETag && clientETag === `"${etag}"`) {
            console.log('Cache hit for /api/tags');
            return res.status(304).send();
        }

        console.log('Cache miss for /api/tags');
        setCacheHeaders(res, etag, 60 * 15); // Cache tags for 15 minutes
        // --- End Caching Logic ---

        res.json(uniqueSortedTags);

    } catch (error) {
        console.error('Error fetching tags:', error);
        // Avoid sending cache headers on error
        res.removeHeader('ETag');
        res.removeHeader('Cache-Control');
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
        
        // --- Caching Logic ---
        const etag = generateETag(studentsData);
        const clientETag = req.headers['if-none-match'];

        if (clientETag && clientETag === `"${etag}"`) {
            console.log('Cache hit for /api/admin/unapproved-students');
            return res.status(304).send();
        }
        
        console.log('Cache miss for /api/admin/unapproved-students');
        // Cache for a short duration as this list might change frequently
        setCacheHeaders(res, etag, 60 * 1); // 1 minute cache
        // --- End Caching Logic ---
        
        res.json(studentsData);
    } catch (error) {
        console.error('Error fetching unapproved students:', error);
        res.removeHeader('ETag');
        res.removeHeader('Cache-Control');
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
        
        // --- Caching Logic ---
        const etag = generateETag(studentsData);
        const clientETag = req.headers['if-none-match'];

        if (clientETag && clientETag === `"${etag}"`) {
            console.log('Cache hit for /api/admin/approved-students');
            return res.status(304).send();
        }
        
        console.log('Cache miss for /api/admin/approved-students');
        // Cache for a moderate duration, e.g., 5 minutes
        setCacheHeaders(res, etag, 60 * 5);
        // --- End Caching Logic ---
        
        res.json(studentsData);
    } catch (error) {
        console.error('Error fetching approved students:', error);
        res.removeHeader('ETag');
        res.removeHeader('Cache-Control');
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

// This is the correct endpoint to apply caching to
app.get('/api/history', requireAuth, async (req, res) => {
    try {
        const { data: historyData, error } = await supabase
            .from('results')
            .select(`
                id, 
                student_id, 
                timestamp, 
                score,
                totalPoints,
                lessonId, 
                students ( full_name ), 
                lessons ( title ) 
            `)
             .order('timestamp', { ascending: false });

        if (error) throw error;
        
        const history = historyData.map(result => ({
            resultId: result.id,
            studentName: result.students?.full_name || 'Unknown Student',
            lessonTitle: result.lessons?.title || (result.lessonId === 'quiz_game' ? 'Trò chơi chinh phục' : 'Unknown Lesson'),
            submittedAt: result.timestamp,
            score: result.score,
            totalPoints: result.totalPoints,
            scorePercentage: result.totalPoints ? ((result.score / result.totalPoints) * 100).toFixed(1) + '%' : 'N/A'
        }));
        
        // --- Caching Logic ---
        const etag = generateETag(history);
        const clientETag = req.headers['if-none-match'];

        if (clientETag && clientETag === `"${etag}"`) {
            console.log('Cache hit for /api/history');
            return res.status(304).send();
        }
        
        console.log('Cache miss for /api/history');
        // Cache history for a short duration, e.g., 1 minute
        setCacheHeaders(res, etag, 60 * 1); 
        // --- End Caching Logic ---
        
        res.json(history);
    } catch (error) {
        console.error('Failed to load history:', error);
        res.removeHeader('ETag');
        res.removeHeader('Cache-Control');
        res.status(500).json({ error: 'Failed to load history', details: error.message });
    }
});

module.exports = app;