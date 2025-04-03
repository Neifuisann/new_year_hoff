let currentResult = null;

async function displayResults() {
    const resultData = JSON.parse(localStorage.getItem('quizResults'));
    if (!resultData) {
        document.getElementById('result').innerHTML = '<p class="no-results">No results found. Please take a quiz first.</p>';
        return;
    }

    // Get result ID from URL if it exists
    const resultId = window.location.pathname.split('/result/')[1];

    try {
        if (resultId) {
            // Fetch result from server
            const response = await fetch(`/api/results/${resultId}`);
            if (!response.ok) throw new Error('Result not found');
            currentResult = await response.json();
        } else {
            // Use the result from localStorage
            currentResult = resultData;
        }
        
        // Log the result for debugging
        console.log('Result data:', currentResult);
        
        // Update statistics cards
        updateStatisticsCards(currentResult);
        
        // Display results
        displaySortedResults('all');
    } catch (error) {
        console.error('Error loading results:', error);
        document.getElementById('result').innerHTML = '<p class="no-results">Result not found. Please try again.</p>';
    }
}

function updateStatisticsCards(result) {
    // Calculate statistics
    const totalQuestions = result.questions.length;
    const correctAnswers = result.questions.filter(q => q.isCorrect).length;
    const incorrectAnswers = totalQuestions - correctAnswers;
    const accuracy = ((correctAnswers / totalQuestions) * 100).toFixed(1);
    const score = result.score;
    const totalPoints = result.totalPoints;
    const scorePercentage = ((score / totalPoints) * 100).toFixed(1);

    // Update statistics cards
    document.getElementById('score-value').textContent = `${score}/${totalPoints}`;
    document.getElementById('correct-answers').textContent = correctAnswers;
    document.getElementById('incorrect-answers').textContent = incorrectAnswers;
    document.getElementById('accuracy').textContent = `${accuracy}%`;
}

function displaySortedResults(sortType) {
    if (!currentResult) return;

    // Update active button state
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[onclick="sortResults('${sortType}')"]`).classList.add('active');

    // Filter questions based on sort type
    const filteredQuestions = currentResult.questions.filter(question => {
        if (sortType === 'all') return true;
        if (sortType === 'correct') return question.isCorrect;
        if (sortType === 'incorrect') return !question.isCorrect;
        return true;
    });

    // Helper function to format answers with line breaks
    const formatAnswer = (answer, type) => {
        if (!answer) return 'No answer';
        
        if (typeof answer === 'object') {
            // If it's an object with text property, use that
            return answer.text || JSON.stringify(answer);
        }
        
        if (type === 'truefalse') {
            return answer.split('\n').map(line => line.trim()).join('<br>');
        }
        
        return answer;
    };

    // Generate HTML for filtered questions
    const resultHTML = filteredQuestions.map((question, index) => `
        <div class="question-card ${question.isCorrect ? 'correct' : 'incorrect'}">
            <div class="question-header">
                <div class="question-info">
                    <span class="question-number">Câu ${index + 1}</span>
                    <span class="result-indicator">
                        <i class="fas fa-${question.isCorrect ? 'check' : 'times'}"></i>
                    </span>
                </div>
            </div>
            
            <div class="question-content">
                <div class="question-top">
                    <p class="question-text">${question.question}</p>
                    <button class="explain-btn" 
                        data-question="${encodeURIComponent(question.question)}"
                        data-user-answer="${encodeURIComponent(formatAnswer(question.userAnswer, question.type))}"
                        data-correct-answer="${encodeURIComponent(formatAnswer(question.correctAnswer, question.type))}">
                        <i class="fas fa-lightbulb"></i>
                        <span>Xem giải thích (AI)</span>
                    </button>
                </div>
                
                <div class="answer-section">
                    <div class="answer-box user-answer ${question.isCorrect ? 'correct' : 'incorrect'}">
                        <div class="answer-label">
                            <i class="fas fa-user"></i>
                            Đã chọn
                        </div>
                        <div class="answer-text">${formatAnswer(question.userAnswer, question.type)}</div>
                    </div>
                    
                    <div class="answer-box correct-answer">
                        <div class="answer-label">
                            <i class="fas fa-check-circle"></i>
                            Đáp án
                        </div>
                        <div class="answer-text">${formatAnswer(question.correctAnswer, question.type)}</div>
                    </div>
                </div>
            </div>
            
            <div class="explanation-box" style="display: none;">
                <div class="explanation-content"></div>
            </div>
        </div>
    `).join('');

    document.getElementById('result').innerHTML = resultHTML;
    attachExplanationListeners();
}

function sortResults(sortType) {
    displaySortedResults(sortType);
}

async function getExplanation(button, question, userAnswer, correctAnswer) {
    const questionCard = button.closest('.question-card');
    const explanationBox = questionCard.querySelector('.explanation-box');
    const explanationContent = explanationBox.querySelector('.explanation-content');
    
    if (explanationContent.dataset.loaded === 'true') {
        explanationBox.style.display = explanationBox.style.display === 'none' ? 'block' : 'none';
        button.innerHTML = explanationBox.style.display === 'none' ? 
            '<i class="fas fa-lightbulb"></i><span>Hiện giải thích</span>' : 
            '<i class="fas fa-times"></i><span>Ẩn giải thích</span>';
        return;
    }
    
    explanationBox.style.display = 'block';
    button.innerHTML = '<div class="loading-spinner"></div><span>Đang suy nghĩ...</span>';
    button.disabled = true;
    
    try {
        // Decode the URL-encoded parameters
        const decodedQuestion = decodeURIComponent(button.dataset.question);
        const decodedUserAnswer = decodeURIComponent(button.dataset.userAnswer);
        const decodedCorrectAnswer = decodeURIComponent(button.dataset.correctAnswer);
        
        // Direct API call to Google Gemini API
        const API_KEY = "AIzaSyAxJF-5iBBx7gp9RPwrAfF58ERZi69KzCc"; // This is the same key from server-side
        const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent";
        
        const response = await fetch(`${GEMINI_URL}?key=${API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `Please explain this question step by step in Vietnamese. Please always give facts and if necessary, provide notes:
Question: ${decodedQuestion}
User's answer: ${decodedUserAnswer}
Correct answer: ${decodedCorrectAnswer}`
                    }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    topK: 64,
                    topP: 0.95,
                    maxOutputTokens: 8192
                }
            })
        });
        
        if (!response.ok) {
            const errorData = await response.text();
            console.error('Gemini API error:', {
                status: response.status,
                statusText: response.statusText,
                body: errorData
            });
            throw new Error(`API responded with status: ${response.status} - ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
            console.error('Invalid Gemini API response format:', data);
            throw new Error('Invalid response format from Gemini API');
        }
        
        const explanationText = data.candidates[0].content.parts[0].text;
        const htmlContent = marked.parse(explanationText);
        
        explanationContent.innerHTML = htmlContent;
        explanationContent.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightBlock(block);
        });
        explanationContent.dataset.loaded = 'true';
        button.innerHTML = '<i class="fas fa-times"></i><span>Ẩn giải thích</span>';
    } catch (error) {
        console.error('Error getting explanation:', error);
        explanationContent.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-circle"></i>
                Failed to load explanation: ${error.message}
                <button onclick="retryExplanation(this)" class="retry-btn">
                    <i class="fas fa-redo"></i> Try Again
                </button>
            </div>
        `;
    } finally {
        button.disabled = false;
    }
}

function retryExplanation(retryButton) {
    const explanationBox = retryButton.closest('.explanation-box');
    const questionCard = explanationBox.closest('.question-card');
    const explainButton = questionCard.querySelector('.explain-btn');
    
    explanationBox.querySelector('.explanation-content').dataset.loaded = 'false';
    explainButton.click();
}

function attachExplanationListeners() {
    document.querySelectorAll('.explain-btn').forEach(button => {
        button.addEventListener('click', async (e) => {
            e.preventDefault();
            await getExplanation(button, button.dataset.question, button.dataset.userAnswer, button.dataset.correctAnswer);
        });
    });
}

document.addEventListener('DOMContentLoaded', displayResults);