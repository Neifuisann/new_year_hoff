// Store shuffled options mapping globally
window.questionMappings = {};

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

    // Group and shuffle all questions by type
    lesson.questions.forEach(q => sections[q.type]?.questions.push(q));
    
    // Shuffle questions within each type group
    Object.values(sections).forEach(section => {
        if (section.element) {
            section.questions = shuffleArray([...section.questions]);
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
        submitButton.addEventListener('click', async () => {
            try {
                const lessonId = window.location.pathname.split('/')[2];
                const response = await fetch(`/api/lessons/${lessonId}`);
                if (!response.ok) {
                    throw new Error(`Failed to fetch lesson: ${response.status}`);
                }
                const lesson = await response.json();
                let score = 0;
                let resultHtml = '';
                
                // Create separate results for each question type
                const sections = {
                    abcd: { title: 'Multiple Choice Questions', questions: [], count: 0 },
                    truefalse: { title: 'True/False Questions', questions: [], count: 0 },
                    number: { title: 'Numerical Questions', questions: [], count: 0 }
                };
                
                // Get all question elements and process them
                const questionElements = document.querySelectorAll('.question');
                
                questionElements.forEach((questionElement) => {
                    const originalIndex = parseInt(questionElement.dataset.questionIndex);
                    const q = lesson.questions[originalIndex];
                    
                    let isCorrect = false;
                    let userAnswer = '';
                    let correctAnswer = '';
                    
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

                    // Store structured data for results page
                    const quizResults = {
                        questions: [],
                        totalPoints: 0,
                        score: 0
                    };

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
                    
                    sections[q.type].count++;
                    sections[q.type].questions.push(`
                        <div class="question-result ${isCorrect ? 'correct' : 'incorrect'}">
                            <p><strong>Question ${sections[q.type].count}:</strong> ${q.question}</p>
                            <p>Your answer:</p>
                            <pre>${userAnswer}</pre>
                            <p>Correct answer:</p>
                            <pre>${correctAnswer}</pre>
                            <p>Points: ${isCorrect ? q.points : 0}/${q.points}</p>
                            <button class="explain-btn" 
                                    data-question="${q.question}" 
                                    data-user-answer="${userAnswer}" 
                                    data-correct-answer="${correctAnswer}">
                                Get AI Explanation
                            </button>
                            <div class="explanation-box" style="display: none;">
                                <div class="explanation-content"></div>
                            </div>
                        </div>
                    `);
                });
                
                // Combine all sections into final HTML
                resultHtml = '<h3>Quiz Results</h3>';
                Object.entries(sections).forEach(([type, section]) => {
                    if (section.questions.length > 0) {
                        resultHtml += `
                            <div class="result-section">
                                <h4>${section.title}</h4>
                                ${section.questions.join('')}
                            </div>
                        `;
                    }
                });
                
                const totalPoints = lesson.questions.reduce((sum, q) => sum + q.points, 0);
                resultHtml += `
                    <div class="final-score">
                        <h3>Final Score: ${score}/${totalPoints} (${Math.round(score/totalPoints * 100)}%)</h3>
                    </div>
                `;
                
                // Store results in localStorage and redirect to results page
                const quizResults = {
                    questions: [],
                    totalPoints: totalPoints,
                    score: score
                };

                questionElements.forEach((questionElement) => {
                    const originalIndex = parseInt(questionElement.dataset.questionIndex);
                    const q = lesson.questions[originalIndex];
                    
                    let isCorrect = false;
                    let userAnswer = '';
                    let correctAnswer = '';
                    
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
                });

                localStorage.setItem('quizResults', JSON.stringify(quizResults));
                window.location.href = '/result';
            } catch (error) {
                console.error('Error in quiz submission:', error);
                alert('Error submitting quiz. Please try again.');
            }
        });
    }
});

// Initialize the lesson when the page loads
document.addEventListener('DOMContentLoaded', initializeLesson);