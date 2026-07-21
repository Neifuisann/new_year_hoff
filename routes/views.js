const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { supabase } = require('../lib/config/database');
const sessionService = require('../lib/services/sessionService');

// Import middleware
const {
  requireAdminAuth,
  requireStudentAuth,
  optionalAuth,
  addSessionInfo
} = require('../lib/middleware/auth');
const { longCacheMiddleware, noCacheMiddleware } = require('../lib/middleware/cache');

// Helper function to serve HTML files
const serveHTML = (filename) => {
  return async (req, res) => {
    try {
      const filePath = path.join(__dirname, '../views', filename);
      const content = await fs.readFile(filePath, 'utf8');
      res.send(content);
    } catch (err) {
      console.error(`Error serving ${filename}:`, err);
      // Fallback to sendFile if read fails, or send error
      res.status(500).send('Error loading page');
    }
  };
};

// Middleware specifically for HTML pages that require student authentication (or admin with student privileges)
const requireStudentAuthForHTML = (req, res, next) => {
  const isStudentAuthenticated = sessionService.isStudentAuthenticated(req);
  const isAdminAuthenticated = sessionService.isAdminAuthenticated(req);
  const hasAccess = sessionService.isStudentOrAdminAuthenticated(req);

  console.log('🔐 requireStudentAuthForHTML check:', {
    url: req.originalUrl,
    sessionId: req.sessionID,
    userAgent: req.headers['user-agent'],
    isStudentAuthenticated,
    isAdminAuthenticated,
    hasAccess,
    studentId: req.session?.studentId,
    studentName: req.session?.studentName
  });

  if (!hasAccess) {
    console.log('❌ User not authenticated, redirecting to login');
    // For HTML requests, redirect to student login
    return res.redirect('/student/login?redirect=' + encodeURIComponent(req.originalUrl));
  }

  console.log('✅ User authenticated (student or admin), proceeding');
  next();
};

// Middleware specifically for HTML pages that require admin authentication
const requireAdminAuthForHTML = (req, res, next) => {
  if (!sessionService.isAdminAuthenticated(req)) {
    // For HTML requests, redirect to admin login
    return res.redirect('/admin/login?redirect=' + encodeURIComponent(req.originalUrl));
  }
  next();
};

// Public pages
router.get('/',
  optionalAuth,
  addSessionInfo,
  longCacheMiddleware(3600), // 1 hour cache
  (req, res) => {
    // If user is already authenticated (student or admin), send them to lessons
    if (sessionService.isStudentOrAdminAuthenticated(req)) {
      return res.redirect('/lessons');
    }
    return res.sendFile(path.join(__dirname, '../views', 'landing.html'));
  }
);

router.get('/login',
  optionalAuth,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('login.html')
);

router.get('/register',
  optionalAuth,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('student-register.html')  // Fixed: register.html -> student-register.html
);

router.get('/student/login',
  optionalAuth,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('student-login.html')
);

router.get('/student/register',
  optionalAuth,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('student-register.html')
);

router.get('/lessons',
  requireStudentAuthForHTML,
  addSessionInfo,
  longCacheMiddleware(1800), // 30 minutes cache
  serveHTML('lessons.html')
);

router.get('/lesson/last-incomplete',
  requireStudentAuthForHTML,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('lesson.html')
);

router.get('/review-mistakes',
  requireStudentAuthForHTML,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('review-mistakes.html')
);

router.get(['/personalized-quiz', '/student/personalized-quiz'],
  requireStudentAuthForHTML,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('student-personalized-quiz.html')
);

router.get('/practice',
  requireStudentAuthForHTML,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('practice.html')
);

router.get('/lesson/:id',
  requireStudentAuthForHTML,
  addSessionInfo,
  longCacheMiddleware(1800), // 30 minutes cache
  serveHTML('lesson.html')
);

// Additional routes referenced in landing page
router.get('/gallery',
  optionalAuth,
  addSessionInfo,
  longCacheMiddleware(1800), // 30 minutes cache
  serveHTML('gallery.html') // Public gallery access for theory section
);

router.get('/multiplechoice',
  requireStudentAuthForHTML,
  addSessionInfo,
  longCacheMiddleware(1800), // 30 minutes cache
  serveHTML('lessons.html') // Redirect to lessons page for now
);

// Add missing truefalse route (referenced in original)
router.get('/truefalse',
  requireStudentAuthForHTML,
  addSessionInfo,
  longCacheMiddleware(1800), // 30 minutes cache
  serveHTML('lessons.html')
);

router.get('/leaderboard',
  requireStudentAuthForHTML,
  addSessionInfo,
  longCacheMiddleware(300), // 5 minutes cache
  serveHTML('leaderboard.html')
);

router.get('/history',
  requireAdminAuthForHTML,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('history.html')
);

router.get('/quizgame',
  requireStudentAuthForHTML,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('quizgame.html')
);

router.get('/profile',
  requireStudentAuthForHTML,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('profile.html')
);

// Add missing profile route with studentId parameter (from original server)
router.get('/profile/:studentId',
  requireStudentAuthForHTML,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('profile.html')
);

router.get('/settings',
  requireStudentAuthForHTML,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('settings.html')
);

// Student-only pages
router.get('/student/dashboard',
  requireStudentAuth,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('lessons.html')  // Fixed: student-dashboard.html -> lessons.html (main lessons page for students)
);

router.get('/student/profile',
  requireStudentAuth,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('profile.html')  // Fixed: student-profile.html -> profile.html
);

router.get('/student/results',
  requireStudentAuth,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('result.html')  // Fixed: student-results.html -> result.html
);

router.get('/student/rating',
  requireStudentAuth,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('leaderboard.html')  // Fixed: student-rating.html -> leaderboard.html
);

// Admin-only pages
router.get('/admin',
  requireAdminAuthForHTML,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('admin-list.html')  // Fixed: admin.html -> admin-list.html
);

router.get('/admin/login',
  optionalAuth,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('admin-login.html')
);

router.get('/admin/lessons',
  requireAdminAuthForHTML,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('admin-list.html')  // Fixed: admin-lessons.html -> admin-list.html (lessons are managed in main admin page)
);

// Modern Split-Screen Editor (Default Interface)
router.get('/admin/new',
  requireAdminAuthForHTML,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('admin-new-v2.html')  // Route for creating new lessons - now uses modern interface
);

router.get('/admin/lessons/new',
  requireAdminAuthForHTML,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('admin-new-v2.html')  // Route for creating new lessons - now uses modern interface
);

router.get('/admin/lessons/:id/edit',
  requireAdminAuthForHTML,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('admin-new-v2.html')  // Route for editing lessons - now uses modern interface
);

router.get('/admin/edit/:id',
  requireAdminAuthForHTML,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('admin-new-v2.html')  // Route for editing lessons - now uses modern interface
);

// Legacy Interface (For Fallback)
router.get('/admin/new-legacy',
  requireAdminAuthForHTML,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('admin-edit.html')  // Legacy interface available as fallback
);

router.get('/admin/edit-legacy/:id',
  requireAdminAuthForHTML,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('admin-edit.html')  // Legacy edit interface available as fallback
);

// Admin configure page (for lesson configuration after editing)
router.get('/admin/configure',
  requireAdminAuthForHTML,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('admin-configure.html')
);

router.get('/admin/configure/:id',
  requireAdminAuthForHTML,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('admin-configure.html')
);

router.get('/admin/students',
  requireAdminAuthForHTML,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('admin-students.html')
);

router.get('/admin/adaptive-quiz',
  requireAdminAuthForHTML,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('admin-adaptive-quiz.html')
);

router.get('/admin/results',
  requireAdminAuthForHTML,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('admin-list.html')  // Fixed: admin-results.html -> admin-list.html (results managed in main admin page)
);

router.get('/admin/ratings',
  requireAdminAuthForHTML,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('admin-list.html')  // Fixed: admin-ratings.html -> admin-list.html (ratings managed in main admin page)
);

router.get('/admin/uploads',
  requireAdminAuthForHTML,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('admin-list.html')  // Fixed: admin-uploads.html -> admin-list.html (uploads managed in main admin page)
);

router.get('/admin/statistics',
  requireAdminAuthForHTML,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('admin-list.html')  // Fixed: admin-statistics.html -> admin-list.html (statistics managed in main admin page)
);

// Add missing admin quiz route
router.get('/admin/quiz',
  requireAdminAuthForHTML,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('admin-quiz-edit.html')
);

router.get('/admin/lessons/:id/statistics',
  requireAdminAuthForHTML,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('lesson-statistics.html')  // Individual lesson statistics page
);

// AI Tools admin page
router.get('/admin/ai-tools',
  requireAdminAuthForHTML,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('admin-ai-tools.html')
);

// Admin settings page
router.get('/admin/settings',
  requireAdminAuthForHTML,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('admin-settings.html')
);

// Result viewing pages
router.get('/result',
  requireStudentAuthForHTML,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('result.html')
);

router.get('/result/:id',
  requireStudentAuthForHTML,
  addSessionInfo,
  longCacheMiddleware(86400), // 24 hours cache
  serveHTML('result.html')
);

// Error pages
router.get('/404',
  optionalAuth,
  addSessionInfo,
  longCacheMiddleware(3600), // 1 hour cache
  serveHTML('404.html')
);

router.get('/500',
  optionalAuth,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('404.html')  // Fixed: 500.html -> 404.html (use 404 page for now)
);

// API documentation page
router.get('/docs',
  optionalAuth,
  addSessionInfo,
  longCacheMiddleware(3600), // 1 hour cache
  serveHTML('404.html')  // Fixed: api-docs.html -> 404.html (use 404 page for now)
);

// Share lesson route (public - no auth required)
router.get('/share/lesson/:lessonId', async (req, res) => {
    const lessonId = req.params.lessonId;
    const loggedInStudentId = req.session.studentId; // Check if student is logged in
    console.log(`Attempting to serve share page for lesson ID: ${lessonId}. Logged in student: ${loggedInStudentId || 'None'}`);

    try {
        // 1. Fetch lesson details including question pool settings
        const { data: lessonData, error: lessonError } = await supabase
            .from('lessons')
            .select('id, title, lesson_image, questions, enable_question_pool, question_pool_size, question_type_distribution')
            .eq('id', lessonId)
            .single();

        if (lessonError) throw new Error(`Database error fetching lesson: ${lessonError.message}`);
        if (!lessonData) throw new Error('Lesson not found');
        console.log(`Lesson found: ${lessonData.title}`);

        // 2. Fetch TOTAL submission count from 'results' table
        const { count: submissionCount, error: countError } = await supabase
            .from('results')
            .select('*', { count: 'exact', head: true })
            .eq('lesson_id', lessonId);

        if (countError) {
            console.error(`Error fetching total submission count for lesson ${lessonId}:`, countError.message);
        }
        const totalSubmissions = submissionCount || 0;
        console.log(`Total submission count: ${totalSubmissions}`);

        // 3. Determine the question count to display
        const totalQuestionsAvailable = Array.isArray(lessonData.questions) ? lessonData.questions.length : 0;
        let questionsPerAttempt = totalQuestionsAvailable;
        
        // Use question pool settings if enabled
        if (lessonData.enable_question_pool && lessonData.question_pool_size > 0) {
            questionsPerAttempt = lessonData.question_pool_size;
        }
        console.log(`Questions per attempt: ${questionsPerAttempt}`);

        // 4. Fetch USER'S past results (if logged in)
        let historyHtmlContent = '';
        if (loggedInStudentId) {
            console.log(`Fetching history for student ${loggedInStudentId} and lesson ${lessonId}`);
            const { data: historyData, error: historyError } = await supabase
                .from('results')
                .select('id, score, total_points, timestamp, questions')
                .eq('student_id', loggedInStudentId)
                .eq('lesson_id', lessonId)
                .order('timestamp', { ascending: false })
                .limit(10); // Increased limit to show more history

            if (historyError) {
                console.error(`Error fetching user history:`, historyError.message);
            } else if (historyData && historyData.length > 0) {
                console.log(`Found ${historyData.length} history entries for the user.`);
                
                // Build collapsible history section
                historyHtmlContent = `
                    <div class="history-header">
                        <h2>
                            <i class="fas fa-history"></i>
                            Lịch sử làm bài của bạn
                        </h2>
                        <button class="collapse-btn" title="Ẩn/Hiện lịch sử" aria-label="Toggle history">
                          <i class="fas fa-chevron-down chev"></i>
                        </button>
                    </div>
                    <div class="history-content">
                `;
                
                historyData.forEach((result, index) => {
                    const score = result.score ?? 0;
                    const totalPoints = result.total_points ?? 0;
                    const scorePercent = totalPoints > 0 ? ((score / totalPoints) * 100).toFixed(2) : 'N/A';
                    const correctAnswers = Array.isArray(result.questions)
                        ? result.questions.filter(q => q.isCorrect).length
                        : 0;
                    const submissionTime = new Date(result.timestamp).toLocaleString('vi-VN', {
                        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    });
                    
                    const dayDiff = Math.floor((Date.now() - new Date(result.timestamp).getTime()) / (1000 * 60 * 60 * 24));
                    let timeAgo = submissionTime;
                    if (dayDiff === 0) {
                        const hourDiff = Math.floor((Date.now() - new Date(result.timestamp).getTime()) / (1000 * 60 * 60));
                        if (hourDiff === 0) {
                            const minDiff = Math.floor((Date.now() - new Date(result.timestamp).getTime()) / (1000 * 60));
                            timeAgo = `${minDiff} phút trước`;
                        } else {
                            timeAgo = `${hourDiff} giờ trước`;
                        }
                    } else if (dayDiff === 1) {
                        timeAgo = 'Hôm qua';
                    } else if (dayDiff < 7) {
                        timeAgo = `${dayDiff} ngày trước`;
                    }

                    // Determine badge class based on score
                    let badgeClass = 'score-badge';
                    if (scorePercent !== 'N/A') {
                      const pct = parseFloat(scorePercent);
                      if (pct >= 80) badgeClass += ' score-good';
                      else if (pct >= 60) badgeClass += ' score-medium';
                      else badgeClass += ' score-bad';
                    }

                    historyHtmlContent += `
                      <div class="history-card">
                        <div class="history-card-header">
                          <div class="score-display">
                            <span class="${badgeClass}">
                              ${scorePercent}%
                            </span>
                          </div>
                          <span style="color: var(--text-secondary, #999); font-size: 0.9em;">${timeAgo}</span>
                        </div>
                            <div class="history-meta">
                                <div class="meta-item">
                                    <i class="fas fa-clock"></i>
                                    <span>${submissionTime}</span>
                                </div>
                                <div class="meta-item">
                                    <i class="fas fa-check-circle"></i>
                                    <span class="correct-count">${correctAnswers} / ${totalPoints}</span>
                                </div>
                                <div class="meta-item">
                                    <i class="fas fa-star"></i>
                                    <span>Điểm: <strong>${score}</strong></span>
                                </div>
                            </div>
                            ${result.id ? `<a href="/result/${result.id}" class="details-link"><i class="fas fa-chart-line"></i>Xem chi tiết</a>` : ''}
                        </div>
                    `;
                });
                
                historyHtmlContent += '</div>'; // Close history-content div
            } else {
                console.log(`No history found for student ${loggedInStudentId} on lesson ${lessonId}`);
            }
        }

        // 5. Read the HTML template
        const templatePath = path.join(process.cwd(), 'views', 'share-lesson.html');
        let htmlContent = await fs.readFile(templatePath, 'utf-8');

        // 6. Replace placeholders
        htmlContent = htmlContent.replace(/{{LESSON_NAME}}/g, lessonData.title || 'Không có tiêu đề');

        // Use the URL directly from the database (handle both field name formats)
        let imageUrl = lessonData.lesson_image || lessonData.lessonImage || '';
        htmlContent = htmlContent.replace(/{{LESSON_IMAGE_URL}}/g, imageUrl);
        htmlContent = htmlContent.replace(/{{QUESTION_COUNT}}/g, questionsPerAttempt);
        htmlContent = htmlContent.replace(/{{SUBMISSION_COUNT}}/g, totalSubmissions);
        htmlContent = htmlContent.replace(/{{LESSON_ID}}/g, lessonData.id);
        htmlContent = htmlContent.replace(/{{HISTORY_HTML_CONTENT}}/g, historyHtmlContent);

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

// Study Materials page - Public access for theory content
router.get('/study-materials',
  optionalAuth,
  addSessionInfo,
  longCacheMiddleware(3600), // 1 hour cache
  serveHTML('study-materials.html')
);

// Individual material page
router.get('/materials/grade:gradeId/:chapterId/:topicId',
  optionalAuth,
  addSessionInfo,
  longCacheMiddleware(3600), // 1 hour cache
  async (req, res) => {
    const { gradeId, chapterId, topicId } = req.params;
    
    try {
        // Validate inputs
        if (!['10', '11', '12'].includes(gradeId)) {
            return res.status(400).send('Invalid grade ID');
        }

        // Path to HTML file
        const htmlPath = path.join(__dirname, '..', 'materials', `grade${gradeId}`, chapterId, `${topicId}.html`);
        
        // Check if file exists
        try {
            await fs.access(htmlPath);
        } catch (error) {
            return res.status(404).send('Material not found');
        }

        // Read and send HTML file
        const htmlContent = await fs.readFile(htmlPath, 'utf-8');
        
        // Remove polyfill.io script and update styles for better readability
        let processedContent = htmlContent;
        
        // Remove the problematic polyfill.io script
        processedContent = processedContent.replace(
            /<script[^>]*src="https:\/\/polyfill\.io[^"]*"[^>]*><\/script>/gi,
            ''
        );
        
        // Wrap the content in a proper layout
        const wrappedContent = `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vật lý ${gradeId} - ${topicId}</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <link rel="stylesheet" href="/css/style.css">
    <!-- Use CDN MathJax directly instead of polyfill -->
    <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
    <style>
        body {
            background: var(--bg-primary);
            color: var(--text-primary);
            font-family: Inter, sans-serif;
            margin: 0;
            padding: 0;
        }
        .material-wrapper {
            max-width: 900px;
            margin: 0 auto;
            padding: 2rem;
            min-height: 100vh;
        }
        .back-button {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.75rem 1.5rem;
            background: var(--bg-secondary);
            border: 1px solid var(--border-primary);
            border-radius: var(--radius-md);
            color: var(--text-primary);
            text-decoration: none;
            margin-bottom: 2rem;
            transition: all var(--transition-base);
        }
        .back-button:hover {
            background: var(--bg-hover);
            transform: translateX(-2px);
        }
        .material-content {
            background: var(--bg-secondary);
            border: 1px solid var(--border-primary);
            border-radius: var(--radius-lg);
            padding: 2rem;
        }
        /* Override material styles for dark theme compatibility */
        .material-content h1, .material-content h2, .material-content h3 {
            color: var(--text-primary) !important;
        }
        .material-content p, .material-content li {
            color: var(--text-secondary) !important;
            line-height: 1.8;
        }
        
        /* Definition box - Material Design inspired */
        .material-content .definition-box {
            background: rgba(99, 102, 241, 0.1) !important;
            border-left: 4px solid var(--primary-color) !important;
            border-radius: var(--radius-md);
            padding: 1.5rem !important;
            margin: 1.5rem 0;
            color: var(--text-primary) !important;
        }
        
        .material-content .definition-box p,
        .material-content .definition-box li {
            color: var(--text-primary) !important;
        }
        
        /* Formula box - Better contrast */
        .material-content .formula-box {
            background: rgba(16, 185, 129, 0.1) !important;
            border: 2px solid rgba(16, 185, 129, 0.3) !important;
            border-radius: var(--radius-md);
            padding: 1.5rem !important;
            margin: 1.5rem 0;
            text-align: center;
        }
        
        .material-content .formula-box,
        .material-content .formula-box * {
            color: var(--text-primary) !important;
        }
        
        /* Important formula - High contrast */
        .material-content .important-formula {
            background: rgba(251, 191, 36, 0.15) !important;
            border: 2px solid rgba(251, 191, 36, 0.4) !important;
            border-radius: var(--radius-md);
            padding: 1.5rem !important;
            margin: 2rem 0;
            box-shadow: 0 4px 12px rgba(251, 191, 36, 0.1);
        }
        
        .material-content .important-formula,
        .material-content .important-formula * {
            color: var(--text-primary) !important;
            font-weight: 600;
        }
        
        /* Example box */
        .material-content .example-box {
            background: rgba(168, 85, 247, 0.08) !important;
            border: 1px solid rgba(168, 85, 247, 0.2) !important;
            border-radius: var(--radius-md);
            padding: 1.5rem !important;
            margin: 1.5rem 0;
        }
        
        .material-content .example-box,
        .material-content .example-box p,
        .material-content .example-box li {
            color: var(--text-primary) !important;
        }
        
        /* Solution box - Better readability */
        .material-content .solution {
            background: rgba(16, 185, 129, 0.08) !important;
            border: 1px solid rgba(16, 185, 129, 0.2) !important;
            border-radius: var(--radius-md);
            padding: 1.5rem !important;
            margin: 1.5rem 0;
        }
        
        .material-content .solution,
        .material-content .solution p,
        .material-content .solution li,
        .material-content .solution * {
            color: var(--text-primary) !important;
        }
        
        /* Note box */
        .material-content .note-box {
            background: rgba(59, 130, 246, 0.08) !important;
            border-left: 4px solid rgba(59, 130, 246, 0.5) !important;
            border-radius: var(--radius-md);
            padding: 1.5rem !important;
            margin: 1.5rem 0;
        }
        
        .material-content .note-box,
        .material-content .note-box p,
        .material-content .note-box li {
            color: var(--text-primary) !important;
        }
        
        /* Warning box */
        .material-content .warning-box {
            background: rgba(239, 68, 68, 0.08) !important;
            border-left: 4px solid rgba(239, 68, 68, 0.5) !important;
            border-radius: var(--radius-md);
            padding: 1.5rem !important;
            margin: 1.5rem 0;
        }
        
        .material-content .warning-box,
        .material-content .warning-box p,
        .material-content .warning-box li {
            color: var(--text-primary) !important;
        }
        
        /* Images */
        .material-content img {
            max-width: 100%;
            height: auto;
            border-radius: var(--radius-md);
            margin: 1rem 0;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        
        /* Tables */
        .material-content table {
            width: 100%;
            border-collapse: collapse;
            margin: 1.5rem 0;
            background: var(--bg-tertiary);
            border-radius: var(--radius-md);
            overflow: hidden;
        }
        
        .material-content th {
            background: rgba(99, 102, 241, 0.1);
            color: var(--text-primary);
            padding: 1rem;
            text-align: left;
            font-weight: 600;
            border-bottom: 2px solid var(--border-primary);
        }
        
        .material-content td {
            padding: 1rem;
            color: var(--text-secondary);
            border-bottom: 1px solid var(--border-primary);
        }
        
        .material-content tr:last-child td {
            border-bottom: none;
        }
        
        /* MathJax compatibility */
        .material-content mjx-container {
            color: var(--text-primary) !important;
        }
        
        /* Strong emphasis */
        .material-content strong,
        .material-content b {
            color: var(--text-primary) !important;
            font-weight: 600;
        }
        
        /* Links */
        .material-content a {
            color: var(--primary-color) !important;
            text-decoration: none;
            border-bottom: 1px solid transparent;
            transition: all var(--transition-base);
        }
        
        .material-content a:hover {
            border-bottom-color: var(--primary-color);
        }
        
        /* Fix ordered list alignment */
        .material-content ol {
            padding-left: 1.5rem !important;
            margin: 1rem 0;
        }
        
        .material-content ol[type="a"],
        .material-content ol[type="A"],
        .material-content ol[type="i"],
        .material-content ol[type="I"] {
            padding-left: 2rem !important;
        }
        
        .material-content ol li {
            margin: 0.5rem 0;
            padding-left: 0.5rem;
            color: var(--text-secondary) !important;
        }
        
        .material-content ul {
            padding-left: 1.5rem !important;
            margin: 1rem 0;
        }
        
        .material-content ul li {
            margin: 0.5rem 0;
            padding-left: 0.5rem;
            color: var(--text-secondary) !important;
        }
        
        /* Practice problems - Better visibility */
        .material-content .practice-problem {
            background: rgba(139, 92, 246, 0.05) !important;
            border: 2px solid rgba(139, 92, 246, 0.2) !important;
            border-radius: var(--radius-md);
            padding: 1.5rem !important;
            margin: 2rem 0;
            position: relative;
        }
        
        .material-content .practice-problem::before {
            content: "Bài tập";
            position: absolute;
            top: -12px;
            left: 1rem;
            background: var(--bg-secondary);
            padding: 0 0.5rem;
            color: var(--primary-color);
            font-weight: 600;
            font-size: 0.875rem;
        }
        
        .material-content .practice-problem,
        .material-content .practice-problem p,
        .material-content .practice-problem li,
        .material-content .practice-problem * {
            color: var(--text-primary) !important;
        }
        
        /* Problem statement */
        .material-content .problem-statement {
            background: rgba(59, 130, 246, 0.08) !important;
            border-left: 3px solid var(--primary-color) !important;
            padding: 1rem 1.5rem !important;
            margin: 1rem 0;
            border-radius: var(--radius-sm);
        }
        
        /* Specific example styling */
        .material-content .example,
        .material-content .vi-du {
            background: rgba(168, 85, 247, 0.05) !important;
            border: 1px solid rgba(168, 85, 247, 0.15) !important;
            border-radius: var(--radius-md);
            padding: 1.5rem !important;
            margin: 2rem 0;
            position: relative;
        }
        
        /* Headers in example boxes */
        .material-content .example h3,
        .material-content .example h4,
        .material-content .vi-du h3,
        .material-content .vi-du h4 {
            color: var(--primary-color) !important;
            margin-bottom: 1rem;
        }
        
        /* Solution sections */
        .material-content .giai,
        .material-content .solution-section {
            background: rgba(16, 185, 129, 0.05) !important;
            border: 1px solid rgba(16, 185, 129, 0.15) !important;
            border-radius: var(--radius-sm);
            padding: 1rem !important;
            margin: 1rem 0;
        }
        
        .material-content .giai h4,
        .material-content .solution-section h4 {
            color: rgb(16, 185, 129) !important;
            margin-bottom: 0.5rem;
        }
        
        /* Experiment box */
        .material-content .experiment-box {
            background: rgba(34, 197, 94, 0.08) !important;
            border: 2px solid rgba(34, 197, 94, 0.25) !important;
            border-radius: var(--radius-md);
            padding: 1.5rem !important;
            margin: 2rem 0;
            position: relative;
        }
        
        .material-content .experiment-box::before {
            content: "Thí nghiệm";
            position: absolute;
            top: -12px;
            left: 1rem;
            background: var(--bg-secondary);
            padding: 0 0.5rem;
            color: rgb(34, 197, 94);
            font-weight: 600;
            font-size: 0.875rem;
        }
        
        .material-content .experiment-box,
        .material-content .experiment-box p,
        .material-content .experiment-box li,
        .material-content .experiment-box * {
            color: var(--text-primary) !important;
        }
        
        .material-content .experiment-box h3,
        .material-content .experiment-box h4 {
            color: rgb(34, 197, 94) !important;
            margin-bottom: 1rem;
        }
        
        /* Force type box */
        .material-content .force-type {
            background: rgba(239, 68, 68, 0.05) !important;
            border: 1px solid rgba(239, 68, 68, 0.2) !important;
            border-radius: var(--radius-md);
            padding: 1.5rem !important;
            margin: 1.5rem 0;
        }
        
        .material-content .force-type,
        .material-content .force-type p,
        .material-content .force-type li,
        .material-content .force-type * {
            color: var(--text-primary) !important;
        }
        
        /* Special case box */
        .material-content .special-case {
            background: rgba(251, 146, 60, 0.08) !important;
            border: 2px solid rgba(251, 146, 60, 0.3) !important;
            border-radius: var(--radius-md);
            padding: 1.5rem !important;
            margin: 2rem 0;
            position: relative;
        }
        
        .material-content .special-case::before {
            content: "Trường hợp đặc biệt";
            position: absolute;
            top: -12px;
            left: 1rem;
            background: var(--bg-secondary);
            padding: 0 0.5rem;
            color: rgb(251, 146, 60);
            font-weight: 600;
            font-size: 0.875rem;
        }
        
        .material-content .special-case,
        .material-content .special-case p,
        .material-content .special-case li,
        .material-content .special-case * {
            color: var(--text-primary) !important;
        }
        
        /* Energy type box */
        .material-content .energy-type {
            background: rgba(34, 197, 94, 0.05) !important;
            border: 1px solid rgba(34, 197, 94, 0.2) !important;
            border-radius: var(--radius-md);
            padding: 1.5rem !important;
            margin: 1.5rem 0;
        }
        
        .material-content .energy-type,
        .material-content .energy-type p,
        .material-content .energy-type li,
        .material-content .energy-type * {
            color: var(--text-primary) !important;
        }
        
        /* Comparison table */
        .material-content .comparison-table {
            background: var(--bg-tertiary);
            border: 1px solid var(--border-primary);
            border-radius: var(--radius-md);
            padding: 1.5rem !important;
            margin: 2rem 0;
            overflow-x: auto;
        }
        
        .material-content .comparison-table table {
            width: 100%;
            margin: 0;
        }
        
        .material-content .comparison-table th {
            background: rgba(99, 102, 241, 0.15);
            color: var(--text-primary);
            font-weight: 600;
            padding: 1rem;
            text-align: left;
            border-bottom: 2px solid var(--border-primary);
        }
        
        .material-content .comparison-table td {
            padding: 1rem;
            color: var(--text-secondary);
            border-bottom: 1px solid var(--border-primary);
        }
        
        .material-content .comparison-table tr:last-child td {
            border-bottom: none;
        }
    </style>
</head>
<body>
    <div class="material-wrapper">
        <a href="/study-materials" class="back-button">
            <i class="fas fa-arrow-left"></i>
            Quay lại danh sách
        </a>
        <div class="material-content">
            ${processedContent}
        </div>
    </div>
    <script src="/js/nav-mobile.js"></script>
</body>
</html>
        `;
        
        res.send(wrappedContent);

    } catch (error) {
        console.error('Error serving material:', error);
        res.status(500).send('Error loading material');
    }
  }
);

// Health check page
router.get('/health',
  longCacheMiddleware(60), // 1 minute cache
  (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage()
    });
  }
);

// Test route for mobile navigation
router.get('/test-mobile-nav',
  optionalAuth,
  addSessionInfo,
  noCacheMiddleware,
  serveHTML('test-mobile-nav-fix.html')
);

module.exports = router;
