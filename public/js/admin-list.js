let displayedLessons = []; // Renamed from lessons
let dragBoundary = null;
let currentPage = 1;
const lessonsPerPage = 15; // More per page for admin?
let totalLessons = 0;
let isLoading = false;
let allTags = []; // To store tags fetched from API
let currentSearch = ''; // For search functionality
let currentSort = 'az'; // Default sort is A-Z
let maxTitleWidth = 300; // Adjustable max width for lesson titles in pixels

// Function to show/hide loader
function showLoader(show) {
    const loader = document.getElementById('loading-indicator');
    if (loader) {
        loader.classList.toggle('hidden', !show);
    }
}

// Fetch all unique tags
async function loadTags() {
    try {
        const response = await fetch('/api/tags');
        if (!response.ok) throw new Error('Failed to fetch tags');
        allTags = await response.json();
        renderTagsList(); // Render tags once fetched
    } catch (error) {
        console.error('Error loading tags:', error);
    }
}

// Render tags list 
function renderTagsList() {
    const tagsContainer = document.querySelector('.tags-container');
    if (!tagsContainer) return;
    
    tagsContainer.innerHTML = ''; // Clear previous tags
    
    // Add heading
    const heading = document.createElement('h3');
    heading.textContent = 'Tags phổ biến';
    tagsContainer.appendChild(heading);
    
    const tagsList = document.createElement('div');
    tagsList.className = 'tags-list';
    
    allTags.forEach(tag => {
        const tagButton = document.createElement('button');
        tagButton.className = 'tag-filter';
        tagButton.textContent = tag;
        tagButton.onclick = () => {
            document.getElementById('search-input').value = tag; 
            filterAndRenderLessons(); // Trigger search with this tag
        };
        tagsList.appendChild(tagButton);
    });
    
    tagsContainer.appendChild(tagsList);
}

// Helper function to copy text to clipboard
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert('Share link copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy text: ', err);
        alert('Failed to copy link. Please copy it manually.'); // Fallback message
    });
}

// Function to handle clicking the share button
function copyShareLink(lessonId) {
    // Construct the share URL based on the current window location
    const shareUrl = `${window.location.origin}/share/lesson/${lessonId}`;
    copyToClipboard(shareUrl);
}

// Filter and render lessons based on search and sort
function filterAndRenderLessons() {
    currentSearch = document.getElementById('search-input')?.value.toLowerCase() || '';
    currentSort = document.getElementById('sort-select')?.value || 'az';
    currentPage = 1; // Reset to first page for new search/sort
    loadLessonsForAdmin(); // Fetch data from backend with new filters
}

async function loadLessonsForAdmin() {
    if (isLoading) return;
    isLoading = true;
    showLoader(true);
    try {
        // Add pagination parameters and search/sort parameters
        const params = new URLSearchParams({
            page: currentPage,
            limit: lessonsPerPage,
            sort: currentSort
        });
        
        if (currentSearch) {
            params.append('search', currentSearch);
        }
        
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
        
        if (displayedLessons.length === 0) {
            sortableContainer.innerHTML = '<p>Không tìm thấy bài học nào phù hợp.</p>';
        } else {
            displayedLessons.forEach((lesson, index) => {
                const div = document.createElement('div');
                div.className = 'lesson-item';
                div.dataset.id = lesson.id;
                
                // Keep the existing innerHTML structure but remove drag handle
                div.innerHTML = `
                    <span class="lesson-title" style="max-width: ${maxTitleWidth}px; text-overflow: ellipsis; white-space: nowrap;">${lesson.title}</span>
                    <div class="lesson-actions">
                        ${lesson.tags && lesson.tags.length > 0 ? 
                            `<div class="lesson-tags">
                                ${lesson.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                            </div>` : ''}
                        <input type="color" 
                               value="${lesson.color || '#a4aeff'}" 
                               onchange="updateLessonColor(${lesson.id}, this.value)"
                               style="margin-right: 10px; vertical-align: middle;">
                        <a href="/admin/edit/${lesson.id}" class="button" >Chỉnh sửa</a>
                        <a href="/admin/statistics/${lesson.id}" class="button">Xem danh sách</a>
                        <button onclick="copyShareLink(${lesson.id})" class="button share-button" title="Copy Share Link">Chia sẻ</button>
                        <button onclick="deleteLesson(${lesson.id})" class="delete-button">Xoá</button>
                    </div>
                `;
                
                sortableContainer.appendChild(div);
            });
        }
        
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

// Remove drag and drop related functions (but we'll keep the function names without implementation)
// This helps maintain compatibility with any code that might call these functions

function handleDragStart(e) {
    // Function removed - no drag and drop
}

function handleDragOver(e) {
    // Function removed - no drag and drop
}

function handleDrop(e) {
    // Function removed - no drag and drop
}

function handleDragEnd(e) {
    // Function removed - no drag and drop
}

function getDragAfterElement(container, y) {
    // Function removed - no drag and drop
    return null;
}

async function saveNewOrder() {
    // Function removed - no drag and drop
    console.log("Drag and drop reordering has been disabled");
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

    // Add page numbers
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, startPage + 4);
    
    for (let i = startPage; i <= endPage; i++) {
        const pageButton = document.createElement('button');
        pageButton.textContent = i;
        pageButton.className = i === currentPage ? 'active-page' : '';
        pageButton.onclick = () => {
            if (i !== currentPage) {
                currentPage = i;
                loadLessonsForAdmin();
            }
        };
        paginationContainer.appendChild(pageButton);
    }

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
        container.className = 'pagination-controls';
        container.style.textAlign = 'center'; // Center the pagination controls
        container.style.margin = '20px 0'; // Add some margin for spacing
        // Insert after the lesson-list div
        const lessonListDiv = document.getElementById('lesson-list');
        lessonListDiv?.parentNode?.insertBefore(container, lessonListDiv.nextSibling);
    }
}

// Create search and sort elements
function createSearchAndSortElements() {
    const lessonListDiv = document.getElementById('lesson-list');
    if (!lessonListDiv) return;
    
    // Check if search container already exists
    if (document.querySelector('.admin-search-sort-container')) return;
    
    // Create container
    const searchSortContainer = document.createElement('div');
    searchSortContainer.className = 'admin-search-sort-container';
    
    // Create search box
    const searchBox = document.createElement('div');
    searchBox.className = 'search-box';
    searchBox.innerHTML = `
        <input type="text" id="search-input" placeholder="Tìm kiếm bài học hoặc tag...">
        <div class="tags-container"></div>
    `;
    
    // Create sort box
    const sortBox = document.createElement('div');
    sortBox.className = 'sort-box';
    sortBox.innerHTML = `
        <select id="sort-select">
            <option value="az">Tên A-Z</option>
            <option value="za">Tên Z-A</option>
            <option value="newest">Mới nhất</option>
            <option value="oldest">Cũ nhất</option>
            <option value="popular">Phổ biến</option>
        </select>
    `;
    
    // Add to container
    searchSortContainer.appendChild(searchBox);
    searchSortContainer.appendChild(sortBox);
    
    // Insert before lesson list
    lessonListDiv.parentNode.insertBefore(searchSortContainer, lessonListDiv);
    
    // Add event listeners
    const searchInput = document.getElementById('search-input');
    let debounceTimeout;
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(filterAndRenderLessons, 2000);
    });
    
    document.getElementById('sort-select').addEventListener('change', filterAndRenderLessons);
}

// Initialize the admin panel when the page loads
document.addEventListener('DOMContentLoaded', () => {
    createSearchAndSortElements(); // Add search and sort elements
    ensureAdminPaginationContainer(); // Add pagination controls container
    showLoader(true); // Show loader immediately
    
    // Load tags and then lessons
    loadTags().then(() => {
        loadLessonsForAdmin(); // This will handle hiding the loader
    });

    // Initialize event listener for the review lesson form
    const form = document.getElementById('review-lesson-form');
    if (form) {
        form.addEventListener('submit', handleReviewLessonSubmit);
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

