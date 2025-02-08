let currentQuiz = {
    questions: []
};

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/api/quiz');
        currentQuiz = await response.json();
        currentQuiz.questions.forEach(q => addQuestion(q));
    } catch (error) {
        console.error('Error loading quiz:', error);
        alert('Error loading quiz data');
    }
});

function addQuestion(existingQuestion = null) {
    const questionDiv = document.createElement('div');
    questionDiv.className = 'question';
    questionDiv.draggable = true;
    
    // Initialize question data
    const newQuestion = existingQuestion || {
        type: 'truefalse',
        question: 'New Question',
        correct: false,
        points: 1,
        image: null
    };
    
    // Create the header section
    const headerHTML = `
        <div class="question-header">
            <div class="drag-handle">☰</div>
            <span class="question-preview">${existingQuestion?.question || 'New Question'}</span>
            <div class="header-buttons">
                <button type="button" class="minimize-btn" onclick="toggleQuestion(this)">−</button>
                <button type="button" class="remove-btn" onclick="removeQuestion(this)">×</button>
            </div>
        </div>`;

    const contentHTML = `
        <div class="question-content">
            <div class="form-group">
                <label>Nội dung câu hỏi:</label>
                <input type="text" class="question-text" value="${existingQuestion?.question || ''}" 
                       oninput="handleQuestionChange(this)">
            </div>
            <div class="form-group">
                <label>Hình ảnh:</label>
                <div class="image-upload-container">
                    <input type="file" class="question-image" accept="image/*" onchange="handleImageUpload(this)">
                    <button type="button" class="remove-image-btn" onclick="removeQuestionImage(this)" style="display: none;">X</button>
                </div>
                <img class="image-preview" src="${existingQuestion?.image || ''}" style="display: ${existingQuestion?.image ? 'block' : 'none'}; max-width: 200px; margin-top: 10px;">
            </div>
            <div class="form-group">
                <label>Đáp án đúng:</label>
                <select class="correct-answer" onchange="handleCorrectAnswerChange(this)">
                    <option value="true" ${existingQuestion?.correct ? 'selected' : ''}>Đúng</option>
                    <option value="false" ${!existingQuestion?.correct ? 'selected' : ''}>Sai</option>
                </select>
            </div>
            <div class="form-group">
                <label>Điểm:</label>
                <input type="number" class="points" value="${existingQuestion?.points || 1}" 
                       onchange="handlePointsChange(this)" min="1">
            </div>
        </div>`;

    questionDiv.innerHTML = headerHTML + contentHTML;
    
    // Add drag and drop handlers
    questionDiv.addEventListener('dragstart', handleQuestionDragStart);
    questionDiv.addEventListener('dragover', handleQuestionDragOver);
    questionDiv.addEventListener('drop', handleQuestionDrop);
    questionDiv.addEventListener('dragend', handleQuestionDragEnd);
    
    document.getElementById('questions').appendChild(questionDiv);
}

// Reuse these functions from admin-edit.js with minor modifications
function handleQuestionChange(input) {
    const questionDiv = input.closest('.question');
    const questionIndex = Array.from(questionDiv.parentElement.children).indexOf(questionDiv);
    currentQuiz.questions[questionIndex].question = input.value;
    questionDiv.querySelector('.question-preview').textContent = input.value;
}

function handleCorrectAnswerChange(select) {
    const questionDiv = select.closest('.question');
    const questionIndex = Array.from(questionDiv.parentElement.children).indexOf(questionDiv);
    currentQuiz.questions[questionIndex].correct = select.value === 'true';
}

function handlePointsChange(input) {
    const questionDiv = input.closest('.question');
    const questionIndex = Array.from(questionDiv.parentElement.children).indexOf(questionDiv);
    currentQuiz.questions[questionIndex].points = parseInt(input.value) || 1;
}

// Add the drag and drop utility functions
function handleQuestionDragStart(e) {
    e.target.classList.add('dragging');
}

function handleQuestionDragOver(e) {
    e.preventDefault();
    const draggingElement = document.querySelector('.dragging');
    if (!draggingElement) return;
    
    const container = document.getElementById('questions');
    const afterElement = getDragAfterElement(container, e.clientY);
    if (afterElement) {
        container.insertBefore(draggingElement, afterElement);
    } else {
        container.appendChild(draggingElement);
    }
}

function handleQuestionDrop(e) {
    e.preventDefault();
    updateQuestionOrder();
}

function handleQuestionDragEnd(e) {
    e.target.classList.remove('dragging');
    updateQuestionOrder();
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.question:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function updateQuestionOrder() {
    const questions = document.querySelectorAll('.question');
    const newQuestions = [];
    questions.forEach((q, index) => {
        const questionIndex = Array.from(q.parentElement.children).indexOf(q);
        if (currentQuiz.questions[questionIndex]) {
            newQuestions.push(currentQuiz.questions[questionIndex]);
        }
    });
    currentQuiz.questions = newQuestions;
}

function toggleQuestion(button) {
    const question = button.closest('.question');
    const content = question.querySelector('.question-content');
    const isMinimized = content.style.display === 'none';
    
    content.style.display = isMinimized ? 'block' : 'none';
    button.textContent = isMinimized ? '−' : '+';
}

function minimizeAllQuestions() {
    const questions = document.querySelectorAll('.question');
    const allMinimized = Array.from(questions).every(q => 
        q.querySelector('.question-content').style.display === 'none'
    );
    
    questions.forEach(q => {
        const content = q.querySelector('.question-content');
        const button = q.querySelector('.minimize-btn');
        content.style.display = allMinimized ? 'block' : 'none';
        button.textContent = allMinimized ? '−' : '+';
    });
}

function removeQuestion(button) {
    if (confirm('Are you sure you want to remove this question?')) {
        const question = button.closest('.question');
        const questionIndex = Array.from(question.parentElement.children).indexOf(question);
        currentQuiz.questions.splice(questionIndex, 1);
        question.remove();
    }
}

function toggleJsonEditor() {
    const panel = document.querySelector('.json-editor-panel');
    panel.classList.toggle('expanded');
}

function updateJsonEditor() {
    const jsonEditor = document.getElementById('json-editor');
    jsonEditor.value = JSON.stringify(currentQuiz, null, 2);
}

function applyJsonChanges() {
    try {
        const jsonEditor = document.getElementById('json-editor');
        const newData = JSON.parse(jsonEditor.value);
        
        if (!Array.isArray(newData.questions)) {
            throw new Error('Invalid quiz structure. Must include questions array.');
        }
        
        currentQuiz = newData;
        
        // Clear and reload questions
        document.getElementById('questions').innerHTML = '';
        currentQuiz.questions.forEach(q => addQuestion(q));
        
        alert('JSON changes applied successfully!');
    } catch (error) {
        alert('Error applying JSON changes: ' + error.message);
    }
}

async function saveQuiz() {
    try {
        const questions = Array.from(document.querySelectorAll('.question')).map(questionDiv => {
            return {
                type: 'truefalse',
                question: questionDiv.querySelector('.question-text').value,
                correct: questionDiv.querySelector('.correct-answer').value === 'true',
                points: parseInt(questionDiv.querySelector('.points').value) || 1,
                image: questionDiv.querySelector('.image-preview').src || null
            };
        });

        currentQuiz.questions = questions;

        const response = await fetch('/api/quiz/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentQuiz)
        });

        if (!response.ok) throw new Error('Failed to save quiz');
        window.location.href = '/admin';
    } catch (error) {
        console.error('Error saving quiz:', error);
        alert('Error saving quiz: ' + error.message);
    }
}

// Add event listener for Ctrl+S to save
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveQuiz();
    }
});

function toggleTextEditor() {
    const panel = document.querySelector('.text-editor-panel');
    const isExpanding = !panel.classList.contains('expanded');
    
    panel.classList.toggle('expanded');
    
    if (isExpanding) {
        updateTextEditor();
        document.getElementById('text-editor').focus();
    }
}

function updateTextEditor() {
    const textEditor = document.getElementById('text-editor');
    let content = '';
    
    currentQuiz.questions.forEach((q, index) => {
        content += `Question ${index + 1}: ${q.question || 'New Question'}\n`;
        content += `Points: ${q.points}\n`;
        content += `Correct: ${q.correct ? 'True' : 'False'}\n`;
        if (q.image) {
            content += `Image: [Image Attached]\n`;
        }
        content += '\n';
    });
    
    textEditor.value = content;
}

function renderQuestions() {
    try {
        const textEditor = document.getElementById('text-editor');
        const lines = textEditor.value.split('\n').map(line => line.trim()).filter(line => line);
        const questions = [];
        let currentQuestion = null;

        for (const line of lines) {
            if (line.startsWith('Question')) {
                if (currentQuestion) {
                    questions.push(currentQuestion);
                }
                currentQuestion = {
                    question: line.substring(line.indexOf(':') + 1).trim(),
                    points: 1,
                    correct: false
                };
            } else if (currentQuestion) {
                if (line.startsWith('Points:')) {
                    currentQuestion.points = parseInt(line.substring(line.indexOf(':') + 1).trim()) || 1;
                } else if (line.startsWith('Correct:')) {
                    currentQuestion.correct = line.substring(line.indexOf(':') + 1).trim().toLowerCase() === 'true';
                }
            }
        }

        if (currentQuestion) {
            questions.push(currentQuestion);
        }

        currentQuiz.questions = questions;
        
        // Re-render the questions
        const questionsContainer = document.getElementById('questions');
        questionsContainer.innerHTML = '';
        questions.forEach(q => addQuestion(q));
        
        updateJsonEditor();
        
    } catch (error) {
        console.error('Error rendering questions:', error);
    }
}

// Add save button to admin-quiz-edit.html
document.querySelector('.sortable-container').insertAdjacentHTML('beforeend', `
    <button onclick="saveQuiz()" class="save-btn">
        <i class="fas fa-save"></i>
        <span>Lưu thay đổi</span>
    </button>
`);

// Add these new functions for image handling
async function handleImageUpload(input) {
    const file = input.files[0];
    if (file) {
        try {
            const container = input.closest('.form-group');
            const preview = container.querySelector('.image-preview');
            const removeButton = container.querySelector('.remove-image-btn');
            
            const img = new Image();
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = URL.createObjectURL(file);
            });
            
            let width = img.width;
            let height = img.height;
            const maxSize = 720;
            
            if (width > maxSize || height > maxSize) {
                if (width > height) {
                    height *= maxSize / width;
                    width = maxSize;
                } else {
                    width *= maxSize / height;
                    height = maxSize;
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
            
            preview.src = compressedDataUrl;
            preview.style.display = 'block';
            removeButton.style.display = 'inline-block';
            
            const questionDiv = input.closest('.question');
            const questionIndex = Array.from(document.querySelectorAll('.question')).indexOf(questionDiv);
            if (questionIndex !== -1) {
                currentQuiz.questions[questionIndex].image = compressedDataUrl;
                updateTextEditor();
            }
            
            URL.revokeObjectURL(img.src);
        } catch (error) {
            console.error('Error processing image:', error);
            alert('Error processing image. Please try again.');
            input.value = '';
        }
    }
}

function removeQuestionImage(button) {
    const container = button.closest('.form-group');
    const fileInput = container.querySelector('.question-image');
    const preview = container.querySelector('.image-preview');
    const removeButton = container.querySelector('.remove-image-btn');
    
    fileInput.value = '';
    preview.removeAttribute('src');
    preview.style.display = 'none';
    removeButton.style.display = 'none';
    
    const questionDiv = button.closest('.question');
    const questionIndex = Array.from(document.querySelectorAll('.question')).indexOf(questionDiv);
    if (questionIndex !== -1) {
        currentQuiz.questions[questionIndex].image = null;
        updateTextEditor();
    }
}

// Add event listener for text editor toggle
document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.querySelector('.text-editor-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const panel = document.querySelector('.text-editor-panel');
            panel.classList.toggle('expanded');
            updateTextEditor();
        });
    }
}); 