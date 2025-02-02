let currentResult = null;

async function displayResults() {
    const resultData = JSON.parse(localStorage.getItem('quizResults'));
    if (!resultData) {
        document.getElementById('result').innerHTML = '<p>No results found. Please take a quiz first.</p>';
        return;
    }

    // Get result ID from URL if it exists
    const resultId = window.location.pathname.split('/result/')[1];

    if (resultId) {
        // Fetch result from server
        try {
            const response = await fetch(`/api/results/${resultId}`);
            if (!response.ok) throw new Error('Result not found');
            const serverResult = await response.json();
            currentResult = serverResult;
            displaySortedResults('all');
        } catch (error) {
            document.getElementById('result').innerHTML = '<p>Result not found. Please try again.</p>';
            return;
        }
    } else {
        // Just display the result from localStorage
        currentResult = resultData;
        displaySortedResults('all');
    }
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
    const resultHTML = `
        <div class="final-score">
            <h3>Final Score: ${currentResult.score}/${currentResult.totalPoints} 
            (${Math.round(currentResult.score/currentResult.totalPoints * 100)}%)</h3>
        </div>
        <div class="submission-details">
            <p><strong>Student Name:</strong> ${currentResult.studentInfo.name}</p>
            <p><strong>Submitted From:</strong> ${currentResult.ipAddress || 'Not available'}</p>
            <p><strong>Submitted At:</strong> ${new Date(currentResult.submittedAt).toLocaleString()}</p>
        </div>
        ${filteredQuestions.map((question, index) => `
            <div class="question-container ${question.isCorrect ? 'correct' : 'incorrect'}">
                <div class="question-header-container">
                    <div class="question-header">Question ${index + 1}</div>
                    <div class="explain-btn-container">
                        <button class="explain-btn" 
                            data-question="${encodeURIComponent(question.question)}"
                            data-user-answer="${encodeURIComponent(question.userAnswer)}"
                            data-correct-answer="${encodeURIComponent(question.correctAnswer)}">
                            Get AI Explanation
                        </button>
                    </div>
                </div>
                <div class="explanation-box" style="display: none;">
                    <div class="explanation-content"></div>
                </div>
                <div class="question-content">
                    <p class="question-text">${question.question}</p>
                    <p class="user-answer ${question.isCorrect ? 'correct' : 'incorrect'}">
                        Your Answer:<br>
                        ${formatAnswer(question.userAnswer, question.type)}
                    </p>
                    <p class="correct-answer">
                        Correct Answer:<br>
                        ${formatAnswer(question.correctAnswer, question.type)}
                    </p>
                </div>
            </div>
        `).join('')}
    `;

    document.getElementById('result').innerHTML = resultHTML;
    attachExplanationListeners();
}

function sortResults(sortType) {
    displaySortedResults(sortType);
}

async function getExplanation(button, question, userAnswer, correctAnswer) {
    const questionContainer = button.closest('.question-container');
    const explanationBox = questionContainer.querySelector('.explanation-box');
    const explanationContent = explanationBox.querySelector('.explanation-content');
    
    if (explanationContent.dataset.loaded === 'true') {
        explanationBox.style.display = explanationBox.style.display === 'none' ? 'block' : 'none';
        button.textContent = explanationBox.style.display === 'none' ? 'Get AI Explanation' : 'Hide AI Explanation';
        return;
    }
    
    explanationBox.style.display = 'block';
    button.innerHTML = '<div class="loading-spinner"></div>Loading explanation...';
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
            }, null, 2)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.details || data.error || 'Failed to get explanation');
        }
        
        if (!data.explanation) {
            throw new Error('Invalid response format');
        }

        // Convert the explanation text to proper UTF-8
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
        button.textContent = 'Hide AI Explanation';
    } catch (error) {
        console.error('Error:', error);
        explanationContent.innerHTML = `
            <div class="error-message">
                Failed to load explanation: ${error.message}
                <button onclick="retryExplanation(this)" class="retry-btn">
                    Try Again
                </button>
            </div>
        `;
    } finally {
        button.disabled = false;
        button.textContent = explanationContent.dataset.loaded ? 'Hide AI Explanation' : 'Get AI Explanation';
    }
}

function retryExplanation(retryButton) {
    const explanationBox = retryButton.closest('.explanation-box');
    const questionContainer = explanationBox.closest('.question-container');
    const explainButton = questionContainer.querySelector('.explain-btn');
    
    // Reset the loaded state
    explanationBox.querySelector('.explanation-content').dataset.loaded = 'false';
    
    // Trigger the explanation request again
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