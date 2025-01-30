const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcrypt');
const fetch = require('node-fetch');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const app = express();
const PORT = 3000;

// Set proper charset for all responses
app.use((req, res, next) => {
    res.charset = 'utf-8';
    next();
});

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
        res.redirect('/login');
    }
};

// Routes
app.get('/', (req, res) => res.sendFile(__dirname + '/views/index.html'));
app.get('/admin', requireAuth, (req, res) => res.sendFile(__dirname + '/views/admin-list.html'));
app.get('/admin/new', requireAuth, (req, res) => res.sendFile(__dirname + '/views/admin-edit.html'));
app.get('/admin/edit/:id', requireAuth, (req, res) => res.sendFile(__dirname + '/views/admin-edit.html'));
app.get('/admin/login', (req, res) => res.sendFile(__dirname + '/views/login.html'));
app.get('/lesson/:id', (req, res) => res.sendFile(__dirname + '/views/lesson.html'));
app.get('/result', (req, res) => res.sendFile(__dirname + '/views/result.html'));
app.get('/result/:id', (req, res) => res.sendFile(__dirname + '/views/result.html'));

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

app.get('/api/lessons', (req, res) => {
    const lessons = JSON.parse(fs.readFileSync('./data/lessons.json'));
    res.json(lessons);
});

app.get('/api/lessons/:id', (req, res) => {
    const lessons = JSON.parse(fs.readFileSync('./data/lessons.json'));
    const lessonIndex = lessons.findIndex(l => l.id == req.params.id);
    
    if (lessonIndex === -1) {
        return res.status(404).json({ error: 'Lesson not found' });
    }

    // Update views counter
    lessons[lessonIndex].views = (lessons[lessonIndex].views || 0) + 1;
    fs.writeFileSync('./data/lessons.json', JSON.stringify(lessons, null, 2));
    
    res.json(lessons[lessonIndex]);
});

app.post('/api/lessons', requireAuth, (req, res) => {
    const newLesson = {
        ...req.body,
        id: Date.now().toString(),
        views: 0,
        lastUpdated: new Date().toISOString(),
        created: new Date().toISOString()
    };
    
    const lessons = JSON.parse(fs.readFileSync('./data/lessons.json'));
    lessons.push(newLesson);
    fs.writeFileSync('./data/lessons.json', JSON.stringify(lessons, null, 2));
    res.json({ success: true });
});

app.delete('/api/lessons/:id', requireAuth, (req, res) => {
    const lessons = JSON.parse(fs.readFileSync('./data/lessons.json'));
    const filtered = lessons.filter(l => l.id != req.params.id);
    fs.writeFileSync('./data/lessons.json', JSON.stringify(filtered, null, 2));
    res.json({ success: true });
});

app.put('/api/lessons/:id', requireAuth, (req, res) => {
    const lessons = JSON.parse(fs.readFileSync('./data/lessons.json'));
    const index = lessons.findIndex(l => l.id == req.params.id);
    
    if (index === -1) {
        return res.status(404).json({ error: 'Lesson not found' });
    }

    lessons[index] = {
        ...lessons[index],
        ...req.body,
        lastUpdated: new Date().toISOString()
    };
    
    fs.writeFileSync('./data/lessons.json', JSON.stringify(lessons, null, 2));
    res.json({ success: true });
});

app.post('/api/lessons/reorder', requireAuth, (req, res) => {
    const newOrder = req.body;
    fs.writeFileSync('./data/lessons.json', JSON.stringify(newOrder, null, 2));
    res.json({ success: true });
});

// Result endpoints
app.post('/api/results', (req, res) => {
    const results = JSON.parse(fs.readFileSync('./data/results.json'));
    const newResult = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        questions: req.body.questions,
        score: req.body.score,
        totalPoints: req.body.totalPoints
    };
    results.push(newResult);
    fs.writeFileSync('./data/results.json', JSON.stringify(results, null, 2));
    res.json({ success: true, resultId: newResult.id });
});

app.get('/api/results/:id', (req, res) => {
    const results = JSON.parse(fs.readFileSync('./data/results.json'));
    const result = results.find(r => r.id === req.params.id);
    if (result) {
        res.json(result);
    } else {
        res.status(404).json({ error: 'Result not found' });
    }
});

app.post('/api/explain', async (req, res) => {
    const API_KEY = "AIzaSyCK_5q_4qsHQqt29ZIAVGV12W2MbHIvQSg";
    const { question, userAnswer, correctAnswer } = req.body;
    
    try {
        console.log('Sending request to Gemini API with:', { question, userAnswer, correctAnswer });
        
        const response = await fetch(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=' + API_KEY,
            {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json; charset=utf-8',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `Please explain this question step by step in Vietnamese. Please always give facts and if necessary, provide notes:\nQuestion: ${question}\nUser's answer: ${userAnswer}\nCorrect answer: ${correctAnswer}`
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.7,
                        topK: 64,
                        topP: 0.95,
                        maxOutputTokens: 8192
                    }
                }, null, 2)
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini API error:', {
                status: response.status,
                statusText: response.statusText,
                body: errorText
            });
            throw new Error(`API responded with status: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('Received response from Gemini API:', data);
        
        if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
            console.error('Invalid API response format:', data);
            throw new Error('Invalid response format from API');
        }

        // Ensure proper UTF-8 encoding of the response
        const explanation = data.candidates[0].content.parts[0].text;
        const buffer = Buffer.from(explanation, 'utf8');
        const utf8Text = buffer.toString('utf8');

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json({ explanation: utf8Text });
    } catch (error) {
        console.error('Error in /api/explain:', error);
        res.status(500).json({ 
            error: 'Failed to get explanation',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

app.post('/api/ocr', upload.single('image'), async (req, res) => {
    const API_KEY = "AIzaSyCK_5q_4qsHQqt29ZIAVGV12W2MbHIvQSg";
    
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

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));