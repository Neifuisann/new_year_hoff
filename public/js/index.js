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

// Check student authentication with local storage caching
async function checkStudentAuthentication() {
    try {
        // Check local storage for cached auth data first
        const cachedAuth = localStorage.getItem('studentAuthCache');
        const cacheTimestamp = localStorage.getItem('studentAuthCacheTime');
        
        // Cache is valid for 5 minutes (300000ms)
        const CACHE_VALIDITY = 300000; 
        const now = Date.now();
        
        // Check if we have a valid cache
        if (cachedAuth && cacheTimestamp && (now - parseInt(cacheTimestamp) < CACHE_VALIDITY)) {
            // Use cached auth data
            console.log('Using cached auth data from localStorage');
            const authData = JSON.parse(cachedAuth);
            
            if (authData.isAuthenticated && authData.student) {
                currentStudent = authData.student; // Store student info
                return true; // Authenticated from cache
            } else {
                // Cached data says not authenticated, redirect to login
                redirectToLogin();
                return false;
            }
        }
        
        // No valid cache, fetch from server
        const response = await fetch('/api/check-student-auth');
        if (!response.ok) {
            throw new Error('Auth check failed');
        }
        
        const authData = await response.json();
        
        // Cache the auth result and timestamp
        localStorage.setItem('studentAuthCache', JSON.stringify(authData));
        localStorage.setItem('studentAuthCacheTime', now.toString());
        
        if (authData.isAuthenticated && authData.student) {
            currentStudent = authData.student; // Store student info
            console.log('Student authenticated:', currentStudent.name);
            return true; // Authenticated
        } else {
            // Not authenticated, redirect to login
            redirectToLogin();
            return false;
        }
    } catch (error) {
        console.error('Error checking student authentication:', error);
        // Clear cache on error
        localStorage.removeItem('studentAuthCache');
        localStorage.removeItem('studentAuthCacheTime');
        // Redirect to login on error
        redirectToLogin();
        return false;
    }
}

// Helper function to redirect to login
function redirectToLogin() {
    console.log('Student not authenticated, redirecting...');
    const currentUrl = window.location.pathname + window.location.search;
    window.location.href = '/student/login?redirect=' + encodeURIComponent(currentUrl);
}

// Handle logout with cache clearing
async function handleLogout() {
    try {
        // Clear auth cache immediately for better UX
        localStorage.removeItem('studentAuthCache');
        localStorage.removeItem('studentAuthCacheTime');
        
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

// Modified function: Start Lesson - relies on auth check
function startLesson(lessonId) {
    // Authentication is checked on page load, so we can directly navigate
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

// Modified Event Listener: Handles initial load and auth check
document.addEventListener('DOMContentLoaded', async () => {
    showLoader(true); // Show loader immediately

    // --- Perform authentication check first --- 
    const isAuthenticated = await checkStudentAuthentication();
    if (!isAuthenticated) {
        // Stop further execution if not authenticated (redirect already happened)
        showLoader(false); // Hide loader before returning
        return; 
    }
    // --- END AUTH CHECK --- 

    // Initialize search and sort controls
    const searchInput = document.getElementById('search-input');
    const sortSelect = document.getElementById('sort-select');
    const clearSearchButton = document.getElementById('clear-search');

    if (searchInput) {
        searchInput.addEventListener('input', filterAndRenderLessons);
    }
    if (sortSelect) {
        sortSelect.addEventListener('change', filterAndRenderLessons);
    }
    if (clearSearchButton) {
        clearSearchButton.addEventListener('click', () => {
            searchInput.value = '';
            filterAndRenderLessons();
        });
    }
    
    // Ensure pagination container exists
    ensurePaginationContainer();

    // Load initial data (lessons and tags)
    await Promise.all([
        loadLessons(),
        loadTags()
    ]);
    
    // Hide loader after initial data is loaded
    showLoader(false);

    // Dark mode toggle
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
        });

        // Apply saved preference
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