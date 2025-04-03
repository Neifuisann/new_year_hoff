const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcrypt');
const fetch = require('node-fetch');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const upload = multer({ storage: multer.memoryStorage() });
const app = express();
const PORT = process.env.PORT || 3000;
const path = require('path');
const cookieParser = require('cookie-parser');

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://miojaflixmncmhsgyabd.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pb2phZmxpeG1uY21oc2d5YWJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM2NTU0NTUsImV4cCI6MjA1OTIzMTQ1NX0.e3nU5sBvHsFHZP48jg1vjYsP-N2S4AgYuQgt8opHE_g';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Set proper charset for all responses
app.use((req, res, next) => {
    res.charset = 'utf-8';
    next();
});

// Middleware to inject Vercel Analytics
app.use((req, res, next) => {
    const originalSend = res.send;
    
    res.send = function(body) {
        // Only inject analytics into HTML responses
        if (typeof body === 'string' && body.includes('</html>')) {
            // Inject the Vercel Analytics script right before the closing body tag
            body = body.replace('</body>', `<script defer src="/_vercel/insights/script.js"></script></body>`);
        }
        return originalSend.call(this, body);
    };
    
    next();
});

app.use(cookieParser());
app.use(bodyParser.json({ limit: '50mb', extended: true }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }));
app.use(express.static('public', { charset: 'utf-8' }));

// Configure express-session
app.set('trust proxy', 1); // Trust first proxy, crucial for Vercel/Heroku/etc.

app.use(session({
    secret: 'your-secret-key', // Replace with a strong secret in production
    resave: false,
    saveUninitialized: false, // Don't save sessions until something is stored
    cookie: { 
        secure: process.env.NODE_ENV === 'production', // Ensure cookies are sent only over HTTPS in production
        httpOnly: true, // Prevent client-side JS from accessing the cookie
        sameSite: 'lax', // Recommended for most cases to prevent CSRF
        maxAge: 24 * 60 * 60 * 1000 // 1 day
        // Consider setting domain explicitly if needed
        // domain: process.env.NODE_ENV === 'production' ? '.yourdomain.com' : undefined
    },
    proxy: true // Trust the reverse proxy when setting secure cookies (Vercel/Heroku)
}));

// Admin credentials
const adminCredentials = {
    username: 'admin',
    // This should be properly hashed in production
    password: '$2b$10$R4tMQGVYYReQayD82yx.6.E/4bE.0Ue.vmmWT6t1ggXrJFA3wUCqu' // Use bcrypt to generate this
};

// Middleware to protect admin routes
const requireAuth = (req, res, next) => {
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
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            // For API requests, return JSON response
            return res.status(401).json({ error: 'Authentication required' });
        }
        // For browser requests, redirect to login
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
app.get('/history', requireAuth, (req, res) => {
    res.sendFile(path.join(process.cwd(), 'views', 'history.html'));
});
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
            .select('id, full_name, password, is_approved, approved_device_fingerprint')
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
        
        // Verify password
        const passwordMatch = await bcrypt.compare(password, student.password);
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
        const limit = parseInt(req.query.limit) || 10; // Default to 10 items per page
        const search = req.query.search || '';
        const sort = req.query.sort || 'order'; // Default sort by 'order' (was newest)
        
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit - 1;

        // --- Build Supabase Query ---
        let query = supabase
            .from('lessons')
            .select('id, title, color, created, lastUpdated, views, order, subject, grade, tags, description, purpose, pricing, lessonImage, randomQuestions', { count: 'exact' }); // Explicitly select fields, excluding 'questions'

        // Apply Search Filter (if provided)
        if (search) {
            // Search in title OR tags array
            // Using .or() with ilike for title and contains for tags array
            // Adjust column names ('title', 'tags') if they are different in your DB
            query = query.or(`title.ilike.%${search}%,tags.cs.{${search}}`); 
            // Note: `tags.cs.{${search}}` checks if the tags array contains the search term.
            // This assumes tags are stored as a text array e.g., {'math', 'easy'}
            // If tags are stored differently (e.g., JSONB), the query needs adjustment.
        }
        
        // Apply Sorting
        let orderAscending = true;
        let orderColumn = 'order'; // Default to manual order

        switch (sort) {
            case 'newest':
                orderColumn = 'created'; // Assuming you have a 'created' timestamp
                orderAscending = false;
                break;
            case 'oldest':
                orderColumn = 'created'; 
                orderAscending = true;
                break;
            case 'az':
                orderColumn = 'title';
                orderAscending = true;
                break;
            case 'za':
                orderColumn = 'title';
                orderAscending = false;
                break;
            case 'newest-changed':
                orderColumn = 'lastUpdated'; // Assuming you have 'lastUpdated'
                orderAscending = false;
                break;
            case 'popular':
                orderColumn = 'views'; // Assuming you have 'views'
                orderAscending = false;
                break;
             case 'order': // Explicitly handle the default order
                 orderColumn = 'order';
                 orderAscending = true;
                 break;
            // Add other sort cases if needed
        }
        query = query.order(orderColumn, { ascending: orderAscending });

        // Apply Pagination
        query = query.range(startIndex, endIndex);

        // --- Execute Query ---
        const { data: lessons, error, count } = await query;

        if (error) throw error;

        // --- Return Paginated Response ---
        res.json({
            lessons: lessons || [],
            total: count || 0,
            page: page,
            limit: limit
        });

    } catch (error) {
        console.error('Error fetching lessons:', error);
        res.status(500).json({ error: 'Failed to fetch lessons', details: error.message });
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

        const currentViews = lesson.views || 0;
        const { error: updateError } = await supabase
            .from('lessons')
            .update({ views: currentViews + 1 })
            .eq('id', lessonId);

        if (updateError) {
            console.warn('Failed to update view count for lesson', lessonId, updateError);
        }

        res.json(lesson);
    } catch (error) {
        console.error(`Error fetching lesson ${lessonId}:`, error);
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
        res.json(result);
    } catch (error) {
        console.error(`Error fetching result ${resultId}:`, error);
        res.status(500).json({ error: 'Failed to fetch result', details: error.message });
    }
});

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
        
        res.json(history);
    } catch (error) {
        console.error('Failed to load history:', error);
        res.status(500).json({ error: 'Failed to load history', details: error.message });
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
        const { data: lessonResults, error: resultsError } = await supabase
            .from('results')
            .select(`
                *, 
                students ( full_name ) 
            `)
            .eq('lessonId', lessonId);
            
        if (resultsError) throw resultsError;
        
        if (!lessonResults || lessonResults.length === 0) {
            return res.json({
                uniqueStudents: 0,
                totalAttempts: 0,
                averageScore: 0,
                lowScores: 0,
                highScores: 0,
                scoreDistribution: { labels: [], data: [] },
                questionStats: [],
                transcripts: []
            });
        }

        const uniqueStudents = new Set(lessonResults.map(r => r.student_id)).size;
        
        const scores = lessonResults.map(r => {
             const totalPoints = r.totalPoints || 1;
             const studentScore = typeof r.score === 'number' ? r.score : 0;
             return totalPoints > 0 ? (studentScore / totalPoints) * 100 : 0;
        });
        const averageScore = scores.length ? 
            (scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
        
        const scoreRanges = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
        const distribution = new Array(scoreRanges.length - 1).fill(0);
        
        lessonResults.forEach((result) => {
            const totalPoints = result.totalPoints || 1;
            const studentScore = typeof result.score === 'number' ? result.score : 0;
            const scorePercent = totalPoints > 0 ? (studentScore / totalPoints) * 100 : 0;
            const normalizedScore = Math.max(0, Math.min(100, scorePercent));
            const rangeIndex = normalizedScore === 100 ? 9 : Math.floor(normalizedScore / 10);
            if (rangeIndex >= 0 && rangeIndex < distribution.length) {
            distribution[rangeIndex]++;
            } else {
                console.warn(`Calculated invalid range index ${rangeIndex} for score ${normalizedScore}`);
            }
        });

        const questionStats = {};
        lessonResults.forEach(result => {
            if (Array.isArray(result.questions)) {
                 result.questions.forEach(q => {
                    const questionKey = q.question || `question_${q.originalIndex || Date.now()}`;
                    if (!questionStats[questionKey]) {
                        questionStats[questionKey] = {
                            questionText: q.question,
                            total: 0,
                            completed: 0,
                            correct: 0,
                            incorrect: 0
                        };
                    }
                    questionStats[questionKey].total++;
                    questionStats[questionKey].completed++;
                    if (q.isCorrect) {
                        questionStats[questionKey].correct++;
                    } else {
                        questionStats[questionKey].incorrect++;
                    }
                });
            } else {
                console.warn(`Result ${result.id || 'N/A'} has invalid questions format:`, result.questions);
            }
        });
        
        const formattedQuestionStats = Object.values(questionStats).map((stats) => ({
            question: stats.questionText,
            totalStudents: stats.total,
            completed: stats.completed,
            notCompleted: 0,
            correct: stats.correct,
            incorrect: stats.incorrect,
            accuracy: stats.completed > 0 ? ((stats.correct / stats.completed) * 100).toFixed(1) + '%' : 'N/A'
        }));

        const transcripts = lessonResults.map(r => {
             const totalPoints = r.totalPoints || 1;
             const studentScore = typeof r.score === 'number' ? r.score : 0;
             return {
                name: r.students?.full_name || 'Unknown Student',
                score: totalPoints > 0 ? ((studentScore / totalPoints) * 100).toFixed(1) + '%' : '0.0%',
                timestamp: r.timestamp,
                ip: r.ipAddress || 'N/A'
            };
        });

        res.json({
            uniqueStudents,
            totalAttempts: lessonResults.length,
            averageScore: averageScore.toFixed(1),
            lowScores: scores.filter(s => s < 50).length,
            highScores: scores.filter(s => s >= 50).length,
            scoreDistribution: {
                labels: scoreRanges.slice(0, -1).map((n, i) => 
                    i === 9 ? '90-100%' : `${n}-${n+9}%`
                ),
                data: distribution
            },
            questionStats: formattedQuestionStats,
            transcripts: transcripts
        });

    } catch (error) {
        console.error(`Error fetching statistics for lesson ${lessonId}:`, error);
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

app.get('/api/gallery-images', (req, res) => {
    const imagesDir = path.join(__dirname, '..', 'public', 'lesson_images');
    try {
        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
        }
        const files = fs.readdirSync(imagesDir)
            .filter(file => /\.(jpg|jpeg|png|gif)$/i.test(file))
            .map(file => `/lesson_images/${file}`);
        res.json(files);
    } catch (error) {
        console.error('Error reading gallery images:', error);
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
        
        if (!quizConfig || !quizConfig.quiz_data) {
             return res.json({ questions: [] });
        }

        res.json(quizConfig.quiz_data);
    } catch (error) {
        console.error('Error loading quiz data:', error);
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

        res.json(uniqueSortedTags);

    } catch (error) {
        console.error('Error fetching tags:', error);
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
        res.json(data || []);
    } catch (error) {
        console.error('Error fetching unapproved students:', error);
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
        res.json(data || []);
    } catch (error) {
        console.error('Error fetching approved students:', error);
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

module.exports = app;