// Store shuffled options mapping globally
window.questionMappings = {};

function currentLang() {
    return localStorage.getItem('language') || 'en';
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
                    <p><strong>Question ${index + 1}.</strong></p>
                    <p>${q.question}</p>
            `;

            if (q.image) {
                questionHtml += `
                    <div class="question-image-container">
                        <img src="${q.image}" alt="Question Image" style="max-width: 100%; margin: 10px 0;">
                    </div>
                `;
            }

            switch(type) {
                case 'abcd':
                    // Create shuffled options with their original indices
                    const optionsWithIndices = q.options.map((text, idx) => ({
                        text,
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
                                questionHtml += `
                                    <div class="truefalse-option-box">
                                        <div class="option-text">${String.fromCharCode(65 + idx)}) ${option}</div>
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
}

async function initializeLesson() {
    const lessonId = window.location.pathname.split('/')[2];
    document.title = 'Loading lesson...';
    
    try {
        const response = await fetch(`/api/lessons/${lessonId}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch lesson: ${response.status}`);
        }
        
        const lesson = await response.json();
        
        if (lesson.error) {
            document.body.innerHTML = '<h1>Lesson not found</h1>';
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
        
        await renderQuestions(lesson);
        console.log('Lesson initialized successfully');
    } catch (error) {
        console.error('Error loading lesson:', error);
        document.body.innerHTML = `
            <h1>Error loading lesson</h1>
            <p>Error details: ${error.message}</p>
        `;
    }
}

// Remove the old submitQuiz function and replace with new event listener setup
document.addEventListener('DOMContentLoaded', () => {
    const submitButton = document.getElementById('submit-quiz-btn');
    if (submitButton) {
        // Get student info from localStorage
        const studentInfo = JSON.parse(localStorage.getItem('studentInfo'));
        if (!studentInfo) {
            // If no student info, redirect back to home
            window.location.href = '/';
            return;
        }

        // Rest of your initialization code...
        initializeLesson();

        submitButton.addEventListener('click', async () => {
            // Disable the submit button to prevent multiple submissions
            submitButton.disabled = true;
            
            try {
                // Get IP address
                const ipResponse = await fetch('https://api.ipify.org?format=json');
                const ipData = await ipResponse.json();
                
                const lessonId = window.location.pathname.split('/')[2];
                const response = await fetch(`/api/lessons/${lessonId}`);
                if (!response.ok) {
                    throw new Error(`Failed to fetch lesson: ${response.status}`);
                }
                const lesson = await response.json();
                let score = 0;
                let totalPossiblePoints = 0;
                let resultHtml = '';

                const quizResults = {
                    lessonId: lessonId,
                    questions: [],
                    studentInfo: JSON.parse(localStorage.getItem('studentInfo')),
                    ipAddress: ipData.ip,
                    submittedAt: new Date().toISOString()
                };

                // Get all displayed questions
                const questionElements = document.querySelectorAll('.question');
                questionElements.forEach((questionElement) => {
                    const originalIndex = parseInt(questionElement.dataset.questionIndex);
                    const q = lesson.questions[originalIndex];
                    totalPossiblePoints += q.points;
                    let userAnswer, correctAnswer, isCorrect;

                    if (q.type === 'truefalse' && Array.isArray(q.options)) {
                        const userAnswers = q.options.map((_, idx) => {
                            const selectedInput = document.querySelector(`input[name="q${originalIndex}_${idx}"]:checked`);
                            return selectedInput ? selectedInput.value === 'true' : null;
                        });
                        
                        isCorrect = Array.isArray(q.correct) && q.correct.every((correctAns, idx) => 
                            userAnswers[idx] !== null && userAnswers[idx] === correctAns
                        );
                        
                        userAnswer = q.options.map((opt, idx) => 
                            `${String.fromCharCode(65 + idx)}: ${opt} - ${userAnswers[idx] ? 'True' : 'False'}`
                        ).join('\n');
                        
                        correctAnswer = q.options.map((opt, idx) => 
                            `${String.fromCharCode(65 + idx)}: ${opt} - ${q.correct[idx] ? 'True' : 'False'}`
                        ).join('\n');
                    } else if (q.type === 'abcd') {
                        const selectedRadio = document.querySelector(`input[name="q${originalIndex}"]:checked`);
                        const selectedValue = selectedRadio ? selectedRadio.value : null;
                        
                        if (selectedValue) {
                            const mapping = window.questionMappings[originalIndex];
                            const selectedMapping = mapping.find(m => m.displayedLetter === selectedValue);
                            
                            if (selectedMapping) {
                                userAnswer = q.options[selectedMapping.originalIndex];
                                const correctIndex = q.correct.toUpperCase().charCodeAt(0) - 65;
                                correctAnswer = q.options[correctIndex];
                                isCorrect = selectedMapping.originalIndex === correctIndex;
                            }
                        } else {
                            userAnswer = 'No answer';
                            correctAnswer = q.options[q.correct.toUpperCase().charCodeAt(0) - 65];
                        }
                    } else if (q.type === 'number') {
                        userAnswer = document.querySelector(`[name="q${originalIndex}"]`).value || 'No answer';
                        correctAnswer = q.correct.toString();
                        isCorrect = userAnswer === correctAnswer;
                    }

                    quizResults.questions.push({
                        type: q.type,
                        question: q.question,
                        userAnswer: userAnswer,
                        correctAnswer: correctAnswer,
                        isCorrect: isCorrect,
                        points: q.points,
                        earnedPoints: isCorrect ? q.points : 0
                    });

                    if (isCorrect) {
                        score += q.points;
                    }
                });
                
                // Update final scores using only displayed questions
                quizResults.totalPoints = totalPossiblePoints;
                quizResults.score = score;

                try {
                    // Save results to server
                    const saveResponse = await fetch('/api/results', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(quizResults)
                    });

                    if (!saveResponse.ok) {
                        throw new Error('Failed to save results');
                    }

                    const resultData = await saveResponse.json();
                    localStorage.setItem('quizResults', JSON.stringify(quizResults));
                    window.location.href = `/result/${resultData.resultId}`;
                } catch (error) {
                    console.error('Error in quiz submission:', error);
                    alert('Error submitting quiz. Please try again.');
                }
            } catch (error) {
                console.error('Error in quiz submission:', error);
                alert('Error submitting quiz. Please try again.');
            } finally {
                // Re-enable the submit button if there was an error
                submitButton.disabled = false;
            }
        });
    }
});

// Initialize the lesson when the page loads
document.addEventListener('DOMContentLoaded', initializeLesson);

// Update the renderQuestion function to handle translations
function renderQuestion(question, index, type) {
    const questionDiv = document.createElement('div');
    questionDiv.className = 'question';
    
    // Translate question type labels
    const typeLabels = {
        'abcd': translations[currentLang()].multipleChoiceQuestions,
        'truefalse': translations[currentLang()].trueFalseQuestions,
        'number': translations[currentLang()].numericalQuestions
    };

    let html = `<p><strong>Q${index + 1}:</strong> ${question.question}</p>`;
    
    if (type === 'abcd') {
        html += `<div class="options-grid">`;
        question.options.forEach((option, i) => {
            const letter = String.fromCharCode(65 + i);
            html += `
                <div class="option-row">
                    <input type="radio" name="q${index}" value="${i}" id="q${index}o${i}">
                    <label class="option-label" for="q${index}o${i}">
                        <span class="option-letter">${letter}</span>
                        <span class="option-text">${option}</span>
                    </label>
                </div>`;
        });
        html += `</div>`;
    } else if (type === 'truefalse') {
        html += `
            <div class="truefalse-option-group">
                <div class="true-option">
                    <input type="radio" name="q${index}" value="true" id="q${index}true">
                    <label class="option-label" for="q${index}true">
                        <span class="option-icon">✓</span>
                        ${translations[currentLang()].true || 'True'}
                    </label>
                </div>
                <div class="false-option">
                    <input type="radio" name="q${index}" value="false" id="q${index}false">
                    <label class="option-label" for="q${index}false">
                        <span class="option-icon">✗</span>
                        ${translations[currentLang()].false || 'False'}
                    </label>
                </div>
            </div>`;
    } else if (type === 'number') {
        html += `
            <div class="number-input-container">
                <input type="number" class="modern-number-input" name="q${index}" 
                       placeholder="${translations[currentLang()].enterNumber || 'Enter your answer...'}"
                       step="any">
            </div>`;
    }
    
    questionDiv.innerHTML = html;
    return questionDiv;
}

// Update the loadLesson function
async function loadLesson() {
    try {
        const lessonId = window.location.pathname.split('/').pop();
        const response = await fetch(`/api/lessons/${lessonId}`);
        const lesson = await response.json();
        
        document.getElementById('lesson-title').textContent = lesson.title;
        
        if (lesson.questions) {
            lesson.questions.forEach((question, index) => {
                const container = document.getElementById(`${question.type}-questions`);
                if (container) {
                    container.appendChild(renderQuestion(question, index, question.type));
                }
            });
        }
        
        // Update translations after rendering dynamic content
        updateTexts(currentLang());
    } catch (error) {
        console.error('Error loading lesson:', error);
    }
}

// Add translation keys for lesson-specific content
if (typeof translations !== 'undefined') {
    Object.keys(translations).forEach(lang => {
        translations[lang] = {
            ...translations[lang],
            true: lang === 'vi' ? 'Đúng' : 'True',
            false: lang === 'vi' ? 'Sai' : 'False',
            enterNumber: lang === 'vi' ? 'Nhập câu trả lời của bạn...' : 'Enter your answer...',
            invalidCredentials: lang === 'vi' ? 'Thông tin không hợp lệ' : 'Invalid credentials'
        };
    });
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    loadLesson();
});