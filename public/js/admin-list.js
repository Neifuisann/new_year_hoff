let displayedLessons = []; // Renamed from lessons
let dragBoundary = null;
let currentPage = 1;
const lessonsPerPage = 15; // More per page for admin?
let totalLessons = 0;
let isLoading = false;

// Function to show/hide loader
function showLoader(show) {
    const loader = document.getElementById('loading-indicator');
    if (loader) {
        loader.classList.toggle('hidden', !show);
    }
}

async function loadLessonsForAdmin() {
    if (isLoading) return;
    isLoading = true;
    showLoader(true);
    try {
        // Add pagination parameters (add sort/search later if needed)
        const params = new URLSearchParams({
            page: currentPage,
            limit: lessonsPerPage
            // sort: currentSort // If sorting is added
        });
        
        const response = await fetch(`/api/lessons?${params.toString()}`);
        if (!response.ok) {
            throw new Error('Failed to fetch lessons');
        }
        
        const data = await response.json();
        displayedLessons = data.lessons || [];
        totalLessons = data.total || 0;
        
        const lessonListContainer = document.getElementById('lesson-list');
        
        // Find or create the sortable container
        let sortableContainer = document.getElementById('sortable-lessons');
        if (!sortableContainer) {
            lessonListContainer.innerHTML = '<h2>Danh sách bài:</h2>'; // Reset header
            sortableContainer = document.createElement('div');
            sortableContainer.id = 'sortable-lessons';
            sortableContainer.className = 'sortable-container';
            lessonListContainer.appendChild(sortableContainer);
        } else {
            // Clear only the items if container exists (for pagination)
            sortableContainer.innerHTML = ''; 
        }
        
        displayedLessons.forEach((lesson, index) => {
            const div = document.createElement('div');
            div.className = 'lesson-item';
            div.draggable = true;
            div.dataset.id = lesson.id;
            // Use a unique identifier for drag-drop if IDs aren't stable across pages
            // Or consider disabling drag-drop if pagination is active
            div.dataset.index = index; // Index within the *current* page
            
            // Keep the existing innerHTML structure
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
            
            // Add event listeners (drag/drop might be unreliable with pagination)
            div.addEventListener('dragstart', handleDragStart);
            div.addEventListener('dragover', handleDragOver);
            div.addEventListener('drop', handleDrop);
            div.addEventListener('dragend', handleDragEnd);
            
            sortableContainer.appendChild(div);
        });
        
        // Add or update pagination controls
        updateAdminPaginationControls();
        
    } catch (error) {
        console.error('Error loading lessons:', error);
        document.getElementById('lesson-list').innerHTML = `
            <h2>Danh sách bài:</h2>
            <p class="error-message">Error loading lessons. Please try again later.</p>
        `;
    } finally {
        showLoader(false);
        isLoading = false;
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
    // !! WARNING: This function is problematic with pagination !!
    // It currently assumes all items are present in the DOM.
    // It will only save the order of the items on the CURRENT page.
    // Consider disabling reordering or implementing a different reordering strategy.
    console.warn("saveNewOrder will only reorder items on the current page due to pagination.");

    const itemsOnPage = Array.from(document.querySelectorAll('#sortable-lessons .lesson-item'));
    const newOrderIds = itemsOnPage.map(item => item.dataset.id);
    
    // Option 1: Send only the IDs of the current page for partial reordering (backend needs adjustment)
    // Option 2: Fetch ALL lesson IDs from backend first, merge the current page order, then send full list (complex)
    // Option 3: Disable reordering when paginated.
    
    // For now, let's log what would be sent (likely incorrect for full reordering)
    console.log("Attempting to save order for current page:", newOrderIds);

    // If you proceed with sending just the page order, the backend /api/lessons/reorder
    // needs to be significantly smarter to handle partial updates.
    /* 
    try {
        const response = await fetch('/api/lessons/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderedIds: newOrderIds, page: currentPage, limit: lessonsPerPage }) // Example payload
        });
        if (!response.ok) throw new Error('Failed to save new order');
        // Maybe just reload current page after partial save?
        // loadLessonsForAdmin(); 
    } catch (error) { ... } 
    */
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
            
            // Reload the current page after deletion
            loadLessonsForAdmin(); 
        } catch (error) {
            console.error('Error deleting lesson:', error);
            alert('Failed to delete lesson. Please try again.');
        }
    }
}

async function updateLessonColor(id, color) {
    try {
        // Find the lesson in the *currently displayed* list
        const lesson = displayedLessons.find(l => l.id == id);
        if (!lesson) {
            console.warn('Lesson not found on current page for color update');
            return; // Lesson might be on another page
        }
        
        lesson.color = color;
        
        const response = await fetch(`/api/lessons/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ color: color }) // Send only the updated field
        });

        if (!response.ok) {
            throw new Error('Failed to update lesson color');
        }
        
        // Update the lesson card background color in the DOM
        const lessonCard = document.querySelector(`#sortable-lessons .lesson-item[data-id="${id}"]`);
        if (lessonCard) {
            // Assuming you have CSS variable --lesson-bg, otherwise update style directly
            lessonCard.style.setProperty('--lesson-bg', color);
            // Also update the color picker value visually if it wasn't triggered by its own change event
            const colorInput = lessonCard.querySelector('input[type="color"]');
            if (colorInput && colorInput.value !== color) {
                colorInput.value = color;
            }
        } 
    } catch (error) {
        console.error('Error updating lesson color:', error);
        alert('Failed to update lesson color. Please try again.');
        // Optionally reload to ensure consistency
        // loadLessonsForAdmin();
    }
}

// --- PAGINATION FUNCTIONS for Admin ---
function updateAdminPaginationControls() {
    const paginationContainer = document.getElementById('admin-pagination-controls');
    if (!paginationContainer) return; 

    paginationContainer.innerHTML = ''; 
    const totalPages = Math.ceil(totalLessons / lessonsPerPage);

    if (totalPages <= 1) return; 

    const prevButton = document.createElement('button');
    prevButton.textContent = 'Trước';
    prevButton.disabled = currentPage === 1;
    prevButton.onclick = () => {
        if (currentPage > 1) {
            currentPage--;
            loadLessonsForAdmin();
        }
    };
    paginationContainer.appendChild(prevButton);

    const pageInfo = document.createElement('span');
    pageInfo.textContent = ` Page ${currentPage} of ${totalPages} `;
    pageInfo.style.margin = '0 10px'; 
    paginationContainer.appendChild(pageInfo);

    const nextButton = document.createElement('button');
    nextButton.textContent = 'Tiếp';
    nextButton.disabled = currentPage === totalPages;
    nextButton.onclick = () => {
        if (currentPage < totalPages) {
            currentPage++;
            loadLessonsForAdmin();
        }
    };
    paginationContainer.appendChild(nextButton);
}

function ensureAdminPaginationContainer() {
    let container = document.getElementById('admin-pagination-controls');
    if (!container) {
        container = document.createElement('div');
        container.id = 'admin-pagination-controls';
        container.style.textAlign = 'center';
        container.style.marginTop = '20px';
        // Insert after the lesson-list div
        const lessonListDiv = document.getElementById('lesson-list');
        lessonListDiv?.parentNode?.insertBefore(container, lessonListDiv.nextSibling);
    }
}
// --- END PAGINATION FUNCTIONS ---

// Initialize the admin panel when the page loads
document.addEventListener('DOMContentLoaded', () => {
    ensureAdminPaginationContainer(); // Add pagination controls container
    showLoader(true); // Show loader immediately
    loadLessonsForAdmin(); // This will handle hiding the loader

    // Initialize event listener for the review lesson form
    const form = document.getElementById('review-lesson-form');
    if (form) {
        // form.addEventListener('submit', handleReviewLessonSubmit); // Commented out as function is not defined yet
    }
});

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
    // Implementation of removeReviewRow
}

