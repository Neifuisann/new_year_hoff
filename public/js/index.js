let allLessons = [];

async function loadLessons() {
    try {
        const response = await fetch('/api/lessons');
        const lessons = await response.json();
        allLessons = lessons;
        renderLessons(lessons);
        // Update tags list immediately after loading lessons
        updateTagsList();
    } catch (error) {
        console.error('Error loading lessons:', error);
    }
}

function filterAndRenderLessons() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    
    // Filter lessons based on search term and tags
    let filteredLessons = allLessons.filter(lesson => {
        const matchesTitle = lesson.title.toLowerCase().includes(searchTerm);
        const matchesTags = lesson.tags && lesson.tags.some(tag => 
            tag.toLowerCase().includes(searchTerm)
        );
        return matchesTitle || matchesTags;
    });
    
    const sortMethod = document.getElementById('sort-select').value;
    const lessonsContainer = document.getElementById('lessons');
    
    // Sort lessons based on selected method
    filteredLessons = sortLessons(filteredLessons, sortMethod);
    
    // Clear container
    lessonsContainer.innerHTML = '';
    
    if (filteredLessons.length === 0) {
        lessonsContainer.innerHTML = '<p class="no-results">No lessons found matching your search.</p>';
        return;
    }
    
    // Render filtered and sorted lessons
    filteredLessons.forEach(lesson => {
        const lessonDiv = document.createElement('div');
        lessonDiv.className = 'lesson-card';
        lessonDiv.style.setProperty('--lesson-bg', lesson.color || '#a4aeff');
        
        const tagsHtml = lesson.tags ? 
            `<div class="lesson-tags">
                ${lesson.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
             </div>` : '';
        
        lessonDiv.innerHTML = `
            <div class="lesson-content">
                <h3>${lesson.title}</h3>
                <p>${lesson.questions?.length || 0} questions</p>
                <button onclick="startLesson('${lesson.id}')" class="start-btn">Start Lesson</button>
            </div>
            ${tagsHtml}
        `;
        lessonsContainer.appendChild(lessonDiv);
    });
}

function sortLessons(lessons, method) {
    switch (method) {
        case 'newest':
            return [...lessons].sort((a, b) => b.id - a.id);
        case 'oldest':
            return [...lessons].sort((a, b) => a.id - b.id);
        case 'az':
            return [...lessons].sort((a, b) => a.title.localeCompare(b.title));
        case 'za':
            return [...lessons].sort((a, b) => b.title.localeCompare(a.title));
        case 'newest-changed':
            return [...lessons].sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
        case 'popular':
            return [...lessons].sort((a, b) => b.views - a.views);
        default:
            return lessons;
    }
}

function updateTagsList() {
    const allTags = new Set();
    allLessons.forEach(lesson => {
        if (lesson.tags) {
            lesson.tags.forEach(tag => allTags.add(tag));
        }
    });
    
    const tagsContainer = document.querySelector('.tags-container');
    if (!tagsContainer) return;
    
    // Clear existing content
    tagsContainer.innerHTML = '';
    
    // Create and append the heading
    const heading = document.createElement('h3');
    heading.textContent = 'Popular Tags';
    tagsContainer.appendChild(heading);
    
    // Create and append the tags list container
    const tagsList = document.createElement('div');
    tagsList.className = 'tags-list';
    
    // Add tags to the list
    Array.from(allTags).sort().forEach(tag => {
        const tagButton = document.createElement('button');
        tagButton.className = 'tag-filter';
        tagButton.textContent = tag;
        tagButton.onclick = () => {
            document.getElementById('search-input').value = tag;
            filterAndRenderLessons();
        };
        tagsList.appendChild(tagButton);
    });
    
    tagsContainer.appendChild(tagsList);
}

function closeModal() {
    const modal = document.getElementById('user-info-modal');
    modal.classList.remove('show');
    // No need for setTimeout since we're using CSS transitions
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

function renderLessons(lessons) {
    const lessonsContainer = document.getElementById('lessons');
    lessonsContainer.innerHTML = lessons.map(lesson => `
        <div class="lesson-card" style="--lesson-bg: ${lesson.color || '#a4aeff'}">
            <div class="lesson-content">
                <h3>${lesson.title}</h3>
                <p>${lesson.questions?.length || 0} questions</p>
                <button onclick="startLesson('${lesson.id}')" class="start-btn">Start Lesson</button>
            </div>
            <div class="lesson-tags">
                ${(lesson.tags || []).map(tag => `<span class="tag">${tag}</span>`).join('')}
            </div>
        </div>
    `).join('');
}

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
    loadLessons();
    
    // Add event listener for search input
    document.getElementById('search-input').addEventListener('input', filterAndRenderLessons);
    
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

    // Account link (placeholder)
    const accountLink = document.querySelector('.account-link');
    if (accountLink) {
        accountLink.addEventListener('click', (e) => {
            e.preventDefault();
            alert('Account functionality coming soon!');
        });
    }

    // Logout link (placeholder)
    const logoutLink = document.querySelector('.logout-link');
    if (logoutLink) {
        logoutLink.addEventListener('click', (e) => {
            e.preventDefault();
            alert('Logout functionality coming soon!');
        });
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