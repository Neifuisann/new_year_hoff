let lessons = [];
let dragBoundary = null;

async function loadLessonsForAdmin() {
    try {
        const response = await fetch('/api/lessons');
        if (!response.ok) {
            throw new Error('Failed to fetch lessons');
        }
        
        lessons = await response.json();
        const lessonList = document.getElementById('lesson-list');
        
        lessonList.innerHTML = '<h2>Danh sách bài:</h2>';
        const container = document.createElement('div');
        container.id = 'sortable-lessons';
        container.className = 'sortable-container';
        
        lessons.forEach((lesson, index) => {
            const div = document.createElement('div');
            div.className = 'lesson-item';
            div.draggable = true;
            div.dataset.id = lesson.id;
            div.dataset.index = index;
            //{lesson.questions?.length || 0} câu hỏi | line 30
            div.innerHTML = `
                <span class="drag-handle">☰</span>
                <span class="lesson-title">${lesson.title}</span>
                <div class="lesson-info">
                    
                </div>
                <div class="lesson-actions">
                    <input type="color" 
                           value="${lesson.color || '#a4aeff'}" 
                           onchange="updateLessonColor(${lesson.id}, this.value)"
                           style="margin-right: 10px; vertical-align: middle;">
                    <a href="/admin/edit/${lesson.id}" class="button" >Chỉnh sửa</a>
                    <a href="/admin/statistics/${lesson.id}" class="button">Xem danh sách</a>
                    <button onclick="deleteLesson(${lesson.id})" class="delete-button">Xoá</button>
                </div>
            `;
            
            div.addEventListener('dragstart', handleDragStart);
            div.addEventListener('dragover', handleDragOver);
            div.addEventListener('drop', handleDrop);
            div.addEventListener('dragend', handleDragEnd);
            
            container.appendChild(div);
        });
        
        lessonList.appendChild(container);
    } catch (error) {
        console.error('Error loading lessons:', error);
        document.getElementById('lesson-list').innerHTML = `
            <h2>Existing Lessons</h2>
            <p class="error-message">Error loading lessons. Please try again later.</p>
        `;
    }
}

function handleDragStart(e) {
    e.target.classList.add('dragging');
    e.dataTransfer.setData('text/plain', e.target.dataset.index);
    
    // Minimize content during drag
    const content = e.target.querySelector('.lesson-info, .lesson-actions');
    if (content) content.style.display = 'none';
    
    // Create boundary for the dragged element
    dragBoundary = createDragBoundary(e.target);
    
    // Start auto-scroll
    const container = document.getElementById('sortable-lessons');
    autoScroll.start(container);
}

function handleDragOver(e) {
    e.preventDefault();
    const container = document.getElementById('sortable-lessons');
    autoScroll.update(e, container);
    
    const draggingElement = document.querySelector('.dragging');
    if (dragBoundary) {
        // Update boundary position to follow the cursor
        const rect = draggingElement.getBoundingClientRect();
        dragBoundary.style.top = `${rect.top}px`;
        dragBoundary.style.left = `${rect.left}px`;
    }
    
    const afterElement = getDragAfterElement(container, e.clientY);
    if (afterElement) {
        container.insertBefore(draggingElement, afterElement);
    } else {
        container.appendChild(draggingElement);
    }
}

function handleDrop(e) {
    e.preventDefault();
    saveNewOrder();
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    
    // Restore minimized content
    const content = e.target.querySelector('.lesson-info, .lesson-actions');
    if (content) content.style.display = 'block';
    
    if (dragBoundary) {
        dragBoundary.remove();
        dragBoundary = null;
    }
    autoScroll.stop();
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.lesson-item:not(.dragging)')];
    
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

async function saveNewOrder() {
    const newOrder = Array.from(document.querySelectorAll('.lesson-item'))
        .map(item => lessons[item.dataset.index]);
    
    try {
        const response = await fetch('/api/lessons/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newOrder)
        });

        if (!response.ok) {
            throw new Error('Failed to save new order');
        }

        // Update the local lessons array to match the new order
        lessons = newOrder;
    } catch (error) {
        console.error('Error saving lesson order:', error);
        alert('Failed to save the new order. Please try again.');
        // Reload the list to restore the original order
        loadLessonsForAdmin();
    }
}

async function deleteLesson(id) {
    if (confirm('Are you sure you want to delete this lesson?')) {
        try {
            const response = await fetch(`/api/lessons/${id}`, { 
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                throw new Error('Failed to delete lesson');
            }

            loadLessonsForAdmin();
        } catch (error) {
            console.error('Error deleting lesson:', error);
            alert('Failed to delete lesson. Please try again.');
        }
    }
}

async function updateLessonColor(id, color) {
    try {
        const lesson = lessons.find(l => l.id == id);
        if (!lesson) return;
        
        lesson.color = color;
        
        const response = await fetch(`/api/lessons/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(lesson)
        });

        if (!response.ok) {
            throw new Error('Failed to update lesson color');
        }
        
        // Update the lesson card background color
        const lessonCard = document.querySelector(`[data-id="${id}"]`);
        if (lessonCard) {
            lessonCard.style.setProperty('--lesson-bg', color);
        }
    } catch (error) {
        console.error('Error updating lesson color:', error);
        alert('Failed to update lesson color. Please try again.');
    }
}

// Initialize the admin panel when the page loads
document.addEventListener('DOMContentLoaded', loadLessonsForAdmin);

// Functions for Review Lesson Modal
function openReviewLessonModal() {
    const container = document.getElementById('review-lesson-rows');
    container.innerHTML = '';
    addReviewRow();
    document.getElementById('review-lesson-modal').style.display = 'flex';
}

function addReviewRow() {
    const container = document.getElementById('review-lesson-rows');
    const row = document.createElement('div');
    row.className = 'review-lesson-row';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '10px';
    row.style.marginBottom = '10px';
    row.innerHTML = `
        <select class="review-lesson-select" required style="width: 40%;"></select>
        <input type="number" class="review-question-count" min="1" required style="width: 40%;" placeholder="Số câu?" />
        <button type="button" class="remove-row-btn" onclick="removeReviewRow(this)" style="margin-left: auto; background: none; border: none; cursor: pointer;">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
            </svg>
        </button>
    `;
    container.appendChild(row);
    populateReviewRowSelect(row);
}

function removeReviewRow(button) {
    const container = document.getElementById('review-lesson-rows');
    if (container.children.length > 1) {
        button.parentElement.remove();
    } else {
        alert("At least one lesson row is required.");
    }
}

function populateReviewRowSelect(row) {
    const select = row.querySelector('.review-lesson-select');
    select.innerHTML = '';
    lessons.forEach(lesson => {
        const option = document.createElement('option');
        option.value = lesson.id;
        option.textContent = lesson.title || ('Lesson ' + lesson.id);
        select.appendChild(option);
    });
}

function closeReviewLessonModal() {
    document.getElementById('review-lesson-modal').style.display = 'none';
}

// Helper function to shuffle an array
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Set up event listener for the review lesson form
document.addEventListener('DOMContentLoaded', function() {
    const reviewForm = document.getElementById('review-lesson-form');
    if (reviewForm) {
        reviewForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const rows = document.querySelectorAll('.review-lesson-row');
            if (rows.length === 0) {
                alert("No lesson rows found");
                return;
            }
            let allSelectedQuestions = [];
            let lessonTitles = [];
            for (const row of rows) {
                const select = row.querySelector('.review-lesson-select');
                const input = row.querySelector('.review-question-count');
                const lessonId = select.value;
                const count = parseInt(input.value);
                if (!lessonId || isNaN(count) || count < 1) {
                    alert('Please select a lesson and enter a valid question count for each row.');
                    return;
                }
                try {
                    const response = await fetch(`/api/lessons/${lessonId}`);
                    if (!response.ok) {
                        throw new Error('Failed to fetch lesson details for lesson ' + lessonId);
                    }
                    const lessonDetails = await response.json();
                    lessonTitles.push(lessonDetails.title);
                    let questions = lessonDetails.questions || [];
                    if (questions.length < count) {
                        alert(`Lesson "${lessonDetails.title}" only has ${questions.length} questions.`);
                        return;
                    }
                    questions = shuffleArray(questions);
                    allSelectedQuestions = allSelectedQuestions.concat(questions.slice(0, count));
                } catch (error) {
                    console.error('Error fetching lesson details:', error);
                    alert('Error fetching lesson details: ' + error.message);
                    return;
                }
            }
            allSelectedQuestions = shuffleArray(allSelectedQuestions);
            const reviewName = document.getElementById('review-lesson-name').value.trim();
            const newLesson = {
                title: reviewName || ('Review: ' + lessonTitles.join(', ')),
                color: '#a4aeff',
                questions: allSelectedQuestions,
                tags: []
            };
            try {
                const createRes = await fetch('/api/lessons', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newLesson)
                });
                if (!createRes.ok) {
                    throw new Error('Failed to create review lesson');
                }
                alert('Review lesson created successfully!');
                closeReviewLessonModal();
                loadLessonsForAdmin();
            } catch (error) {
                console.error('Error creating review lesson:', error);
                alert('Error creating review lesson: ' + error.message);
            }
        });
    }
});