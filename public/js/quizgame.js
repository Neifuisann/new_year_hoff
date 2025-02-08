let currentQuestion = 0;
let questions = [];
let score = 0;
let timer;
let timeLeft; // Add this to track remaining time
const QUESTION_TIME = 30; // seconds per question
const MAX_POINTS = 50; // maximum points possible per question

async function initQuiz() {
    try {
        const response = await fetch('/api/quiz');
        const data = await response.json();
        
        // Shuffle all questions using Fisher-Yates algorithm
        const shuffled = [...data.questions];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        
        // Take only the first 20 questions
        questions = shuffled.slice(0, 20);
        
        showQuestion();
        updateProgress();
    } catch (error) {
        console.error('Failed to load quiz:', error);
    }
}

function showQuestion() {
    if (currentQuestion >= questions.length) {
        endQuiz();
        return;
    }

    const question = questions[currentQuestion];
    document.querySelector('.question-text').textContent = question.question;
    
    const imageContainer = document.querySelector('.question-image-container');
    if (question.image && question.image !== 'null' && question.image !== '' && 
        !question.image.includes('undefined') && !question.image.includes('admin/quiz')) {
        const img = document.createElement('img');
        img.src = question.image;
        img.className = 'question-image';
        imageContainer.innerHTML = '';
        imageContainer.appendChild(img);
        imageContainer.style.display = 'block';
    } else {
        imageContainer.style.display = 'none';
        imageContainer.innerHTML = '';
    }

    document.querySelectorAll('.option-btn').forEach(btn => {
        btn.disabled = false;
        btn.classList.remove('correct', 'incorrect');
    });

    // Start timer
    startTimer();
}

function startTimer() {
    timeLeft = QUESTION_TIME;
    const progressBar = document.querySelector('.progress');
    
    if (timer) clearInterval(timer);
    
    timer = setInterval(() => {
        timeLeft -= 0.1;
        const percentage = (timeLeft / QUESTION_TIME) * 100;
        progressBar.style.width = `${percentage}%`;
        
        // Calculate color transition from green to red
        const hue = (timeLeft / QUESTION_TIME) * 120; // 120 is green, 0 is red in HSL
        progressBar.style.backgroundColor = `hsl(${hue}, 80%, 45%)`;
        
        if (timeLeft <= 0) {
            clearInterval(timer);
            handleAnswer(null); // No answer selected
        }
    }, 100);
}

function updateScoreDisplay(newScore) {
    const scoreValue = document.querySelector('.score-value');
    scoreValue.textContent = newScore;
    scoreValue.classList.remove('score-update');
    void scoreValue.offsetWidth; // Trigger reflow
    scoreValue.classList.add('score-update');
}

function createFirework(x, y) {
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
    const firework = document.createElement('div');
    firework.className = 'firework';
    firework.style.left = x + 'px';
    firework.style.top = y + 'px';
    firework.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    document.querySelector('.fireworks-container').appendChild(firework);

    // Create particles
    for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        const angle = (Math.PI * 2 * i) / 20;
        const velocity = 50 + Math.random() * 50;
        particle.style.setProperty('--tx', Math.cos(angle) * velocity + 'px');
        particle.style.setProperty('--ty', Math.sin(angle) * velocity + 'px');
        firework.appendChild(particle);
    }

    // Remove firework after animation
    setTimeout(() => {
        firework.remove();
    }, 1000);
}

function celebrate() {
    const container = document.querySelector('.fireworks-container');
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Create multiple fireworks
    for (let i = 0; i < 3; i++) {
        setTimeout(() => {
            const x = Math.random() * width;
            const y = height - Math.random() * height / 2;
            createFirework(x, y);
        }, i * 200);
    }
}

function handleAnswer(answer) {
    clearInterval(timer);
    const question = questions[currentQuestion];
    
    // Store user's answer
    question.userAnswer = answer;
    
    // Disable buttons
    document.querySelectorAll('.option-btn').forEach(btn => btn.disabled = true);
    
    // Show correct/incorrect
    const isCorrect = answer === question.correct;
    if (isCorrect) {
        // Calculate points based on time
        let earnedPoints;
        if (timeLeft >= 20) {
            // First 10 seconds (timeLeft between 30-20): full 50 points
            earnedPoints = MAX_POINTS;
        } else {
            // After 20 seconds remaining, scale points from 50 to 0
            earnedPoints = Math.round(MAX_POINTS * (timeLeft / 20));
        }
        
        score += earnedPoints;
        // Store earned points in question object for results
        question.earnedPoints = earnedPoints;
        
        // Update score display with animation
        updateScoreDisplay(score);
        
        // Show celebration animation
        celebrate();
    } else {
        question.earnedPoints = 0;
    }
    
    // Highlight correct answer
    const buttons = document.querySelectorAll('.option-btn');
    buttons.forEach(btn => {
        const isTrue = btn.classList.contains('true-btn');
        if (isTrue === question.correct) {
            btn.classList.add('correct');
        } else {
            btn.classList.add('incorrect');
        }
    });

    // If answer is incorrect, end quiz after a short delay
    // If answer is correct, continue to next question
    setTimeout(() => {
        if (!isCorrect) {
            endQuiz();
        } else {
            currentQuestion++;
            showQuestion();
            updateProgress();
        }
    }, 1500);
}

function updateProgress() {
    const progress = ((currentQuestion) / questions.length) * 100;
    document.querySelector('.progress').style.width = `${progress}%`;
    
    // Update milestone highlights
    document.querySelectorAll('.milestone').forEach(milestone => {
        const target = parseInt(milestone.textContent);
        if (currentQuestion >= target) {
            milestone.classList.add('reached');
        }
    });
}

function endQuiz() {
    clearInterval(timer);
    const studentInfo = JSON.parse(localStorage.getItem('studentInfo'));
    
    fetch('https://api.ipify.org?format=json')
        .then(response => response.json())
        .then(ipData => {
            const quizResults = {
                studentInfo: studentInfo,
                ipAddress: ipData.ip,
                submittedAt: new Date().toISOString(),
                totalPoints: MAX_POINTS * 20, // 20 questions * 50 points each = 1000 total possible points
                score: score,
                // Only include questions up to currentQuestion + 1 (the last question attempted)
                questions: questions.slice(0, currentQuestion + 1).map((q, i) => ({
                    type: 'truefalse',
                    question: q.question,
                    userAnswer: formatTrueFalseAnswer(q.userAnswer),
                    correctAnswer: formatTrueFalseAnswer(q.correct),
                    isCorrect: q.userAnswer === q.correct,
                    points: MAX_POINTS, // Each question is worth 50 points max
                    earnedPoints: q.earnedPoints || 0
                }))
            };

            localStorage.setItem('quizResults', JSON.stringify(quizResults));

            return fetch('/api/results', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(quizResults)
            });
        })
        .then(response => {
            if (!response.ok) throw new Error('Failed to submit quiz');
            return response.json();
        })
        .then(data => {
            if (data && data.resultId) {
                window.location.href = `/result/${data.resultId}`;
            } else {
                throw new Error('No result ID received');
            }
        })
        .catch(error => {
            console.error('Error submitting results:', error);
            alert('Error submitting quiz. Please try again.');
        });
}

// Add this helper function to format true/false answers
function formatTrueFalseAnswer(value) {
    if (value === true) return 'Đúng';
    if (value === false) return 'Sai';
    return 'Không trả lời';
}

// Event listeners
document.querySelector('.true-btn').addEventListener('click', () => handleAnswer(true));
document.querySelector('.false-btn').addEventListener('click', () => handleAnswer(false));

// Initialize quiz when student info is available
if (localStorage.getItem('studentInfo')) {
    initQuiz();
} else {
    document.getElementById('student-info-modal').style.display = 'block';
}

document.addEventListener('DOMContentLoaded', () => {
    // Handle student info form submission
    document.getElementById('student-info-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const studentInfo = {
            name: document.getElementById('student-name').value,
            dob: document.getElementById('student-dob').value,
            studentId: document.getElementById('student-id').value
        };
        localStorage.setItem('studentInfo', JSON.stringify(studentInfo));
        document.getElementById('student-info-modal').style.display = 'none';
        initQuiz();
    });

    const trueArea = document.querySelector('.true-area');
    const falseArea = document.querySelector('.false-area');
    const trueBtn = document.querySelector('.true-btn');
    const falseBtn = document.querySelector('.false-btn');

    trueArea.addEventListener('click', () => trueBtn.click());
    falseArea.addEventListener('click', () => falseBtn.click());
}); 