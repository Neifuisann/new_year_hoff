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
        
        // Update statistics cards
        updateStatisticsCards(currentResult);
        
        // Display results
        displaySortedResults('all');
    } catch (error) {
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
                        data-user-answer="${encodeURIComponent(question.userAnswer)}"
                        data-correct-answer="${encodeURIComponent(question.correctAnswer)}">
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
        const response = await fetch('/api/explain', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json; charset=utf-8',
            },
            body: JSON.stringify({ 
                question: decodeURIComponent(button.dataset.question), 
                userAnswer: decodeURIComponent(button.dataset.userAnswer), 
                correctAnswer: decodeURIComponent(button.dataset.correctAnswer) 
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.details || data.error || 'Failed to get explanation');
        }
        
        if (!data.explanation) {
            throw new Error('Invalid response format');
        }

        const decoder = new TextDecoder('utf-8');
        const encoder = new TextEncoder();
        const bytes = encoder.encode(data.explanation);
        const decodedExplanation = decoder.decode(bytes);

        const htmlContent = marked.parse(decodedExplanation);
        explanationContent.innerHTML = htmlContent;
        explanationContent.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightBlock(block);
        });
        explanationContent.dataset.loaded = 'true';
        button.innerHTML = '<i class="fas fa-times"></i><span>Ẩn giải thích</span>';
    } catch (error) {
        console.error('Error:', error);
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