let displayedLessons = []; // Renamed from allLessons
let allTags = []; // To store tags fetched from API
let currentPage = 1;
const lessonsPerPage = 10; // Adjust as needed
let totalLessons = 0;
let currentSearch = '';
let currentSort = 'newest';
let isLoading = false;

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
    heading.textContent = 'Popular Tags';
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

function startLesson(lessonId) {
    const modal = document.getElementById('user-info-modal');
    modal.classList.add('show');
    
    const form = document.getElementById('user-info-form');
    form.onsubmit = async (e) => {
        e.preventDefault();
        
        const studentInfo = {
            name: document.getElementById('student-name').value,
            dob: document.getElementById('student-dob').value || null,
            studentId: document.getElementById('student-id').value || null
        };
        
        try {
            // Store student info in session first
            const response = await fetch('/api/student-info', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(studentInfo)
            });

            if (!response.ok) {
                throw new Error('Failed to store student info');
            }

            // Store in localStorage for client-side use
            localStorage.setItem('studentInfo', JSON.stringify(studentInfo));
            
            // Navigate to lesson
            window.location.href = `/lesson/${lessonId}`;
        } catch (error) {
            console.error('Error storing student info:', error);
            alert('Error starting lesson. Please try again.');
        }
    };
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
    prevButton.textContent = 'Previous';
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
    pageInfo.textContent = ` Page ${currentPage} of ${totalPages} `;
    pageInfo.style.margin = '0 10px'; // Add some spacing
    paginationContainer.appendChild(pageInfo);

    // Next Button
    const nextButton = document.createElement('button');
    nextButton.textContent = 'Next';
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