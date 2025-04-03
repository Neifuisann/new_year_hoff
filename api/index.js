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

app.use(cookieParser());
app.use(bodyParser.json({ limit: '50mb', extended: true }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }));
app.use(express.static('public', { charset: 'utf-8' }));
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true
}));

// Admin credentials
const adminCredentials = {
    username: 'admin',
    // This should be properly hashed in production
    password: '$2b$10$R4tMQGVYYReQayD82yx.6.E/4bE.0Ue.vmmWT6t1ggXrJFA3wUCqu' // Use bcrypt to generate this
};

// Middleware to protect admin routes
const requireAuth = (req, res, next) => {
    if (req.session.isAuthenticated) {
        next();
    } else {
        res.redirect('/admin/login');
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

// Add the middleware to the app
app.use(requireStudentInfo);

// Routes
app.get('/', (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'landing.html')));
app.get('/lythuyet', (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'gallery.html')));
app.get('/multiplechoice', (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'index.html')));
app.get('/quizgame', (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'quizgame.html')));
app.get('/truefalse', (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'index.html'))); // Reusing index.html for now
app.get('/admin', requireAuth, (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'admin-list.html')));
app.get('/admin/new', requireAuth, (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'admin-edit.html')));
app.get('/admin/edit/:id', requireAuth, (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'admin-edit.html')));
app.get('/admin/configure', requireAuth, (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'admin-configure.html')));
app.get('/admin/configure/:id', requireAuth, (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'admin-configure.html')));
app.get('/admin/login', (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'login.html')));
app.get('/lesson/:id', (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'lesson.html')));
app.get('/result', (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'result.html')));
app.get('/result/:id', (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'result.html')));

// Add new route for statistics page
app.get('/admin/statistics/:id', requireAuth, (req, res) => {
    res.sendFile(path.join(process.cwd(), 'views', 'lesson-statistics.html'));
});

// New route added for activity log /history
app.get('/history', requireAuth, (req, res) => {
    res.sendFile(path.join(process.cwd(), 'views', 'history.html'));
});

// Add these routes for quiz management
app.get('/admin/quiz', requireAuth, (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'admin-quiz-edit.html')));

// API Endpoints
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (username === adminCredentials.username &&
        await bcrypt.compare(password, adminCredentials.password)) {
        req.session.isAuthenticated = true;
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
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
            .select('*', { count: 'exact' }); // Get total count matching filters

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

app.post('/api/results', async (req, res) => {
    const newResultData = {
        id: Date.now().toString(),
        lessonId: req.body.lessonId,
        timestamp: new Date().toISOString(),
        questions: req.body.questions,
        score: req.body.score,
        totalPoints: req.body.totalPoints,
        studentInfo: req.body.studentInfo,
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
                studentInfo, 
                lessonId, 
                timestamp, 
                score,
                lessons ( title ) 
            `)
             .order('timestamp', { ascending: false });

        if (error) throw error;
        
        const history = historyData.map(result => ({
            studentName: result.studentInfo?.name || 'Anonymous',
            lessonTitle: result.lessons?.title || 'Chinh phục', 
            submittedAt: result.timestamp,
            score: result.score
        }));
        
        res.json(history);
    } catch (error) {
        console.error('Failed to load history:', error);
        res.status(500).json({ error: 'Failed to load history', details: error.message });
    }
});

app.post('/api/explain', async (req, res) => {
    const API_KEY = "AIzaSyAxJF-5iBBx7gp9RPwrAfF58ERZi69KzCc";
    const { question, userAnswer, correctAnswer } = req.body;
    const timeoutMs = 15000; // 15 second timeout for the API call

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        console.log('Sending request to Gemini API with:', { question, userAnswer, correctAnswer });

        const response = await fetch(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-thinking-exp-01-21:generateContent?key=' + API_KEY,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `Please explain this question step by step in Vietnamese. Please always give facts and if necessary, provide notes:
Question: ${question}
User's answer: ${userAnswer}
Correct answer: ${correctAnswer}`
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.7,
                        topK: 64,
                        topP: 0.95,
                        maxOutputTokens: 8192
                    }
                }, null, 2),
                signal: controller.signal // Add abort signal
            }
        );

        clearTimeout(timeoutId); // Clear the timeout if fetch completes

        if (!response.ok) {
            let errorBody = 'Could not read error body';
            try {
                errorBody = await response.text(); // Try to get error details from Gemini API
            } catch (readError) {
                console.error('Failed to read error body from Gemini API:', readError);
            }
            console.error('Gemini API request failed:', {
                status: response.status,
                statusText: response.statusText,
                body: errorBody
            });
            // Send a more specific error back to the client
            return res.status(response.status || 500).json({ 
                error: 'Gemini API request failed', 
                details: `API responded with status: ${response.status}`,
                apiErrorBody: errorBody // Include API error body if available
            });
        }

        const data = await response.json();
        // It's good practice to log less in production, but keep detailed logs for debugging
        // console.log('Received response from Gemini API:', JSON.stringify(data, null, 2));

        const explanationText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!explanationText) {
            console.error('Invalid API response format:', data);
             // Log the full invalid response for debugging
            return res.status(500).json({ 
                error: 'Invalid response format from API', 
                details: 'Expected text explanation was not found in the response.',
                apiResponse: data // Include the problematic API response
            });
        }
        
        // Ensure UTF-8 encoding - This buffer step might be redundant if headers are set correctly, 
        // but kept for safety. res.json should handle encoding.
        // const buffer = Buffer.from(explanationText, 'utf8');
        // const utf8Text = buffer.toString('utf8');

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json({ explanation: explanationText }); // Send the text directly

    } catch (error) {
        clearTimeout(timeoutId); // Ensure timeout is cleared in case of error
        
        let errorDetails = error.message;
        let statusCode = 500;

        if (error.name === 'AbortError') {
            console.error('Gemini API call timed out after', timeoutMs, 'ms');
            errorDetails = `Gemini API request timed out after ${timeoutMs / 1000} seconds.`;
            statusCode = 504; // Gateway Timeout
        } else {
             console.error('Error in /api/explain endpoint:', error);
        }

        // Ensure a JSON response is always sent on error
        res.status(statusCode).json({
            error: 'Failed to get explanation',
            details: errorDetails,
            // Avoid sending full stack in production for security reasons
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

app.post('/api/ocr', upload.single('image'), async (req, res) => {
    const API_KEY = "AIzaSyAxJF-5iBBx7gp9RPwrAfF58ERZi69KzCc";
    
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }

        console.log('Processing image:', req.file.mimetype, req.file.size, 'bytes');
        const base64Image = req.file.buffer.toString('base64');
        console.log('Base64 length:', base64Image.length);
        
        const requestBody = {
            contents: [{
                parts: [
                    {
                        text: `Extract questions from this image. 
                        Format the response exactly like example example. 
                        You can choose from abcd, truefalse, or number type questions. 
                        Follow the Response example and do not say anything else.
                        Keep the original language of the question content and choices.
                        User Input: 
                        [Image]

                        Response:
                        Question 1: 1 Newton + 1 Newton = ?
                        Type: number
                        Points: 1
                        Answer: 2

                        Question 2: Is it true that we can time travel?
                        Type: truefalse
                        Points: 1
                        A. Nah~ [False]
                        B. In Doraemon only [False]
                        C. Doctor Who only [False]
                        D. Ya boi why not [True]

                        Question 3: Why the apple fall?
                        Type: abcd
                        Points: 1
                        A. Because it want
                        B. Because mother nature want
                        *C. Because Newton
                        D. Because someone knock it down
                        `
                    },
                    {
                        inline_data: {
                            mime_type: req.file.mimetype,
                            data: base64Image
                        }
                    }
                ]
            }]
        };
        
        console.log('Sending request to Gemini API...');
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini API error:', response.status, errorText);
            throw new Error(`Gemini API error: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        console.log('Gemini API Response:', JSON.stringify(data, null, 2));
        
        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
            console.error('Invalid Gemini response structure:', data);
            throw new Error('Invalid response from Gemini API');
        }

        const text = data.candidates[0].content.parts[0].text;
        console.log('Extracted Text:', text);
        
        res.json({ text });
    } catch (error) {
        console.error('Error in /api/ocr:', error);
        res.status(500).json({ 
            error: 'Failed to process image',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

app.get('/api/lessons/:id/statistics', requireAuth, async (req, res) => {
    const lessonId = req.params.id;

    try {
        const { data: lessonResults, error: resultsError } = await supabase
            .from('results')
            .select('*')
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

        const uniqueStudents = new Set(lessonResults.map(r => 
            r.studentInfo?.studentId || r.studentInfo?.name || r.ipAddress
        )).size;
        
        const scores = lessonResults.map(r => {
             const totalPoints = r.totalPoints || 1;
             return (r.score / totalPoints) * 100;
        });
        const averageScore = scores.length ? 
            (scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
        
        const scoreRanges = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
        const distribution = new Array(scoreRanges.length - 1).fill(0);
        
        lessonResults.forEach((result) => {
            const totalPoints = result.totalPoints || 1;
            const scorePercent = (result.score / totalPoints) * 100;
            const normalizedScore = Math.max(0, Math.min(100, scorePercent));
            const rangeIndex = Math.min(Math.floor(normalizedScore / 10), 9);
            distribution[rangeIndex]++;
        });

        const questionStats = {};
        lessonResults.forEach(result => {
            if (Array.isArray(result.questions)) {
                 result.questions.forEach(q => {
                    const questionKey = q.question || `question_${Date.now()}`;
                    if (!questionStats[questionKey]) {
                        questionStats[questionKey] = {
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
                console.warn(`Result ${result.id} has invalid questions format:`, result.questions);
            }
        });
        
        const formattedQuestionStats = Object.entries(questionStats).map(([question, stats]) => ({
            question,
            totalStudents: stats.total,
            completed: stats.completed,
            notCompleted: 0,
            correct: stats.correct,
            incorrect: stats.incorrect
        }));

        const transcripts = lessonResults.map(r => {
             const totalPoints = r.totalPoints || 1;
             return {
                name: r.studentInfo?.name || 'Anonymous',
                dob: r.studentInfo?.dob || 'N/A',
                score: ((r.score / totalPoints) * 100).toFixed(2) + '%',
                timestamp: r.timestamp,
                ip: r.ipAddress || 'N/A'
            };
        });

        res.json({
            uniqueStudents,
            totalAttempts: lessonResults.length,
            averageScore,
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

app.get('/api/check-auth', (req, res) => {
    res.json({ isAuthenticated: !!req.session.isAuthenticated });
});

app.get('/api/gallery-images', (req, res) => {
    const imagesDir = path.join(__dirname, 'public', 'lesson_images');
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

app.get('/api/quiz', async (req, res) => {
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

app.post('/api/quiz/submit', async (req, res) => {
     const resultId = Date.now().toString();
     const newResult = {
         id: resultId,
         timestamp: new Date().toISOString(),
         studentName: req.body.studentName,
         score: req.body.score,
         totalQuestions: req.body.totalQuestions,
         userId: req.body.userId,
         answers: req.body.answers
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

// --- NEW: /api/tags Endpoint ---
app.get('/api/tags', async (req, res) => {
    try {
        // Fetch only the 'tags' column from all lessons
        const { data, error } = await supabase
            .from('lessons')
            .select('tags');

        if (error) throw error;

        // Process the tags data to get a unique, flat list
        const allTags = new Set();
        if (data) {
            data.forEach(lesson => {
                // Ensure lesson.tags is an array and add each tag to the Set
                if (Array.isArray(lesson.tags)) {
                    lesson.tags.forEach(tag => {
                        if (tag && typeof tag === 'string') { // Basic validation
                           allTags.add(tag.trim());
                        }
                    });
                }
            });
        }

        // Convert Set to a sorted array
        const uniqueSortedTags = Array.from(allTags).sort();

        res.json(uniqueSortedTags);

    } catch (error) {
        console.error('Error fetching tags:', error);
        res.status(500).json({ error: 'Failed to fetch tags', details: error.message });
    }
});
// --- END NEW: /api/tags Endpoint ---

// Export the app for Vercel
module.exports = app;