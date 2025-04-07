// Store shuffled options mapping globally
window.questionMappings = {};
let currentLessonData = null; // Variable to store loaded lesson data

// --- Student Authentication Functions ---
async function checkStudentAuthentication() {
    try {
        const response = await fetch('/api/check-student-auth');
        if (!response.ok) {
            throw new Error('Auth check failed');
        }
        const authData = await response.json();

        if (authData.isAuthenticated && authData.student) {
            console.log('Student authenticated:', authData.student.name);
            return true;
        } else {
            console.log('Student not authenticated, redirecting...');
            const currentUrl = window.location.pathname + window.location.search;
            window.location.href = '/student/login?redirect=' + encodeURIComponent(currentUrl);
            return false;
        }
    } catch (error) {
        console.error('Error checking student authentication:', error);
        window.location.href = '/student/login';
        return false;
    }
}

async function handleLogout() {
    try {
        const response = await fetch('/api/student/logout', { method: 'POST' });
        const result = await response.json();
        if (result.success) {
            console.log('Logout successful');
            window.location.href = '/student/login';
        } else {
            alert('Đăng xuất thất bại: ' + (result.message || 'Lỗi không xác định'));
        }
    } catch (error) {
        console.error('Logout error:', error);
        alert('Đã xảy ra lỗi trong quá trình đăng xuất.');
    }
}
// --- End Authentication Functions ---

// Function to show/hide loader
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

async function renderQuestions(lesson) {
    const sections = {
        abcd: { element: document.getElementById('abcd-questions'), questions: [] },
        truefalse: { element: document.getElementById('truefalse-questions'), questions: [] },
        number: { element: document.getElementById('number-questions'), questions: [] }
    };

    // Group all questions by type
    lesson.questions.forEach(q => sections[q.type]?.questions.push(q));
    
    // If randomQuestions is set, select random questions while maintaining proportions
    if (lesson.randomQuestions > 0 && lesson.randomQuestions < lesson.questions.length) {
        // Calculate the proportion of each question type
        const totalQuestions = lesson.questions.length;
        const proportions = {};
        Object.keys(sections).forEach(type => {
            proportions[type] = sections[type].questions.length / totalQuestions;
        });

        // Calculate how many questions of each type to include
        const randomCounts = {};
        let remainingCount = lesson.randomQuestions;
        Object.keys(proportions).forEach(type => {
            randomCounts[type] = Math.round(lesson.randomQuestions * proportions[type]);
            remainingCount -= randomCounts[type];
        });

        // Adjust for rounding errors
        if (remainingCount > 0) {
            // Add remaining to the type with the most questions
            const maxType = Object.keys(sections).reduce((a, b) => 
                sections[a].questions.length > sections[b].questions.length ? a : b
            );
            randomCounts[maxType] += remainingCount;
        }

        // Shuffle and select questions for each type
        Object.keys(sections).forEach(type => {
            if (sections[type].questions.length > 0) {
                sections[type].questions = shuffleArray([...sections[type].questions])
                    .slice(0, randomCounts[type]);
            }
        });
    } else {
        // If no random selection, just shuffle all questions within their types
        Object.values(sections).forEach(section => {
            if (section.element) {
                section.questions = shuffleArray([...section.questions]);
            }
        });
    }
    
    // Clear existing questions
    Object.values(sections).forEach(section => {
        if (section.element) {
            section.element.innerHTML = `<h3>${section.element.querySelector('h3')?.textContent || ''}</h3>`;
        }
    });

    // Render questions for each section
    Object.entries(sections).forEach(([type, section]) => {
        if (!section.element) return;
        
        section.questions.forEach((q, index) => {
            const questionIndex = lesson.questions.indexOf(q);
            let questionHtml = `
                <div class="question" data-question-index="${questionIndex}">
                    <p><strong>Câu ${index + 1}.</strong></p>
            `;

            // --- START IMAGE PARSING ---
            let imageUrl = null;
            const imgRegex = /\[img\s+src="([^"]+)"\]/i;
            const match = q.question.match(imgRegex);

            if (match && match[1]) {
                imageUrl = match[1];
                // Remove the placeholder from the question text
                q.question = q.question.replace(imgRegex, '').trim();
            } else if (q.image) {
                // Fallback to existing q.image if no placeholder found
                imageUrl = q.image;
            }

            // Add question text *after* potentially modifying it
            questionHtml += `<p>${q.question}</p>`;
            // --- END IMAGE PARSING ---

            if (imageUrl) { // Check if we have an image URL from either source
                questionHtml += `
                    <div class="question-image-container">
                        <img src="${imageUrl}" alt="Question Image" style="max-width: 100%; margin: 10px 0;">
                    </div>
                `;
            }

            switch(type) {
                case 'abcd':
                    // Create shuffled options with their original indices
                    const optionsWithIndices = q.options.map((option, idx) => ({
                        text: option.text || option, // Handle both object and string format
                        originalIndex: idx,
                        letter: String.fromCharCode(65 + idx) // A, B, C, D
                    }));
                    const shuffledOptions = shuffleArray([...optionsWithIndices]);
                    
                    // Store the mapping for this question
                    window.questionMappings[questionIndex] = shuffledOptions.map(
                        (opt, newIndex) => ({
                            displayedLetter: String.fromCharCode(65 + newIndex),
                            originalLetter: opt.letter,
                            originalIndex: opt.originalIndex
                        })
                    );

                    questionHtml += shuffledOptions.map((option, idx) => `
                        <div class="option-row">
                            <input type="radio" 
                                   id="q${questionIndex}_${idx}"
                                   name="q${questionIndex}" 
                                   value="${String.fromCharCode(65 + idx)}">
                            <label for="q${questionIndex}_${idx}" class="option-label">
                                <span class="option-letter">${String.fromCharCode(65 + idx)}</span>
                                <span class="option-text">${option.text}</span>
                            </label>
                        </div>
                    `).join('');
                    break;

                    case 'truefalse':
                        if (Array.isArray(q.options)) {
                            // Multiple true/false options
                            questionHtml += `<div class="truefalse-options">`;
                            q.options.forEach((option, idx) => {
                                const optionText = option.text || option; // Handle both formats
                                questionHtml += `
                                    <div class="truefalse-option-box">
                                        <div class="option-text">${String.fromCharCode(65 + idx)}) ${optionText}</div>
                                        <div class="truefalse-buttons">
                                            <label class="option-button">
                                                <input type="radio" 
                                                       name="q${questionIndex}_${idx}" 
                                                       value="true">
                                                <span>Đúng</span>
                                            </label>
                                            <label class="option-button">
                                                <input type="radio" 
                                                       name="q${questionIndex}_${idx}" 
                                                       value="false">
                                                <span>Sai</span>
                                            </label>
                                        </div>
                                    </div>
                                `;
                            });
                            questionHtml += `</div>`;
                        } else {
                        // Single true/false question
                        questionHtml += `
                            <div class="form-group">
                                <select name="q${questionIndex}" required>
                                    <option value="">Select answer</option>
                                    <option value="true">True</option>
                                    <option value="false">False</option>
                                </select>
                            </div>
                        `;
                    }
                    break;

                case 'number':
                    questionHtml += `
                        <div class="number-input-container">
                            <input type="number" 
                                   name="q${questionIndex}" 
                                   class="modern-number-input"
                                   placeholder="Enter your answer..."
                                   required>
                        </div>
                    `;
                    break;
            }

            questionHtml += `</div>`;
            section.element.insertAdjacentHTML('beforeend', questionHtml);
        });

        if (section.questions.length === 0) {
            section.element.style.display = 'none';
        }
    });
    
    // Initialize KaTeX rendering after all questions are loaded
    if (typeof renderMathInElement === 'function') {
        // Target all sections that might contain math
        const mathContainers = document.querySelectorAll('#abcd-questions, #truefalse-questions, #number-questions');
        mathContainers.forEach(container => {
            renderMathInElement(container, {
                delimiters: [
                    {left: "$$", right: "$$", display: true},
                    {left: "$", right: "$", display: false},
                    {left: "\\(", right: "\\)", display: false},
                    {left: "\\[", right: "\\]", display: true}
                ],
                throwOnError: false
            });
        });
    }
}

async function initializeLesson() {
    // Check student authentication first
    const isAuthenticated = await checkStudentAuthentication();
    if (!isAuthenticated) {
        return; // Stop execution if not authenticated
    }
    
    showLoader(true);
    const lessonId = window.location.pathname.split('/')[2];
    document.title = 'Loading lesson...';
    
    try {
        const response = await fetch(`/api/lessons/${lessonId}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch lesson: ${response.status}`);
        }
        
        const lesson = await response.json();
        currentLessonData = lesson; // Store the lesson data
        
        if (lesson.error) {
            document.body.innerHTML = '<h1>Lesson not found</h1>';
            currentLessonData = null; // Clear data on error
            return;
        }
        
        document.title = lesson.title;
        const titleElement = document.getElementById('lesson-title');
        if (titleElement) {
            titleElement.textContent = lesson.title;
        }
        
        // Display lesson image if present
        if (lesson.lessonImage) {
            const imageContainer = document.getElementById('lesson-image-container');
            const imageElement = document.getElementById('lesson-image');
            imageElement.src = lesson.lessonImage;
            imageContainer.style.display = 'block';
        }
        
        // Add console log here to inspect the lesson object
        console.log('Lesson object before rendering:', JSON.stringify(lesson, null, 2)); 
        
        await renderQuestions(lesson);
        console.log('Lesson initialized successfully');

        // --- HIDE LOADER ---
        showLoader(false); // Hide loader AFTER main content is rendered

        // --- DEFERRED TAG FETCHING ---
        // Fetch tags *after* the main content is loaded and loader is hidden
        // This runs asynchronously and won't block the UI
        fetchTagsAndDisplay(lesson); // Call a new function to handle tags

        // Initialize auto-rendering for KaTeX and highlighting
        // These can run after the loader is hidden as well
        if (window.renderMathInElement) {
            renderMathInElement(document.body, {
                delimiters: [
                    {left: "$$", right: "$$", display: true},
                    {left: "$", right: "$", display: false},
                    {left: "\\(", right: "\\)", display: false},
                    {left: "\\[", right: "\\]", display: true}
                ],
                throwOnError: false
            });
        }
        if (window.hljs) {
            hljs.highlightAll();
        }

    } catch (error) {
        console.error('Error loading lesson:', error);
        document.body.innerHTML = `
            <h1>Error loading lesson</h1>
            <p>Error details: ${error.message}</p>
        `;
        showLoader(false); // Ensure loader is hidden on error
    }
}

// --- NEW Function for Deferred Tag Fetching and Display ---
async function fetchTagsAndDisplay(lesson) {
    try {
        console.log("Fetching tags in the background...");
        const tagsResponse = await fetch('/api/tags'); // Fetch all available tags
        if (tagsResponse.ok) {
            const allAvailableTags = await tagsResponse.json(); // Not used in this example, but fetched

            // Display the tags associated with *this* specific lesson
            const titleElement = document.getElementById('lesson-title');
            if (titleElement && Array.isArray(lesson.tags) && lesson.tags.length > 0) {
                 // Check if tags are already displayed to prevent duplicates if called multiple times
                 if (!document.querySelector('.lesson-tags')) {
                    const tagsHtml = `<div class="lesson-tags" style="margin-top: 5px; font-size: 0.9em; color: #555;">Tags: ${lesson.tags.map(tag => `<span style="background-color: #eee; padding: 2px 6px; border-radius: 4px; margin-right: 5px; display: inline-block;">${tag}</span>`).join('')}</div>`;
                    titleElement.insertAdjacentHTML('afterend', tagsHtml);
                    console.log("Lesson tags displayed:", lesson.tags);
                 }
             } else {
                 console.log("No tags associated with this lesson to display.");
             }
        } else {
             console.warn('Failed to fetch tags list:', tagsResponse.status);
        }
    } catch (tagError) {
        console.error('Error fetching or processing tags:', tagError);
    }
}
// --- END New Function ---

// Remove the old submitQuiz function and replace with new event listener setup
document.addEventListener('DOMContentLoaded', () => {
    showLoader(true); // Show loader immediately
    const submitButton = document.getElementById('submit-quiz-btn');
    if (submitButton) {
        // REMOVED: Get student info from localStorage
        // REMOVED: const studentInfo = JSON.parse(localStorage.getItem('studentInfo'));
        // REMOVED: if (!studentInfo) {
        // REMOVED:     // If no student info, redirect back to home
        // REMOVED:     window.location.href = '/';
        // REMOVED:     return;
        // REMOVED: }

        // Rest of your initialization code...
        // This function already handles authentication checks and potential redirects
        initializeLesson(); 

        submitButton.addEventListener('click', async () => {
            // Disable the submit button and provide visual feedback
            submitButton.disabled = true;
            submitButton.textContent = 'Đang nộp bài...';
            submitButton.style.opacity = '0.7'; // Dim the button slightly
            
            // Check if lesson data is available
            if (!currentLessonData) {
                console.error("Lesson data not loaded, cannot submit.");
                alert("Lỗi: Dữ liệu bài học chưa được tải. Vui lòng tải lại trang.");
                // Revert button state
                submitButton.disabled = false;
                submitButton.textContent = 'Nộp bài';
                submitButton.style.opacity = '1';
                return; 
            }
            
            try {
                // Get IP address
                const ipResponse = await fetch('https://api.ipify.org?format=json');
                const ipData = await ipResponse.json();
                
                const lessonId = currentLessonData.id;
                const lesson = currentLessonData;
                
                let score = 0;
                let totalPossiblePoints = 0;
                const startTime = performance.now();

                const quizResults = {
                    lessonId: lessonId,
                    questions: [],
                    ipAddress: ipData.ip,
                    submittedAt: new Date().toISOString()
                };

                // Get all displayed questions
                const questionElements = document.querySelectorAll('.question');
                questionElements.forEach((questionElement) => {
                    const originalIndex = parseInt(questionElement.dataset.questionIndex);
                    const q = lesson.questions[originalIndex];
                    
                    const questionPoints = (typeof q.points === 'number' && q.points > 0) ? q.points : 1;
                    totalPossiblePoints += questionPoints;

                    let userAnswer, correctAnswer, isCorrect, optionsText = null;

                    if (q.type === 'truefalse' && Array.isArray(q.options)) {
                        // --- NEW: Handle multi-option true/false ---
                        const userAnswersArray = q.options.map((_, idx) => {
                            const selectedInput = document.querySelector(`input[name="q${originalIndex}_${idx}"]:checked`);
                            return selectedInput ? selectedInput.value === 'true' : null; // Store boolean or null
                        });
                        
                        const correctAnswersArray = q.correct; // Should be an array of booleans
                        optionsText = q.options.map(opt => opt.text || opt); // Store option texts

                        // Determine overall correctness (all must be correct)
                        isCorrect = Array.isArray(correctAnswersArray) && 
                                    correctAnswersArray.every((correctAns, idx) => 
                                        userAnswersArray[idx] !== null && userAnswersArray[idx] === correctAns
                                    );

                        userAnswer = userAnswersArray; // Save array
                        correctAnswer = correctAnswersArray; // Save array
                        // --- END NEW ---

                    } else if (q.type === 'abcd') {
                        const selectedRadio = document.querySelector(`input[name="q${originalIndex}"]:checked`);
                        const selectedValue = selectedRadio ? selectedRadio.value : null;
                        
                        if (selectedValue) {
                            const mapping = window.questionMappings[originalIndex];
                            // Ensure mapping exists before trying to find
                            const selectedMapping = mapping ? mapping.find(m => m.displayedLetter === selectedValue) : null; 
                            
                            if (selectedMapping && q.options[selectedMapping.originalIndex]) {
                                const option = q.options[selectedMapping.originalIndex];
                                userAnswer = option.text || option; // Handle both formats
                                
                                const correctIndex = q.correct.toUpperCase().charCodeAt(0) - 65;
                                // Check if correct index is valid
                                if (correctIndex >= 0 && correctIndex < q.options.length) { 
                                    const correctOption = q.options[correctIndex];
                                    correctAnswer = correctOption.text || correctOption; // Handle both formats
                                    isCorrect = selectedMapping.originalIndex === correctIndex;
                                } else {
                                    // Handle case where q.correct is invalid
                                    console.warn(`Invalid correct answer letter '${q.correct}' for question index ${originalIndex}`);
                                    correctAnswer = 'Error: Invalid correct answer specified';
                                    isCorrect = false; 
                                }
                            } else {
                                // Handle case where mapping or option doesn't exist (shouldn't happen often)
                                console.warn(`Could not find mapping or option for selected value '${selectedValue}' in question index ${originalIndex}`);
                                userAnswer = selectedValue ? `Selected: ${selectedValue}` : 'No answer';
                                correctAnswer = 'Error: Could not determine correct answer';
                                isCorrect = false;
                            }
                        } else {
                            userAnswer = 'No answer';
                            const correctIndex = q.correct.toUpperCase().charCodeAt(0) - 65;
                            // Check if correct index is valid before accessing
                             if (correctIndex >= 0 && correctIndex < q.options.length) {
                                const correctOption = q.options[correctIndex];
                                correctAnswer = correctOption.text || correctOption;
                             } else {
                                 correctAnswer = 'Error: Invalid correct answer specified';
                             }
                            isCorrect = false;
                        }
                    } else if (q.type === 'number') {
                        const inputElement = document.querySelector(`[name="q${originalIndex}"]`);
                        userAnswer = inputElement ? inputElement.value : 'No input found'; // Handle missing input
                        correctAnswer = q.correct.toString();
                        // Strict comparison, ensure userAnswer is not empty
                        isCorrect = userAnswer !== '' && userAnswer === correctAnswer; 
                    } else if (q.type === 'truefalse' && !Array.isArray(q.options)) {
                         // --- Handle single true/false ---
                         const selectElement = document.querySelector(`select[name="q${originalIndex}"]`);
                         userAnswer = selectElement ? selectElement.value : 'No selection';
                         correctAnswer = q.correct.toString(); // q.correct should be true or false
                         isCorrect = userAnswer === correctAnswer;
                         // --- End single true/false ---
                    }

                    quizResults.questions.push({
                        type: q.type,
                        question: q.question,
                        userAnswer: userAnswer,
                        correctAnswer: correctAnswer,
                        isCorrect: isCorrect,
                        points: questionPoints,
                        earnedPoints: isCorrect ? questionPoints : 0,
                        optionsText: optionsText
                    });

                    if (isCorrect) {
                        score += questionPoints;
                    }
                });
                
                // Update final scores, time, and streak in the payload
                quizResults.totalPoints = totalPossiblePoints;
                quizResults.score = score;
                quizResults.timeTaken = (performance.now() - startTime) / 1000;
                quizResults.streak = getCurrentStreak(lessonId);

                // --- REVERTED: Call /api/results to save and trigger rating update server-side --- 
                try {
                    const saveResponse = await fetch('/api/results', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(quizResults)
                    });

                    if (!saveResponse.ok) {
                        const errorData = await saveResponse.json();
                        throw new Error(errorData.message || 'Failed to save results');
                    }

                    const resultData = await saveResponse.json();
                    
                    // Store minimal result in localStorage for potential use on result page
                    localStorage.setItem('quizResults', JSON.stringify({
                        lessonId: quizResults.lessonId,
                        score: quizResults.score,
                        totalPoints: quizResults.totalPoints,
                        resultId: resultData.resultId
                    })); 
                    
                    // Redirect to the result page
                    window.location.href = `/result/${resultData.resultId}`; 

                } catch (saveError) {
                    console.error('Error saving results:', saveError);
                    alert('Lỗi khi lưu kết quả: ' + saveError.message);
                    // Revert button state on save error
                    submitButton.disabled = false;
                    submitButton.textContent = 'Nộp bài';
                    submitButton.style.opacity = '1'; 
                    return; // Stop execution if saving failed
                }
                // --- END REVERT --- 

            } catch (error) {
                console.error('Error submitting quiz:', error);
                alert('An error occurred while submitting your quiz. Please try again.');
            } finally {
                // Ensure button is re-enabled even if redirection happens
                // Although redirection might make this less critical
                submitButton.disabled = false;
                submitButton.textContent = 'Nộp bài'; // Revert text back to Vietnamese
                submitButton.style.opacity = '1';
            }
        });
    }
});

function getCurrentStreak(lessonId) {
    try {
        const streakData = localStorage.getItem(`lesson_${lessonId}_streak`);
        if (streakData) {
            const { lastAttempt, streak } = JSON.parse(streakData);
            const now = new Date();
            const lastAttemptDate = new Date(lastAttempt);
            
            // Check if last attempt was yesterday or today
            const isConsecutiveDay = (
                (now.getDate() === lastAttemptDate.getDate() && now.getMonth() === lastAttemptDate.getMonth() && now.getFullYear() === lastAttemptDate.getFullYear()) ||
                (now.getDate() === lastAttemptDate.getDate() + 1 && now.getMonth() === lastAttemptDate.getMonth() && now.getFullYear() === lastAttemptDate.getFullYear())
            );
            
            return isConsecutiveDay ? streak + 1 : 1;
        }
    } catch (error) {
        console.error('Error getting streak:', error);
    }
    return 1;
}

function updateStreak(lessonId, score, totalPoints) {
    try {
        const currentStreak = getCurrentStreak(lessonId);
        const performance = score / totalPoints;
        
        // Only update streak if performance is good (e.g., > 70%)
        if (performance >= 0.7) {
            localStorage.setItem(`lesson_${lessonId}_streak`, JSON.stringify({
                lastAttempt: new Date().toISOString(),
                streak: currentStreak
            }));
        } else {
            // Reset streak if performance is poor
            localStorage.setItem(`lesson_${lessonId}_streak`, JSON.stringify({
                lastAttempt: new Date().toISOString(),
                streak: 1
            }));
        }
    } catch (error) {
        console.error('Error updating streak:', error);
    }
}

function showResultModal(quizResults) {
    // Implementation of showResultModal function
}

function storeResultInSession(quizResults) {
    // Implementation of storeResultInSession function
}