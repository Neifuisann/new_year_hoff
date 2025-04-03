let currentQuestion = 0;
let questions = [];
let score = 0;
let timer;
let timeLeft;
let isPaused = false;
let currentMusicIndex = 0;
let isTabActive = true;
let correctStreak = 0;
const QUESTION_TIME = 30;
const MAX_POINTS = 50;
const CELEBRATION_TIME = 5000; // 5 seconds for celebration
const backgroundMusics = ['background-music-1', 'background-music-2', 'background-music-3'];
const celebrationMusics = ['celebration-music-1', 'celebration-music-2', 'celebration-music-3'];

// Handle tab visibility change
document.addEventListener('visibilitychange', () => {
    isTabActive = !document.hidden;
});

function pauseQuiz() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
    stopAllMusic();
}

function resumeQuiz() {
    if (!timer && !isPaused) {
        startTimer();
        playBackgroundMusic();
    }
}

function playBackgroundMusic() {
    stopAllMusic();
    const audio = document.getElementById(backgroundMusics[currentMusicIndex]);
    audio.currentTime = QUESTION_TIME - timeLeft;
    audio.play();
}

function playCorrectSound() {
    stopAllMusic();
    const soundIndex = Math.min(correctStreak, 5);
    const audio = document.getElementById(`correct-${soundIndex}`);
    audio.play();
}

function playIncorrectSound() {
    stopAllMusic();
    const audio = document.getElementById('incorrect');
    audio.play();
}

function playPointsSound() {
    const audio = document.getElementById('points');
    audio.currentTime = 0;
    audio.play();
}

function playCelebrationMusic() {
    stopAllMusic();
    const randomIndex = Math.floor(Math.random() * celebrationMusics.length);
    const audio = document.getElementById(celebrationMusics[randomIndex]);
    audio.play();
}

function stopAllMusic() {
    const allAudios = document.getElementsByTagName('audio');
    for (let audio of allAudios) {
        audio.pause();
        audio.currentTime = 0;
    }
}

function updateQuestionCounter() {
    document.getElementById('current-question').textContent = currentQuestion + 1;
}

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

    // Render LaTeX in the question
    if (typeof renderMathInElement === 'function') {
        renderMathInElement(document.querySelector('.question-text'), {
            delimiters: [
                {left: "$$", right: "$$", display: true},
                {left: "$", right: "$", display: false},
                {left: "\\(", right: "\\)", display: false},
                {left: "\\[", right: "\\]", display: true}
            ],
            throwOnError: false
        });
    }

    // Start timer
    startTimer();
}

function startTimer() {
    timeLeft = QUESTION_TIME;
    const progressBar = document.querySelector('.progress');
    const timerDisplay = document.querySelector('.timer-value');
    
    if (timer) clearInterval(timer);
    
    playBackgroundMusic();
    
    timer = setInterval(() => {
        timeLeft -= 0.1;
        const percentage = (timeLeft / QUESTION_TIME) * 100;
        progressBar.style.width = `${percentage}%`;
        
        // Update timer display
        timerDisplay.textContent = Math.ceil(timeLeft);
        
        // Calculate color transition from green to red
        const hue = (timeLeft / QUESTION_TIME) * 120;
        progressBar.style.backgroundColor = `hsl(${hue}, 80%, 45%)`;
        
        if (timeLeft <= 0) {
            clearInterval(timer);
            handleAnswer(null);
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

async function showCelebration(milestone) {
    isPaused = true;
    pauseQuiz();
    
    const overlay = document.querySelector('.celebration-overlay');
    const milestoneSpan = overlay.querySelector('.milestone-number');
    milestoneSpan.textContent = milestone;
    overlay.style.display = 'flex';
    
    // Initialize AOS
    AOS.init();
    
    // Play celebration music
    playCelebrationMusic();
    
    // Wait for celebration duration
    await new Promise(resolve => setTimeout(resolve, CELEBRATION_TIME));
    
    // Hide celebration overlay
    overlay.style.display = 'none';
    
    isPaused = false;
    if (isTabActive) {
        resumeQuiz();
    }
}

function handleAnswer(answer) {
    clearInterval(timer);
    stopAllMusic();
    
    const question = questions[currentQuestion];
    question.userAnswer = answer;
    
    document.querySelectorAll('.option-btn').forEach(btn => btn.disabled = true);
    
    const isCorrect = answer === question.correct;
    if (isCorrect) {
        correctStreak++;
        let earnedPoints = timeLeft >= 20 ? MAX_POINTS : Math.round(MAX_POINTS * (timeLeft / 20));
        score += earnedPoints;
        question.earnedPoints = earnedPoints;
        updateScoreDisplay(score);
        // Show a big score display overlay in the center with a zoom-in effect
        const scoreDisplayEl = document.querySelector('.score-display');
        scoreDisplayEl.style.display = 'block';
        scoreDisplayEl.style.position = 'fixed';
        scoreDisplayEl.style.top = '50%';
        scoreDisplayEl.style.left = '50%';
        scoreDisplayEl.style.zIndex = '1000';
        scoreDisplayEl.style.transformOrigin = 'center center';
        scoreDisplayEl.style.transition = 'transform 0.3s ease-out';
        scoreDisplayEl.style.transform = 'translate(-50%, -50%) scale(2)';
        requestAnimationFrame(() => {
            scoreDisplayEl.style.transform = 'translate(-50%, -50%) scale(2)';
        });
        setTimeout(() => {
            scoreDisplayEl.style.display = 'none';
            scoreDisplayEl.style.position = '';
            scoreDisplayEl.style.top = '';
            scoreDisplayEl.style.left = '';
            scoreDisplayEl.style.transform = '';
            scoreDisplayEl.style.zIndex = '';
            scoreDisplayEl.style.transition = '';
        }, 1500);
        playCorrectSound();
        setTimeout(() => {
            playPointsSound();
        }, 500);
        celebrate();
    } else {
        correctStreak = 0;
        question.earnedPoints = 0;
        playIncorrectSound();
    }
    
    const buttons = document.querySelectorAll('.option-btn');
    buttons.forEach(btn => {
        const isTrue = btn.classList.contains('true-btn');
        if (isTrue === question.correct) {
            btn.classList.add('correct');
        } else {
            btn.classList.add('incorrect');
        }
    });

    setTimeout(async () => {
        if (!isCorrect) {
            endQuiz();
        } else {
            currentQuestion++;
            if ([5, 10, 15, 20].includes(currentQuestion)) {
                await showCelebration(currentQuestion);
            }
            currentMusicIndex = (currentMusicIndex + 1) % backgroundMusics.length;
            updateQuestionCounter();
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
                questions: (function() {
                    const answeredQuestions = questions.slice(0, currentQuestion + 1);
                    const finalQuestions = answeredQuestions.map(q => ({
                        type: 'truefalse',
                        question: q.question,
                        userAnswer: formatTrueFalseAnswer(q.userAnswer),
                        correctAnswer: formatTrueFalseAnswer(q.correct),
                        isCorrect: q.userAnswer === q.correct,
                        points: MAX_POINTS,
                        earnedPoints: q.earnedPoints || 0,
                    }));
                    if (currentQuestion < questions.length) {
                        finalQuestions.length = currentQuestion + 1;
                    }
                    return finalQuestions;
                })(),
                correctCount: (function() {
                    const answered = questions.slice(0, currentQuestion + 1);
                    return answered.filter(q => q.userAnswer === q.correct).length;
                })(),
                incorrectCount: (function() {
                    const correct = questions.slice(0, currentQuestion + 1).filter(q => q.userAnswer === q.correct).length;
                    return 20 - correct;
                })()
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
    const scoreDisplayEl = document.querySelector('.score-display');
    if(scoreDisplayEl) {
        scoreDisplayEl.style.display = 'none';
    }
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

    // Initialize AOS
    AOS.init();
}); 