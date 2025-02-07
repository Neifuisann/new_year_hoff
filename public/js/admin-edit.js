let editingId = null;
let questionDragBoundary = null;
let currentTags = new Set();
let currentLesson = null;

document.addEventListener('DOMContentLoaded', async () => {
    const pathParts = window.location.pathname.split('/');
    if (pathParts.includes('edit')) {
        editingId = pathParts[pathParts.length - 1];
        const response = await fetch(`/api/lessons/${editingId}`);
        currentLesson = await response.json();
        
        document.getElementById('lesson-title').value = currentLesson.title;
        document.getElementById('lesson-color').value = currentLesson.color || '#a4aeff';
        document.getElementById('random-questions').value = currentLesson.randomQuestions || 0;
        
        // Load existing lesson image if present
        if (currentLesson.lessonImage) {
            const imagePreview = document.getElementById('lesson-image-preview');
            const removeButton = document.querySelector('#lesson-image').nextElementSibling;
            imagePreview.src = currentLesson.lessonImage;
            imagePreview.style.display = 'block';
            removeButton.style.display = 'inline-block';
        }
        
        // Load existing tags
        if (currentLesson.tags) {
            currentLesson.tags.forEach(tag => addTag(tag));
        }
        
        currentLesson.questions.forEach(q => addQuestion(q));
        
        // Update JSON editor
        updateJsonEditor();
        updateTextEditor();
    } else {
        currentLesson = {
            id: Date.now(),
            title: '',
            color: '#a4aeff',
            questions: [],
            tags: []
        };
        updateJsonEditor();
        updateTextEditor();
    }

    // Add the OCR button next to Create New Lesson button
    const createButton = document.querySelector('button[onclick="addQuestion()"]');
    const ocrButton = document.createElement('button');
    ocrButton.className = 'btn btn-primary ms-2';
    ocrButton.innerHTML = 'Create New Lesson from Image';
    ocrButton.onclick = handleOCRUpload;
    createButton.parentNode.insertBefore(ocrButton, createButton.nextSibling);

    // Add file input for OCR
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'ocr-file-input';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    // Add the toggle button to the panel
    const panel = document.querySelector('.text-editor-panel');
    const toggleBtn = document.createElement('div');
    toggleBtn.className = 'text-editor-toggle';
    toggleBtn.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24">
            <path d="M15 19l-7-7 7-7" stroke="currentColor" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
    `;
    toggleBtn.onclick = toggleTextEditor;
    panel.insertBefore(toggleBtn, panel.firstChild);
});

function addQuestion(existingQuestion = null) {
    const questionDiv = document.createElement('div');
    questionDiv.className = 'question';
    questionDiv.draggable = true;
    
    // Initialize question data first
    const newQuestion = existingQuestion || {
        type: 'abcd',
        question: 'New Question',
        options: ['', '', '', ''],
        correct: existingQuestion?.type === 'truefalse' ? [false, false, false, false] : '',
        points: 1
    };

    // If it's a new true/false question, ensure correct array is initialized
    if (!existingQuestion && newQuestion.type === 'truefalse') {
        newQuestion.correct = [false, false, false, false];
    }
    
    // Add to currentLesson.questions array
    if (!existingQuestion) {
        currentLesson.questions.push(newQuestion);
    }
    
    // Create the header section that's always visible
    const headerHTML = `
        <div class="question-header">
            <div class="drag-handle">☰</div>
            <span class="question-type-badge">${existingQuestion?.type || 'abcd'}</span>
            <span class="question-preview">${existingQuestion?.question || 'New Question'}</span>
            <div class="header-buttons">
                <button type="button" class="minimize-btn" onclick="toggleQuestion(this)">−</button>
                <button type="button" class="remove-btn" onclick="removeQuestion(this)">×</button>
            </div>
        </div>`;

    // Create the collapsible content
    const contentHTML = `
        <div class="question-content">
            <div class="form-group">
                <label>Question Type:</label>
                <select class="question-type" onchange="handleQuestionTypeChange(this)">
                    <option value="abcd">Multiple Choice</option>
                    <option value="truefalse">True/False</option>
                    <option value="number">Number</option>
                </select>
            </div>
            <div class="form-group">
                <label>Question Text:</label>
                <input type="text" class="question-text" value="${existingQuestion?.question || ''}" 
                       oninput="updateQuestionPreview(this)">
            </div>
            <div class="form-group">
                <label>Question Image:</label>
                <div class="image-upload-container">
                    <input type="file" class="question-image" accept="image/*" onchange="handleImageUpload(this)">
                    <button type="button" class="remove-image-btn" onclick="removeQuestionImage(this)" style="display: none;">X</button>
                </div>
                <img class="image-preview" style="display: none; max-width: 200px; margin-top: 10px;">
            </div>
            <div class="options-container"></div>
            <div class="correct-answer-container"></div>
            <div class="form-group">
                <label>Points:</label>
                <input type="number" class="points" value="${existingQuestion?.points || 1}" 
                       min="1" oninput="handlePointsChange(this)">
            </div>
        </div>`;

    questionDiv.innerHTML = headerHTML + contentHTML;

    // Add drag and drop event listeners
    questionDiv.addEventListener('dragstart', handleQuestionDragStart);
    questionDiv.addEventListener('dragover', handleQuestionDragOver);
    questionDiv.addEventListener('drop', handleQuestionDrop);
    questionDiv.addEventListener('dragend', handleQuestionDragEnd);

    const typeSelect = questionDiv.querySelector('.question-type');
    if (existingQuestion) {
        typeSelect.value = existingQuestion.type;
        handleQuestionTypeChange(typeSelect, existingQuestion);
        if (existingQuestion?.image) {
            const imagePreview = questionDiv.querySelector('.image-preview');
            const removeButton = questionDiv.querySelector('.remove-image-btn');
            imagePreview.src = existingQuestion.image;
            imagePreview.style.display = 'block';
            removeButton.style.display = 'inline-block';
        }
    } else {
        handleQuestionTypeChange(typeSelect);
    }
    
    document.getElementById('questions').appendChild(questionDiv);
    updateTextEditor();
}

function handleQuestionTypeChange(select, existingQuestion = null) {
    const container = select.closest('.question');
    const optionsContainer = container.querySelector('.options-container');
    const correctContainer = container.querySelector('.correct-answer-container');
    
    // Update the question type badge
    const typeBadge = container.querySelector('.question-type-badge');
    typeBadge.textContent = select.value;
    
    // Update the question type in the data and initialize correct data structure
    const questionIndex = Array.from(document.querySelectorAll('.question')).indexOf(container);
    if (questionIndex !== -1) {
        currentLesson.questions[questionIndex].type = select.value;
        // Initialize correct data structure based on type
        if (select.value === 'truefalse') {
            currentLesson.questions[questionIndex].correct = currentLesson.questions[questionIndex].correct || [false, false, false, false];
        } else {
            currentLesson.questions[questionIndex].correct = currentLesson.questions[questionIndex].correct || '';
        }
        updateTextEditor();
        updateJsonEditor();
    }
    
    optionsContainer.innerHTML = '';
    correctContainer.innerHTML = '';

    if (select.value === 'abcd') {
        optionsContainer.innerHTML = `
            <div class="options-grid">
                <div class="form-group">
                    <label>Option A:</label>
                    <input type="text" class="option" value="${existingQuestion?.options?.[0] || ''}" oninput="handleOptionChange(this)">
                </div>
                <div class="form-group">
                    <label>Option B:</label>
                    <input type="text" class="option" value="${existingQuestion?.options?.[1] || ''}" oninput="handleOptionChange(this)">
                </div>
                <div class="form-group">
                    <label>Option C:</label>
                    <input type="text" class="option" value="${existingQuestion?.options?.[2] || ''}" oninput="handleOptionChange(this)">
                </div>
                <div class="form-group">
                    <label>Option D:</label>
                    <input type="text" class="option" value="${existingQuestion?.options?.[3] || ''}" oninput="handleOptionChange(this)">
                </div>
            </div>
        `;

        correctContainer.innerHTML = `
            <div class="form-group">
                <label>Correct Answer:</label>
                <select class="correct-answer" onchange="handleCorrectAnswerChange(this)">
                    <option value="">Select correct answer</option>
                    ${['a', 'b', 'c', 'd'].map(char => `
                        <option value="${char}" ${existingQuestion?.correct === char ? 'selected' : ''}>
                            ${char.toUpperCase()}
                        </option>
                    `).join('')}
                </select>
            </div>
        `;
    } else if (select.value === 'truefalse') {
        optionsContainer.innerHTML = `
            <div class="truefalse-options">
                <button type="button" onclick="addTrueFalseOption(this)">Add Option</button>
                <div class="options-list">
                    ${existingQuestion?.options?.map((opt, idx) => 
                        createTrueFalseOptionHTML(opt, idx, existingQuestion.correct[idx])
                    ).join('') || createTrueFalseOptionHTML('', 0, false)}
                </div>
            </div>
        `;
    } else if (select.value === 'number') {
        correctContainer.innerHTML = `
            <div class="form-group">
                <label>Correct Answer:</label>
                <input type="number" class="correct-answer" value="${existingQuestion?.correct || ''}" 
                       oninput="handleCorrectAnswerChange(this)" required>
            </div>
        `;
    }
}

function createTrueFalseOptionHTML(text, index, isCorrect) {
    return `
        <div class="truefalse-option" data-index="${index}">
            <div class="form-group">
                <input type="text" class="option-text" value="${text}" 
                       placeholder="Enter option text" 
                       oninput="handleTrueFalseOptionChange(this)">
                <select class="option-value" onchange="handleTrueFalseOptionChange(this)">
                    <option value="true" ${isCorrect ? 'selected' : ''}>True</option>
                    <option value="false" ${!isCorrect ? 'selected' : ''}>False</option>
                </select>
                <button type="button" onclick="removeTrueFalseOption(this)">Remove</button>
            </div>
        </div>
    `;
}

function addTrueFalseOption(button) {
    const optionsList = button.nextElementSibling;
    const newIndex = optionsList.children.length;
    const optionHTML = createTrueFalseOptionHTML('', newIndex, false);
    optionsList.insertAdjacentHTML('beforeend', optionHTML);
}

function removeTrueFalseOption(button) {
    const option = button.closest('.truefalse-option');
    const optionsList = option.parentElement;
    
    if (optionsList.children.length > 1) {
        option.remove();
        // Reindex remaining options
        Array.from(optionsList.children).forEach((opt, idx) => {
            opt.dataset.index = idx;
        });
    } else {
        alert('At least one option is required');
    }
}

// Drag and drop functions for questions
function handleQuestionDragStart(e) {
    e.target.classList.add('dragging');
    
    // Minimize content during drag
    const content = e.target.querySelector('.question-content');
    if (content) content.style.display = 'none';
    
    // Create boundary for the dragged element
    questionDragBoundary = createDragBoundary(e.target);
    
    // Start auto-scroll
    const container = document.getElementById('questions');
    autoScroll.start(container);
}

function handleQuestionDragOver(e) {
    e.preventDefault();
    const container = document.getElementById('questions');
    autoScroll.update(e, container);
    
    const draggingElement = document.querySelector('.question.dragging');
    if (questionDragBoundary) {
        // Update boundary position to follow the cursor
        const rect = draggingElement.getBoundingClientRect();
        questionDragBoundary.style.top = `${rect.top}px`;
        questionDragBoundary.style.left = `${rect.left}px`;
    }
    
    const afterElement = getQuestionDragAfterElement(container, e.clientY);
    if (afterElement) {
        container.insertBefore(draggingElement, afterElement);
    } else {
        container.appendChild(draggingElement);
    }
}

function handleQuestionDrop(e) {
    e.preventDefault();
}

function handleQuestionDragEnd(e) {
    e.target.classList.remove('dragging');
    
    // Restore minimized content if it was previously visible
    const content = e.target.querySelector('.question-content');
    if (content && !e.target.querySelector('.minimize-btn').textContent.includes('+')) {
        content.style.display = 'block';
    }
    
    if (questionDragBoundary) {
        questionDragBoundary.remove();
        questionDragBoundary = null;
    }
    autoScroll.stop();
}

function getQuestionDragAfterElement(container, y) {
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

function toggleJsonEditor() {
    const panel = document.querySelector('.json-editor-panel');
    panel.classList.toggle('expanded');
}

function updateJsonEditor() {
    const jsonEditor = document.getElementById('json-editor');
    // Format JSON with 2 space indentation
    jsonEditor.value = JSON.stringify(currentLesson, null, 2);
    
    // Add syntax highlighting if needed
    if (typeof hljs !== 'undefined') {
        jsonEditor.innerHTML = hljs.highlight('json', jsonEditor.value).value;
    }
}

function applyJsonChanges() {
    try {
        const jsonEditor = document.getElementById('json-editor');
        const newData = JSON.parse(jsonEditor.value);
        
        // Validate the JSON structure
        if (!newData.title || !Array.isArray(newData.questions)) {
            throw new Error('Invalid lesson structure. Must include title and questions array.');
        }
        
        // Update the current lesson
        currentLesson = newData;
        
        // Update the UI
        document.getElementById('lesson-title').value = currentLesson.title;
        document.getElementById('lesson-color').value = currentLesson.color || '#a4aeff';
        
        // Clear and reload tags
        currentTags.clear();
        document.getElementById('tags-list').innerHTML = '';
        if (currentLesson.tags) {
            currentLesson.tags.forEach(tag => addTag(tag));
        }
        
        // Clear and reload questions
        document.getElementById('questions').innerHTML = '';
        currentLesson.questions.forEach(q => addQuestion(q));
        
        alert('JSON changes applied successfully!');
    } catch (error) {
        alert('Error applying JSON changes: ' + error.message);
    }
}

async function saveLesson() {
    try {
        // Update lastUpdated timestamp
        const now = new Date().toISOString();
        
        const lessonData = {
            ...currentLesson,
            title: document.getElementById('lesson-title').value,
            color: document.getElementById('lesson-color').value,
            randomQuestions: parseInt(document.getElementById('random-questions').value) || 0,
            tags: Array.from(currentTags),
            questions: currentLesson.questions,
            lessonImage: currentLesson.lessonImage,
            lastUpdated: now
        };
        
        const method = editingId ? 'PUT' : 'POST';
        const url = editingId ? `/api/lessons/${editingId}` : '/api/lessons';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(lessonData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to save lesson');
        }

        window.location.href = '/admin';
    } catch (error) {
        console.error('Error saving lesson:', error);
        alert('Error saving lesson: ' + error.message);
    }
}

function toggleQuestion(button) {
    const question = button.closest('.question');
    const content = question.querySelector('.question-content');
    const isMinimized = content.style.display === 'none';
    
    content.style.display = isMinimized ? 'block' : 'none';
    button.textContent = isMinimized ? '−' : '+';
}

function updateQuestionPreview(input) {
    const question = input.closest('.question');
    const preview = question.querySelector('.question-preview');
    preview.textContent = input.value || 'New Question';
    
    // Update the question data
    const questionIndex = Array.from(document.querySelectorAll('.question')).indexOf(question);
    if (questionIndex !== -1) {
        currentLesson.questions[questionIndex].question = input.value;
        updateTextEditor();
    }
}

async function handleImageUpload(input) {
    const file = input.files[0];
    const container = input.closest('.form-group');
    const preview = container.querySelector('.image-preview');
    const removeButton = container.querySelector('.remove-image-btn');
    
    if (file) {
        try {
            // Create a canvas to compress the image
            const img = new Image();
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Create a promise to handle image loading
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = URL.createObjectURL(file);
            });
            
            // Calculate new dimensions (max 800px width/height)
            let width = img.width;
            let height = img.height;
            const maxSize = 800;
            
            if (width > maxSize || height > maxSize) {
                if (width > height) {
                    height *= maxSize / width;
                    width = maxSize;
                } else {
                    width *= maxSize / height;
                    height = maxSize;
                }
            }
            
            // Set canvas size and draw image
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            
            // Get compressed image data
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
            
            // Update preview
            preview.src = compressedDataUrl;
            preview.style.display = 'block';
            removeButton.style.display = 'inline-block';
            
            // Update question data
            const questionDiv = input.closest('.question');
            const questionIndex = Array.from(document.querySelectorAll('.question')).indexOf(questionDiv);
            if (questionIndex !== -1) {
                currentLesson.questions[questionIndex].image = compressedDataUrl;
                updateJsonEditor();
                updateTextEditor();
            }
            
            // Clean up
            URL.revokeObjectURL(img.src);
        } catch (error) {
            console.error('Error processing image:', error);
            alert('Error processing image. Please try again with a different image.');
            input.value = '';
        }
    }
}

function removeQuestionImage(button) {
    const container = button.closest('.form-group');
    const fileInput = container.querySelector('.question-image');
    const preview = container.querySelector('.image-preview');
    
    // Reset file input
    fileInput.value = '';
    // Clear preview source and hide it
    preview.removeAttribute('src');
    preview.style.display = 'none';
    // Hide remove button
    button.style.display = 'none';
    
    // Update question data
    const questionDiv = button.closest('.question');
    const questionIndex = Array.from(document.querySelectorAll('.question')).indexOf(questionDiv);
    if (questionIndex !== -1) {
        currentLesson.questions[questionIndex].image = null;
        updateJsonEditor();
        updateTextEditor();
    }
}

function addTag(tagName) {
    if (!tagName) return;
    tagName = tagName.toLowerCase().trim();
    if (tagName && !currentTags.has(tagName)) {
        currentTags.add(tagName);
        const tagElement = document.createElement('span');
        tagElement.className = 'tag';
        tagElement.innerHTML = `
            ${tagName}
            <button onclick="removeTag('${tagName}')">&times;</button>
        `;
        document.getElementById('tags-list').appendChild(tagElement);
    }
    document.getElementById('tag-input').value = '';
}

function removeTag(tagName) {
    currentTags.delete(tagName);
    renderTags();
}

function renderTags() {
    const tagsList = document.getElementById('tags-list');
    tagsList.innerHTML = '';
    currentTags.forEach(tag => {
        const tagElement = document.createElement('span');
        tagElement.className = 'tag';
        tagElement.innerHTML = `
            ${tag}
            <button onclick="removeTag('${tag}')">&times;</button>
        `;
        tagsList.appendChild(tagElement);
    });
}

document.getElementById('tag-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const tagValue = e.target.value.replace(',', '').trim();
        if (tagValue) {
            addTag(tagValue);
            // Update the currentLesson object
            currentLesson.tags = Array.from(currentTags);
            // Update JSON editor
            updateJsonEditor();
        }
    }
});

// Add input handler for lesson title
document.getElementById('lesson-title').addEventListener('input', (e) => {
    currentLesson.title = e.target.value;
    updateJsonEditor();
});

// Add input handler for lesson color
document.getElementById('lesson-color').addEventListener('input', (e) => {
    currentLesson.color = e.target.value;
    updateJsonEditor();
});

// Add event listener for Ctrl+S to save
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveLesson();
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
    
    if (!currentLesson || !Array.isArray(currentLesson.questions)) {
        return;
    }
    
    currentLesson.questions.forEach((q, index) => {
        content += `Question ${index + 1}: ${q.question || 'New Question'}\n`;
        content += `Type: ${q.type}\n`;
        content += `Points: ${q.points}\n`;
        
        if (q.image) {
            content += `Image: [Has Image]\n`;
        }
        
        if (q.type === 'abcd') {
            q.options.forEach((opt, idx) => {
                const prefix = q.correct === String.fromCharCode(97 + idx) ? '*' : ' ';
                content += `${prefix}${String.fromCharCode(65 + idx)}. ${opt || ''}\n`;
            });
        } else if (q.type === 'truefalse') {
            q.options.forEach((opt, idx) => {
                const isTrue = Array.isArray(q.correct) ? q.correct[idx] : false;
                content += `${String.fromCharCode(65 + idx)}. ${opt || ''} [${isTrue ? 'True' : 'False'}]\n`;
            });
        } else if (q.type === 'number') {
            content += `Answer: ${q.correct || ''}\n`;
        }
        content += '\n';
    });
    
    // Only update if content has changed
    if (textEditor.value !== content) {
        textEditor.value = content;
    }
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
                    type: '',
                    points: 1,
                    options: [],
                    correct: ''
                };
            } else if (currentQuestion) {
                if (line.startsWith('Type:')) {
                    currentQuestion.type = line.substring(line.indexOf(':') + 1).trim().toLowerCase();
                    if (currentQuestion.type === 'abcd') {
                        currentQuestion.options = new Array(4).fill('');
                    }
                } else if (line.startsWith('Points:')) {
                    currentQuestion.points = parseInt(line.substring(line.indexOf(':') + 1).trim()) || 1;
                } else if (line.startsWith('Answer:')) {
                    currentQuestion.type = 'number';
                    currentQuestion.correct = line.substring(line.indexOf(':') + 1).trim();
                } else if (line.match(/^[* ]?[A-D]\./)) {
                    const isCorrect = line.startsWith('*');
                    const optionMatch = line.match(/^[* ]?([A-D])\.(.*)/);
                    if (optionMatch) {
                        const optionLetter = optionMatch[1];
                        const optionText = optionMatch[2].trim();
                        const index = optionLetter.charCodeAt(0) - 65;
                        
                        if (currentQuestion.type === 'truefalse') {
                            const truefalseMatch = optionText.match(/\[(True|False)\]$/);
                            if (truefalseMatch) {
                                currentQuestion.options.push(optionText.substring(0, optionText.lastIndexOf('[')).trim());
                                currentQuestion.correct = currentQuestion.correct || [];
                                currentQuestion.correct.push(truefalseMatch[1] === 'True');
                            }
                        } else {
                            // Handle ABCD type
                            currentQuestion.type = 'abcd';
                            currentQuestion.options[index] = optionText;
                            if (isCorrect) {
                                currentQuestion.correct = String.fromCharCode(97 + index);
                            }
                        }
                    }
                }
            }
        }

        if (currentQuestion) {
            questions.push(currentQuestion);
        }

        // Update the currentLesson object with new questions
        currentLesson.questions = questions;
        
        // Update both editors
        updateJsonEditor();
        
        // Re-render the questions
        const questionsContainer = document.getElementById('questions');
        questionsContainer.innerHTML = '';
        
        // Use addQuestion for each question to ensure proper rendering
        questions.forEach(q => addQuestion(q));
        
    } catch (error) {
        console.error('Error rendering questions:', error);
    }
}

function handleOptionChange(input) {
    const question = input.closest('.question');
    const questionIndex = Array.from(document.querySelectorAll('.question')).indexOf(question);
    if (questionIndex !== -1) {
        const optionIndex = Array.from(input.closest('.options-grid').querySelectorAll('.option')).indexOf(input);
        currentLesson.questions[questionIndex].options[optionIndex] = input.value;
        updateTextEditor();
    }
}

function handleCorrectAnswerChange(select) {
    const question = select.closest('.question');
    const questionIndex = Array.from(document.querySelectorAll('.question')).indexOf(question);
    if (questionIndex !== -1) {
        currentLesson.questions[questionIndex].correct = select.value;
        updateTextEditor();
    }
}

function handleTrueFalseOptionChange(input) {
    const question = input.closest('.question');
    const questionIndex = Array.from(document.querySelectorAll('.question')).indexOf(question);
    if (questionIndex !== -1) {
        const optionBox = input.closest('.truefalse-option');
        const optionIndex = parseInt(optionBox.dataset.index);
        
        if (input.classList.contains('option-text')) {
            currentLesson.questions[questionIndex].options[optionIndex] = input.value;
        } else if (input.classList.contains('option-value')) {
            // Convert the value to boolean and update both the model and UI
            const newValue = input.value.toLowerCase() === 'true';
            currentLesson.questions[questionIndex].correct[optionIndex] = newValue;
            input.value = newValue.toString(); // Ensure UI shows correct value
        }
        
        // Update both editors to keep them in sync
        updateTextEditor();
        if (document.getElementById('text-editor').style.display === 'block') {
            updateJsonEditor();
        }
    }
}

function handlePointsChange(input) {
    const question = input.closest('.question');
    const questionIndex = Array.from(document.querySelectorAll('.question')).indexOf(question);
    if (questionIndex !== -1) {
        currentLesson.questions[questionIndex].points = parseInt(input.value) || 1;
        updateTextEditor();
    }
}

function removeQuestion(button) {
    const questionDiv = button.closest('.question');
    const questionIndex = Array.from(document.querySelectorAll('.question')).indexOf(questionDiv);
    
    if (questionIndex !== -1) {
        // Remove from currentLesson.questions array
        currentLesson.questions.splice(questionIndex, 1);
        // Remove from DOM
        questionDiv.remove();
        // Update both editors
        updateJsonEditor();
        updateTextEditor();
    }
}

function minimizeAllQuestions() {
    const questions = document.querySelectorAll('.question');
    const minimizeAllBtn = document.querySelector('.minimize-all-btn');
    
    // Check if any question is minimized to determine the action
    const anyMinimized = Array.from(questions).some(question => {
        const content = question.querySelector('.question-content');
        return content && content.style.display === 'none';
    });
    
    // If any are minimized, maximize all. If all are maximized, minimize all
    const shouldMinimize = !anyMinimized;
    
    // Update all questions
    questions.forEach(question => {
        const content = question.querySelector('.question-content');
        const minimizeBtn = question.querySelector('.minimize-btn');
        
        if (content && minimizeBtn) {
            if (shouldMinimize) {
                // Minimize all
                content.style.display = 'none';
                minimizeBtn.textContent = '+';
            } else {
                // Maximize all
                content.style.display = 'block';
                minimizeBtn.textContent = '−';
            }
        }
    });
    
    // Update the minimize all button text and icon
    if (minimizeAllBtn) {
        if (shouldMinimize) {
            minimizeAllBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24">
                    <path d="M4 12h16M4 6h16M4 18h16" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"/>
                </svg>
                Maximize All
            `;
        } else {
            minimizeAllBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24">
                    <path d="M4 9h16M4 15h16" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"/>
                </svg>
                Minimize All
            `;
        }
    }
}

function parseOCRResponse(text) {
    const questions = [];
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);
    let currentQuestion = null;

    for (const line of lines) {
        if (line.startsWith('Question')) {
            if (currentQuestion) {
                // Ensure ABCD questions have all 4 options
                if (currentQuestion.type === 'abcd' && currentQuestion.options.length < 4) {
                    while (currentQuestion.options.length < 4) {
                        currentQuestion.options.push('');
                    }
                }
                questions.push(currentQuestion);
            }
            currentQuestion = {
                question: line.substring(line.indexOf(':') + 1).trim(),
                type: '',
                points: 1,
                options: [],
                correct: ''
            };
        } else if (currentQuestion) {
            if (line.startsWith('Type:')) {
                currentQuestion.type = line.substring(line.indexOf(':') + 1).trim().toLowerCase();
                if (currentQuestion.type === 'abcd') {
                    currentQuestion.options = new Array(4).fill(''); // Initialize with 4 empty options
                }
            } else if (line.startsWith('Points:')) {
                currentQuestion.points = parseInt(line.substring(line.indexOf(':') + 1).trim()) || 1;
            } else if (line.startsWith('Answer:')) {
                currentQuestion.type = 'number';
                currentQuestion.correct = line.substring(line.indexOf(':') + 1).trim();
            } else if (line.match(/^[* ]?[A-D]\./)) {
                if (currentQuestion.type === 'truefalse') {
                    const truefalseMatch = line.match(/\[(True|False)\]$/);
                    if (truefalseMatch) {
                        currentQuestion.options.push(line.substring(3, line.lastIndexOf('[')).trim());
                        currentQuestion.correct = currentQuestion.correct || [];
                        currentQuestion.correct.push(truefalseMatch[1] === 'True');
                    }
                } else {
                    // Handle ABCD type
                    const isCorrect = line.startsWith('*');
                    const optionMatch = line.match(/^[* ]?([A-D])\.(.*)/);
                    if (optionMatch) {
                        const optionLetter = optionMatch[1];
                        const optionText = optionMatch[2].trim();
                        const index = optionLetter.charCodeAt(0) - 65; // Convert A-D to 0-3
                        currentQuestion.options[index] = optionText;
                        if (isCorrect) {
                            currentQuestion.correct = String.fromCharCode(97 + index); // Convert to a-d
                        }
                    }
                }
            }
        }
    }

    if (currentQuestion) {
        // Ensure last question has all 4 options if it's ABCD
        if (currentQuestion.type === 'abcd' && currentQuestion.options.length < 4) {
            while (currentQuestion.options.length < 4) {
                currentQuestion.options.push('');
            }
        }
        questions.push(currentQuestion);
    }

    return questions;
}

async function handleOCRUpload() {
    const fileInput = document.getElementById('ocr-file-input');
    fileInput.click();

    fileInput.onchange = async function() {
        const file = fileInput.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('image', file);

        try {
            const response = await fetch('/api/ocr', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Failed to process image');
            }

            const data = await response.json();
            console.log('Received OCR response:', data);

            // Parse the OCR response and update currentLesson
            const questions = parseOCRResponse(data.text);
            console.log('Parsed questions:', questions);
            
            if (!currentLesson) {
                currentLesson = {
                    id: Date.now(),
                    title: '',
                    color: '#a4aeff',
                    questions: [],
                    tags: []
                };
            }
            
            currentLesson.questions = questions;
            
            // Update both editors
            updateJsonEditor();
            updateTextEditor();
            
            // Make sure text editor panel is visible
            const editorPanel = document.querySelector('.text-editor-panel');
            editorPanel.classList.remove('collapsed');
            
            // Clear the file input
            fileInput.value = '';
        } catch (error) {
            console.error('Error processing image:', error);
            alert('Failed to process image: ' + error.message);
        }
    };
}

// Add new functions for lesson image handling
async function handleLessonImageUpload(input) {
    const file = input.files[0];
    const preview = document.getElementById('lesson-image-preview');
    const removeButton = input.nextElementSibling;
    
    if (file) {
        try {
            // Create a canvas to compress the image
            const img = new Image();
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Create a promise to handle image loading
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = URL.createObjectURL(file);
            });
            
            // Calculate new dimensions (max 800px width/height)
            let width = img.width;
            let height = img.height;
            const maxSize = 800;
            
            if (width > maxSize || height > maxSize) {
                if (width > height) {
                    height *= maxSize / width;
                    width = maxSize;
                } else {
                    width *= maxSize / height;
                    height = maxSize;
                }
            }
            
            // Set canvas size and draw image
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            
            // Get compressed image data
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
            
            // Update preview
            preview.src = compressedDataUrl;
            preview.style.display = 'block';
            removeButton.style.display = 'inline-block';
            
            // Update lesson data
            currentLesson.lessonImage = compressedDataUrl;
            updateJsonEditor();
            updateTextEditor();
            
            // Clean up
            URL.revokeObjectURL(img.src);
        } catch (error) {
            console.error('Error processing image:', error);
            alert('Error processing image. Please try again with a different image.');
            input.value = '';
        }
    }
}

function removeLessonImage() {
    const fileInput = document.getElementById('lesson-image');
    const preview = document.getElementById('lesson-image-preview');
    const removeButton = fileInput.nextElementSibling;
    
    // Reset file input
    fileInput.value = '';
    // Clear preview source and hide it
    preview.removeAttribute('src');
    preview.style.display = 'none';
    // Hide remove button
    removeButton.style.display = 'none';
    
    // Update lesson data
    currentLesson.lessonImage = null;
    updateJsonEditor();
    updateTextEditor();
}