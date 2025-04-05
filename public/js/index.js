let displayedLessons = []; // Renamed from allLessons
let allTags = []; // To store tags fetched from API
let currentPage = 1;
const lessonsPerPage = 10; // Adjust as needed
let totalLessons = 0;
let currentSearch = '';
let currentSort = 'newest';
let isLoading = false;
let currentStudent = null; // Store student info

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

async function loadLessons() {
    if (isLoading) return; // Prevent concurrent loads
    isLoading = true;
    showLoader(true);
    try {
        // Construct API URL with parameters
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
            const errorData = await response.text();
            throw new Error(`Failed to fetch lessons: ${response.status} ${errorData}`);
        }
        
        const data = await response.json();
        console.log('Loaded lessons page:', data);
        
        displayedLessons = data.lessons || [];
        totalLessons = data.total || 0;
        
        renderLessons(displayedLessons); // Render only the current page's lessons
        updatePaginationControls();

        // Do NOT update tags here, tags are loaded separately

    } catch (error) {
        console.error('Error loading lessons:', error);
        const lessonsContainer = document.getElementById('lessons');
        if (lessonsContainer) {
            lessonsContainer.innerHTML = `<p class="error-message">Error loading lessons: ${error.message}. Please try again later.</p>`;
        }
    } finally {
        showLoader(false);
        isLoading = false;
    }
}

// Modified function: Now just triggers a reload by resetting page and calling loadLessons
function filterAndRenderLessons() {
    currentSearch = document.getElementById('search-input').value.toLowerCase();
    currentSort = document.getElementById('sort-select').value;
    currentPage = 1; // Reset to first page for new search/sort
    loadLessons(); // Fetch data from backend with new filters
}

// Modified function: Renders tags fetched from /api/tags
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

function closeModal() {
    const modal = document.getElementById('user-info-modal');
    modal.classList.remove('show');
}

// --- NEW: Check student authentication ---
async function checkStudentAuthentication() {
    try {
        const response = await fetch('/api/check-student-auth');
        if (!response.ok) {
            // If API fails, assume not logged in for safety
            throw new Error('Auth check failed');
        }
        const authData = await response.json();

        if (authData.isAuthenticated && authData.student) {
            currentStudent = authData.student;
            console.log('Student authenticated:', currentStudent.name);
            return true; // Authenticated
        } else {
            // Not authenticated, redirect to login
            console.log('Student not authenticated, redirecting...');
            // Include current page as redirect target
            const currentUrl = window.location.pathname + window.location.search;
            window.location.href = '/student/login?redirect=' + encodeURIComponent(currentUrl);
            return false; // Not authenticated
        }
    } catch (error) {
        console.error('Error checking student authentication:', error);
        // Redirect to login on error
        window.location.href = '/student/login'; 
        return false; // Treat error as not authenticated
    }
}

// --- NEW: Handle logout ---
async function handleLogout() {
    try {
        const response = await fetch('/api/student/logout', { method: 'POST' });
        const result = await response.json();
        if (result.success) {
            console.log('Logout successful');
            window.location.href = '/student/login'; // Redirect to login page after logout
        } else {
            alert('Logout failed: ' + (result.message || 'Unknown error'));
        }
    } catch (error) {
        console.error('Logout error:', error);
        alert('An error occurred during logout.');
    }
}

// --- MODIFIED: Start Lesson - Remove modal, rely on session ---
function startLesson(lessonId) {
    // No modal needed, authentication is checked on page load
    // Simply navigate to the lesson page
    window.location.href = `/lesson/${lessonId}`;
}

// Modified function: Renders only the lessons passed to it
function renderLessons(lessonsToRender) {
    const lessonsContainer = document.getElementById('lessons');
    
    // **Important**: Clear container ONLY when loading page 1
    if (currentPage === 1) {
         lessonsContainer.innerHTML = '';
    }
    
    if (lessonsToRender.length === 0 && currentPage === 1) {
        const noResults = document.createElement('p');
        noResults.className = 'no-results';
        noResults.textContent = 'No results found';
        lessonsContainer.innerHTML = '';
        lessonsContainer.appendChild(noResults);
        return;
    }

    lessonsToRender.forEach(lesson => {
        const lessonDiv = document.createElement('div');
        lessonDiv.className = 'lesson-card';
        lessonDiv.style.setProperty('--lesson-bg', lesson.color || '#a4aeff');
        
        const tagsHtml = lesson.tags ? 
            `<div class="lesson-tags">
                ${lesson.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
            </div>` : '';
        
        // Add lesson image or placeholder in a container
        const imageHtml = `
            <div class="lesson-image-container">
                ${lesson.lessonImage ? 
                    `<img src="${lesson.lessonImage}" alt="${lesson.title}" class="lesson-image">` :
                    `<div class="lesson-image-placeholder">📚</div>`
                }
            </div>`;
        
        lessonDiv.innerHTML = `
            <div class="lesson-content">
                <h3>${lesson.title}</h3>
                <button onclick="startLesson('${lesson.id}')" class="start-btn">
                    Làm bài
                </button>
            </div>
            ${imageHtml}
            ${tagsHtml}
        `;
        lessonsContainer.appendChild(lessonDiv);
    });
}

// --- PAGINATION FUNCTIONS ---
function updatePaginationControls() {
    const paginationContainer = document.getElementById('pagination-controls');
    if (!paginationContainer) return; // Exit if container doesn't exist

    paginationContainer.innerHTML = ''; // Clear existing controls
    const totalPages = Math.ceil(totalLessons / lessonsPerPage);

    if (totalPages <= 1) return; // No controls needed for 0 or 1 page

    // Previous Button
    const prevButton = document.createElement('button');
    prevButton.textContent = 'Trước';
    prevButton.disabled = currentPage === 1;
    prevButton.onclick = () => {
        if (currentPage > 1) {
            currentPage--;
            loadLessons();
        }
    };
    paginationContainer.appendChild(prevButton);

    // Page Number Indicator (Simple version)
    const pageInfo = document.createElement('span');
    pageInfo.textContent = ` Trang ${currentPage} trên ${totalPages} `;
    pageInfo.style.margin = '0 10px'; // Add some spacing
    paginationContainer.appendChild(pageInfo);

    // Next Button
    const nextButton = document.createElement('button');
    nextButton.textContent = 'Tiếp';
    nextButton.disabled = currentPage === totalPages;
    nextButton.onclick = () => {
        if (currentPage < totalPages) {
            currentPage++;
            loadLessons();
        }
    };
    paginationContainer.appendChild(nextButton);
}

// Create pagination container dynamically if it doesn't exist
function ensurePaginationContainer() {
    let container = document.getElementById('pagination-controls');
    if (!container) {
        container = document.createElement('div');
        container.id = 'pagination-controls';
        container.style.textAlign = 'center'; // Center the controls
        container.style.marginTop = '20px'; // Add space above
        // Insert it after the lessons container
        const lessonsDiv = document.getElementById('lessons');
        if (lessonsDiv && lessonsDiv.parentNode) {
            lessonsDiv.parentNode.insertBefore(container, lessonsDiv.nextSibling);
        } else {
            // Fallback: append to main content
            const mainContent = document.querySelector('.main-content');
            mainContent?.appendChild(container);
        }
    }
}
// --- END PAGINATION FUNCTIONS ---

// Check admin authentication status
async function checkAdminAuth() {
    try {
        const response = await fetch('/api/check-auth');
        const data = await response.json();
        return data.isAuthenticated;
    } catch (error) {
        console.error('Error checking auth status:', error);
        return false;
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', async () => {
    // --- NEW: Perform authentication check first ---
    const isAuthenticated = await checkStudentAuthentication();
    if (!isAuthenticated) {
        // Stop further execution if not authenticated (redirect already happened)
        return; 
    }
    // --- END NEW ---

    ensurePaginationContainer(); // Make sure the pagination div exists
    // Show loader immediately while data loads
    showLoader(true); 
    
    // Load tags then lessons
    await loadTags();
    await loadLessons();
    
    // Add event listener for search input with debounce
    const searchInput = document.getElementById('search-input');
    let debounceTimeout;
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(filterAndRenderLessons, 300);
    });
    
    // Add event listener for sort select
    document.getElementById('sort-select').addEventListener('change', filterAndRenderLessons);

    // Dark mode toggle
    const darkModeLink = document.querySelector('.dark-mode-link');
    if (darkModeLink) {
        darkModeLink.addEventListener('click', (e) => {
            e.preventDefault();
            document.body.classList.toggle('dark-mode');
            // Store preference
            const isDarkMode = document.body.classList.contains('dark-mode');
            localStorage.setItem('darkMode', isDarkMode);
        });

        // Check for saved dark mode preference
        if (localStorage.getItem('darkMode') === 'true') {
            document.body.classList.add('dark-mode');
        }
    }
    
    // Editor mode link protection
    const editorLink = document.querySelector('.editor-link');
    if (editorLink) {
        editorLink.addEventListener('click', async (e) => {
            e.preventDefault();
            const isAuthenticated = await checkAdminAuth();
            if (!isAuthenticated) {
                window.location.href = '/admin/login';
            } else {
                window.location.href = '/admin';
            }
        });
    }
});