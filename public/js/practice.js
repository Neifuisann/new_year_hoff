// Practice Mode JavaScript
let currentQuestionIndex = 0;
let practiceQuestions = [];
let userAnswers = {};
let flaggedQuestions = new Set();
let startTime = Date.now();
let timerInterval = null;
let practiceMeta = {
    title: 'Luyện tập lỗi sai',
    returnUrl: '/review-mistakes'
};

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatQuestionText(value) {
    return escapeHtml(value).replace(/\n/g, '<br>');
}

function safeImageUrl(value) {
    const url = String(value || '').trim();
    return /^(https?:\/\/|\/)/i.test(url) ? escapeHtml(url) : '';
}

async function getCsrfToken() {
    const response = await fetch('/api/csrf-token');
    if (!response.ok) throw new Error('Failed to get CSRF token');
    const data = await response.json();
    if (!data.csrfToken) throw new Error('CSRF token missing');
    return data.csrfToken;
}

// Timer function
function startTimer() {
    timerInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const hours = Math.floor(elapsed / 3600000);
        const minutes = Math.floor((elapsed % 3600000) / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        
        const timerElement = document.getElementById('timer');
        if (timerElement) {
            timerElement.textContent = 
                `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }, 1000);
}

// Authentication check (supports both students and admins)
async function checkStudentAuthentication() {
    try {
        const response = await fetch('/api/auth/student/check');
        if (!response.ok) {
            console.log('Auth check failed, user not authenticated');
            return false;
        }
        const authData = await response.json();

        if (authData.success && authData.data) {
            if (authData.data.isAuthenticated && authData.data.student) {
                console.log('User authenticated:', authData.data.student.name,
                    authData.data.student.id === 'admin' ? '(Admin)' : '(Student)');
                return true;
            }
        }

        console.log('User not authenticated');
        return false;
    } catch (error) {
        console.error('Error checking authentication:', error);
        return false;
    }
}

function promptForLogin() {
    const currentUrl = window.location.pathname + window.location.search;
    if (confirm('Bạn cần đăng nhập để luyện tập. Chuyển đến trang đăng nhập?')) {
        window.location.href = '/student/login?redirect=' + encodeURIComponent(currentUrl);
    }
}

// Utility functions
function showLoader(show) {
    const loader = document.getElementById('loading-indicator');
    if (loader) {
        loader.style.display = show ? 'flex' : 'none';
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Load practice questions
async function loadPracticeQuestions() {
    try {
        // Get mistake IDs from sessionStorage
        const practiceData = sessionStorage.getItem('practiceMistakes');
        if (!practiceData) {
            alert('Không tìm thấy câu hỏi luyện tập. Vui lòng chọn lại từ trang ôn tập.');
            window.location.href = '/review-mistakes';
            return;
        }
        
        const parsedPracticeData = JSON.parse(practiceData);
        const mistakeIds = Array.isArray(parsedPracticeData.mistakeIds)
            ? parsedPracticeData.mistakeIds
            : [];
        if (mistakeIds.length === 0) {
            throw new Error('No mistake IDs selected');
        }

        practiceMeta = {
            title: String(parsedPracticeData.title || 'Luyện tập lỗi sai').slice(0, 80),
            returnUrl: String(parsedPracticeData.returnUrl || '').startsWith('/')
                ? parsedPracticeData.returnUrl
                : '/review-mistakes'
        };
        const titleElement = document.getElementById('practice-title');
        if (titleElement) titleElement.textContent = practiceMeta.title;

        const csrfToken = await getCsrfToken();

        // Fetch practice questions
        const response = await fetch('/api/progress/practice/questions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-csrf-token': csrfToken
            },
            body: JSON.stringify({
                mistakeIds: mistakeIds,
                count: mistakeIds.length,
                csrfToken
            })
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch practice questions: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.success && Array.isArray(data.questions) && data.questions.length > 0) {
            practiceQuestions = data.questions;
            
            // Shuffle questions for variety
            practiceQuestions = shuffleArray(practiceQuestions);
            
            // Shuffle options for each question
            practiceQuestions.forEach(question => {
                if (question.type === 'multiple_choice' && Array.isArray(question.options)) {
                    question.shuffledOptions = shuffleArray([...question.options]);
                }
            });
            
            renderQuestions();
            renderQuestionNavigation();
            updateStats();
            
            // Show first question
            navigateToQuestion(0);
        } else {
            throw new Error('Invalid response format');
        }
    } catch (error) {
        console.error('Error loading practice questions:', error);
        alert('Không thể tải câu hỏi luyện tập. Vui lòng thử lại.');
        window.location.href = practiceMeta.returnUrl;
    }
}

// Render all questions
function renderLegacyQuestions() {
    const contentContainer = document.getElementById('practice-content');
    
    contentContainer.innerHTML = practiceQuestions.map((question, index) => {
        let optionsHTML = '';
        
        if (question.type === 'multiple_choice') {
            const options = question.shuffledOptions || question.options || [];
            optionsHTML = `
                <div class="options-list">
                    ${options.map((option, optIndex) => `
                        <div class="option-item" 
                             data-question="${index}" 
                             data-option="${optIndex}"
                             onclick="selectOption(${index}, ${optIndex}, '${option}')">
                            <div class="option-radio"></div>
                            <div class="option-label">${option}</div>
                        </div>
                    `).join('')}
                </div>
            `;
        } else if (question.type === 'true_false') {
            optionsHTML = `
                <div class="truefalse-options">
                    <div class="option-item truefalse-option" 
                         data-question="${index}" 
                         data-option="true"
                         onclick="selectOption(${index}, 'true', 'Đúng')">
                        <div class="option-radio"></div>
                        <div class="option-label">Đúng</div>
                    </div>
                    <div class="option-item truefalse-option" 
                         data-question="${index}" 
                         data-option="false"
                         onclick="selectOption(${index}, 'false', 'Sai')">
                        <div class="option-radio"></div>
                        <div class="option-label">Sai</div>
                    </div>
                </div>
            `;
        } else if (question.type === 'number') {
            optionsHTML = `
                <div class="number-input-container">
                    <input type="number" 
                           class="number-input" 
                           id="number-input-${index}"
                           placeholder="Nhập đáp án số"
                           onchange="saveNumberAnswer(${index})"
                           value="${userAnswers[index] || ''}">
                    <div class="number-hint">Nhập câu trả lời dạng số</div>
                </div>
            `;
        }
        
        return `
            <div class="question-card" id="question-${index}">
                <div class="question-header">
                    <div class="question-number">Câu ${index + 1}/${practiceQuestions.length}</div>
                    <div class="question-actions">
                        <button class="flag-btn ${flaggedQuestions.has(index) ? 'active' : ''}" 
                                onclick="toggleFlag(${index})">
                            <i class="fas fa-flag"></i>
                            ${flaggedQuestions.has(index) ? 'Đã đánh dấu' : 'Đánh dấu'}
                        </button>
                    </div>
                </div>
                
                <div class="question-text">${question.question}</div>
                
                ${optionsHTML}
                
                <div class="question-navigation">
                    <button class="nav-btn" onclick="navigateQuestion(-1)" ${index === 0 ? 'disabled' : ''}>
                        <i class="fas fa-chevron-left"></i>
                        Câu trước
                    </button>
                    <button class="nav-btn" onclick="navigateQuestion(1)" 
                            ${index === practiceQuestions.length - 1 ? 'disabled' : ''}>
                        Câu sau
                        <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    // Render math with KaTeX
    if (window.renderMathInElement) {
        renderMathInElement(contentContainer, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false}
            ]
        });
    }
}

function renderQuestions() {
    const contentContainer = document.getElementById('practice-content');

    contentContainer.innerHTML = practiceQuestions.map((question, index) => {
        let optionsHTML = '';

        if (question.type === 'multiple_choice') {
            const options = question.shuffledOptions || question.options || [];
            optionsHTML = `
                <div class="options-list">
                    ${options.map((option, optionIndex) => `
                        <button type="button" class="option-item"
                            data-question="${index}"
                            data-option="${optionIndex}"
                            onclick="selectOption(${index}, ${optionIndex})">
                            <span class="option-radio"></span>
                            <span class="option-label">${formatQuestionText(
                                typeof option === 'object' ? option.text : option
                            )}</span>
                        </button>
                    `).join('')}
                </div>
            `;
        } else if (question.type === 'true_false') {
            const statements = Array.isArray(question.options) ? question.options : [];
            optionsHTML = `
                <div class="truefalse-statements">
                    ${statements.map((statement, statementIndex) => `
                        <div class="truefalse-statement">
                            <div class="statement-copy">
                                <span>${String.fromCharCode(65 + statementIndex)}</span>
                                <p>${formatQuestionText(
                                    typeof statement === 'object' ? statement.text : statement
                                )}</p>
                            </div>
                            <div class="statement-choices" role="group" aria-label="Chọn đúng hoặc sai">
                                <button type="button" class="truefalse-choice"
                                    data-question="${index}" data-statement="${statementIndex}" data-value="true"
                                    onclick="selectTrueFalse(${index}, ${statementIndex}, true)">Đúng</button>
                                <button type="button" class="truefalse-choice"
                                    data-question="${index}" data-statement="${statementIndex}" data-value="false"
                                    onclick="selectTrueFalse(${index}, ${statementIndex}, false)">Sai</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        } else if (question.type === 'number') {
            optionsHTML = `
                <div class="number-input-container">
                    <input type="number"
                        class="number-input"
                        id="number-input-${index}"
                        placeholder="Nhập đáp án số"
                        onchange="saveNumberAnswer(${index})"
                        value="${escapeHtml(userAnswers[index] || '')}">
                    <div class="number-hint">Nhập câu trả lời dạng số</div>
                </div>
            `;
        } else {
            optionsHTML = '<div class="question-format-error">Không thể hiển thị định dạng câu hỏi này.</div>';
        }

        const imageUrl = safeImageUrl(question.imageUrl);
        const imageHTML = imageUrl
            ? `<img class="question-image" src="${imageUrl}" alt="Hình minh họa cho câu hỏi" loading="lazy">`
            : '';

        return `
            <div class="question-card" id="question-${index}">
                <div class="question-header">
                    <div>
                        <div class="question-number">Câu ${index + 1}/${practiceQuestions.length}</div>
                        <div class="question-source">${escapeHtml(question.lessonTitle || 'Bài học')}</div>
                    </div>
                    <div class="question-actions">
                        <button type="button" class="flag-btn ${flaggedQuestions.has(index) ? 'active' : ''}"
                            onclick="toggleFlag(${index})">
                            <i class="fas fa-flag"></i>
                            ${flaggedQuestions.has(index) ? 'Đã đánh dấu' : 'Đánh dấu'}
                        </button>
                    </div>
                </div>

                <div class="question-text">${formatQuestionText(question.question)}</div>
                ${imageHTML}
                ${optionsHTML}

                <div class="question-navigation">
                    <button type="button" class="nav-btn" onclick="navigateQuestion(-1)" ${index === 0 ? 'disabled' : ''}>
                        <i class="fas fa-chevron-left"></i> Câu trước
                    </button>
                    <button type="button" class="nav-btn" onclick="navigateQuestion(1)"
                        ${index === practiceQuestions.length - 1 ? 'disabled' : ''}>
                        Câu sau <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    if (window.renderMathInElement) {
        renderMathInElement(contentContainer, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false },
                { left: '\\(', right: '\\)', display: false },
                { left: '\\[', right: '\\]', display: true }
            ],
            throwOnError: false
        });
    }
}

// Render question navigation grid
function renderQuestionNavigation() {
    const gridContainer = document.getElementById('question-grid');
    
    gridContainer.innerHTML = practiceQuestions.map((_, index) => `
        <div class="question-nav-item ${index === 0 ? 'active' : ''}" 
             id="nav-item-${index}"
             onclick="navigateToQuestion(${index})">
            ${index + 1}
        </div>
    `).join('');
    
    // Update total count
    document.getElementById('total-count').textContent = practiceQuestions.length;
}

// Navigate to specific question
function navigateToQuestion(index) {
    if (index < 0 || index >= practiceQuestions.length) return;
    
    // Hide all questions
    document.querySelectorAll('.question-card').forEach(card => {
        card.style.display = 'none';
    });
    
    // Show selected question
    document.getElementById(`question-${index}`).style.display = 'block';
    
    // Update navigation
    document.querySelectorAll('.question-nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.getElementById(`nav-item-${index}`).classList.add('active');
    
    currentQuestionIndex = index;
    
    // Scroll to top
    document.getElementById('practice-content').scrollTop = 0;
}

// Navigate questions
function navigateQuestion(direction) {
    navigateToQuestion(currentQuestionIndex + direction);
}

// Select option
function selectOption(questionIndex, optionIndex) {
    const question = practiceQuestions[questionIndex];
    const options = question?.shuffledOptions || question?.options || [];
    const selectedValue = options[optionIndex];
    const optionValue = typeof selectedValue === 'object' ? selectedValue.text : selectedValue;
    if (optionValue === undefined) return;

    // Clear previous selection
    document.querySelectorAll(`[data-question="${questionIndex}"]`).forEach(item => {
        item.classList.remove('selected');
    });
    
    // Mark selected option
    const selectedOption = document.querySelector(`[data-question="${questionIndex}"][data-option="${optionIndex}"]`);
    if (selectedOption) {
        selectedOption.classList.add('selected');
    }
    
    // Save answer
    userAnswers[questionIndex] = optionValue;
    
    // Update navigation item
    updateNavigationItem(questionIndex);
    updateStats();
}

function selectTrueFalse(questionIndex, statementIndex, value) {
    const question = practiceQuestions[questionIndex];
    if (!question || !Array.isArray(question.options) || statementIndex >= question.options.length) {
        return;
    }

    if (!Array.isArray(userAnswers[questionIndex])) {
        userAnswers[questionIndex] = Array(question.options.length).fill(null);
    }
    userAnswers[questionIndex][statementIndex] = Boolean(value);

    document.querySelectorAll(
        `[data-question="${questionIndex}"][data-statement="${statementIndex}"]`
    ).forEach((button) => {
        button.classList.toggle('selected', button.dataset.value === String(Boolean(value)));
    });

    updateNavigationItem(questionIndex);
    updateStats();
}

// Save number answer
function saveNumberAnswer(questionIndex) {
    const input = document.getElementById(`number-input-${questionIndex}`);
    if (input.value.trim()) {
        userAnswers[questionIndex] = input.value;
    } else {
        delete userAnswers[questionIndex];
    }
    
    updateNavigationItem(questionIndex);
    updateStats();
}

function isQuestionAnswered(questionIndex) {
    const question = practiceQuestions[questionIndex];
    const answer = userAnswers[questionIndex];
    if (!question || answer === undefined || answer === null) return false;

    if (question.type === 'true_false') {
        return Array.isArray(answer) &&
            answer.length === question.options.length &&
            answer.every((value) => typeof value === 'boolean');
    }

    return String(answer).trim().length > 0;
}

// Toggle flag
function toggleFlag(questionIndex) {
    console.log('toggleFlag called for question:', questionIndex);
    
    // Validate questionIndex
    if (questionIndex < 0 || questionIndex >= practiceQuestions.length) {
        console.error('Invalid questionIndex:', questionIndex, 'total questions:', practiceQuestions.length);
        return;
    }
    
    if (flaggedQuestions.has(questionIndex)) {
        flaggedQuestions.delete(questionIndex);
    } else {
        flaggedQuestions.add(questionIndex);
    }
    
    // Update flag button with improved error handling
    const questionContainer = document.getElementById(`question-${questionIndex}`);
    console.log('Question container found:', questionContainer ? 'yes' : 'no');
    
    if (!questionContainer) {
        console.error('Question container not found for index:', questionIndex);
        return;
    }
    
    const flagBtn = questionContainer.querySelector('.flag-btn');
    console.log('Flag button found:', flagBtn ? 'yes' : 'no');
    
    if (flagBtn) {
        try {
            flagBtn.classList.toggle('active');
            flagBtn.innerHTML = flaggedQuestions.has(questionIndex)
                ? '<i class="fas fa-flag"></i> Đã đánh dấu'
                : '<i class="fas fa-flag"></i> Đánh dấu';
            console.log('Flag button updated successfully');
        } catch (error) {
            console.error('Error updating flag button:', error);
        }
    } else {
        console.error('Flag button not found in question container');
    }
    
    updateNavigationItem(questionIndex);
}

// Update navigation item
function updateNavigationItem(questionIndex) {
    const navItem = document.getElementById(`nav-item-${questionIndex}`);
    if (!navItem) return;
    
    navItem.classList.remove('answered', 'flagged');
    
    if (isQuestionAnswered(questionIndex)) {
        navItem.classList.add('answered');
    }
    
    if (flaggedQuestions.has(questionIndex)) {
        navItem.classList.add('flagged');
    }
}

// Update stats
function updateStats() {
    const answeredCount = practiceQuestions.reduce(
        (total, _, index) => total + (isQuestionAnswered(index) ? 1 : 0),
        0
    );
    document.getElementById('answered-count').textContent = answeredCount;
}

// Show confirmation modal
function showConfirmationModal() {
    const modal = document.getElementById('confirmation-modal');
    const answeredCount = practiceQuestions.reduce(
        (total, _, index) => total + (isQuestionAnswered(index) ? 1 : 0),
        0
    );
    const unansweredCount = practiceQuestions.length - answeredCount;
    
    if (unansweredCount > 0) {
        document.getElementById('unanswered-warning').style.display = 'block';
        document.getElementById('unanswered-count').textContent = unansweredCount;
    } else {
        document.getElementById('unanswered-warning').style.display = 'none';
    }
    
    modal.classList.add('show');
}

// Close confirmation modal
function closeConfirmationModal() {
    document.getElementById('confirmation-modal').classList.remove('show');
}

function normalizeScalarAnswer(value) {
    return String(value ?? '').trim().toLocaleLowerCase('vi');
}

function isPracticeAnswerCorrect(question, userAnswer) {
    if (question.type === 'true_false') {
        const correctAnswer = question.correctAnswer;
        return Array.isArray(userAnswer) &&
            Array.isArray(correctAnswer) &&
            userAnswer.length === correctAnswer.length &&
            userAnswer.every((value, index) => value === correctAnswer[index]);
    }

    if (question.type === 'number') {
        const submittedNumber = Number(userAnswer);
        const correctNumber = Number(question.correctAnswer);
        if (Number.isFinite(submittedNumber) && Number.isFinite(correctNumber)) {
            const parsedTolerance = Number(question.tolerance);
            const tolerance = Number.isFinite(parsedTolerance) && parsedTolerance > 0
                ? parsedTolerance
                : 0;
            return Math.abs(submittedNumber - correctNumber) <= tolerance;
        }
    }

    return normalizeScalarAnswer(userAnswer) === normalizeScalarAnswer(question.correctAnswer);
}

// Submit practice
async function submitPractice() {
    try {
        // Stop timer
        if (timerInterval) {
            clearInterval(timerInterval);
        }
        
        // Calculate results
        let score = 0;
        const results = practiceQuestions.map((question, index) => {
            const userAnswer = userAnswers[index] ?? '';
            const isCorrect = isPracticeAnswerCorrect(question, userAnswer);
            
            if (isCorrect) score++;
            
            return {
                questionIndex: index,
                question: question.question,
                userAnswer: userAnswer,
                correctAnswer: question.correctAnswer,
                isCorrect: isCorrect,
                type: question.type
            };
        });
        
        const timeSpent = Math.floor((Date.now() - startTime) / 1000); // in seconds

        // Get CSRF token before making the request
        const csrfResponse = await fetch('/api/csrf-token');
        if (!csrfResponse.ok) {
            throw new Error('Failed to get CSRF token');
        }
        const csrfData = await csrfResponse.json();

        const payload = {
            questions: results,
            score: score,
            totalQuestions: practiceQuestions.length,
            timeSpent: timeSpent,
            csrfToken: csrfData.csrfToken
        };

        // Submit results
        const response = await fetch('/api/progress/practice/submit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            // Store results in sessionStorage for results page
            sessionStorage.setItem('practiceResults', JSON.stringify({
                results: results,
                score: score,
                totalQuestions: practiceQuestions.length,
                timeSpent: timeSpent,
                timestamp: new Date().toISOString()
            }));
            
            // Clear practice data
            sessionStorage.removeItem('practiceMistakes');
            
            // Show results
            alert(`Hoàn thành luyện tập!\n\nĐiểm: ${score}/${practiceQuestions.length}\nThời gian: ${formatTime(timeSpent)}`);
            
            // Redirect to review mistakes page
            window.location.href = practiceMeta.returnUrl;
        } else {
            throw new Error('Failed to submit practice results');
        }
    } catch (error) {
        console.error('Error submitting practice:', error);
        alert('Có lỗi khi nộp bài. Vui lòng thử lại.');
    }
}

// Format time
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    } else {
        return `${secs}s`;
    }
}

// Toggle mobile sidebar
function toggleMobileSidebar() {
    const sidebar = document.getElementById('practice-sidebar');
    sidebar.classList.toggle('show');
}

// Initialize practice
async function initializePractice() {
    const isAuthenticated = await checkStudentAuthentication();
    
    if (!isAuthenticated) {
        promptForLogin();
        return;
    }
    
    showLoader(true);
    
    try {
        // Load practice questions
        await loadPracticeQuestions();
        
        // Start timer
        startTimer();
        
        // Set up event listeners
        document.getElementById('submit-practice-btn').addEventListener('click', showConfirmationModal);
        document.getElementById('mobile-sidebar-toggle').addEventListener('click', toggleMobileSidebar);
        
        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft' && currentQuestionIndex > 0) {
                navigateQuestion(-1);
            } else if (e.key === 'ArrowRight' && currentQuestionIndex < practiceQuestions.length - 1) {
                navigateQuestion(1);
            }
        });
        
        showLoader(false);
        
    } catch (error) {
        console.error('Error initializing practice:', error);
        showLoader(false);
    }
}

// Start when DOM is loaded
document.addEventListener('DOMContentLoaded', initializePractice);
