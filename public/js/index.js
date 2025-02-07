let allLessons = [];
let translations = {};

// Import translations
async function loadTranslations() {
    try {
        const response = await fetch('/api/translations');
        translations = await response.json();
    } catch (error) {
        console.error('Error loading translations:', error);
        // Fallback translations for critical text
        translations = {
            en: {
                questions: 'questions',
                noResults: 'No results found',
                accountSoon: 'Account feature coming soon',
                logoutSoon: 'Logout feature coming soon'
            }
        };
    }
}

async function loadLessons() {
    try {
        const response = await fetch('/api/lessons');
        const lessons = await response.json();
        console.log('Loaded lessons:', lessons);
        allLessons = lessons;
        renderLessons(allLessons);
        // Update tags list immediately after loading lessons
        updateTagsList();
    } catch (error) {
        console.error('Error loading lessons:', error);
    }
}

function filterAndRenderLessons() {
    console.log('Filtering lessons. Current allLessons:', allLessons); // Debug log
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const sortMethod = document.getElementById('sort-select').value;
    console.log('Search term:', searchTerm, 'Sort method:', sortMethod); // Debug log
    
    let filteredLessons = [...allLessons]; // Create a copy of allLessons
    
    if (searchTerm) {
        filteredLessons = filteredLessons.filter(lesson => {
            const matchesTitle = lesson.title.toLowerCase().includes(searchTerm);
            const matchesTags = lesson.tags && lesson.tags.some(tag => 
                tag.toLowerCase().includes(searchTerm)
            );
            return matchesTitle || matchesTags;
        });
    }
    
    console.log('Filtered lessons before sort:', filteredLessons); // Debug log
    filteredLessons = sortLessons(filteredLessons, sortMethod);
    console.log('Filtered lessons after sort:', filteredLessons); // Debug log
    
    renderLessons(filteredLessons);
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
    
    tagsContainer.innerHTML = '';
    
    const heading = document.createElement('h3');
    heading.setAttribute('data-i18n', 'popularTags');
    heading.textContent = translations[currentLang()].popularTags;
    tagsContainer.appendChild(heading);
    
    const tagsList = document.createElement('div');
    tagsList.className = 'tags-list';
    
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
    const currentLanguage = currentLang();
    
    // Ensure translations exist for current language
    if (!translations[currentLanguage]) {
        translations[currentLanguage] = {
            questions: 'questions',
            startLesson: 'Làm bài',
            noResults: 'No results found'
        };
    }
    
    if (lessons.length === 0) {
        const noResults = document.createElement('p');
        noResults.className = 'no-results';
        noResults.setAttribute('data-i18n', 'noResults');
        noResults.textContent = translations[currentLanguage].noResults;
        lessonsContainer.innerHTML = '';
        lessonsContainer.appendChild(noResults);
        return;
    }

    lessonsContainer.innerHTML = '';
    
    lessons.forEach(lesson => {
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
                <button onclick="startLesson('${lesson.id}')" class="start-btn" data-i18n="startLesson">
                    ${translations[currentLanguage].startLesson}
                </button>
            </div>
            ${imageHtml}
            ${tagsHtml}
        `;
        lessonsContainer.appendChild(lessonDiv);
    });
    
    // Update any new elements with translations
    if (typeof updateTexts === 'function') {
        updateTexts(currentLanguage);
    }
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

// Add helper function to get current language
function currentLang() {
    return localStorage.getItem('language') || 'en';
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', async () => {
    // Load translations first
    await loadTranslations();
    // Then load lessons
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

    // Update account link handler
    const accountLink = document.querySelector('.account-link');
    if (accountLink) {
        accountLink.addEventListener('click', (e) => {
            e.preventDefault();
            alert(translations[currentLang()].accountSoon);
        });
    }

    // Update logout link handler
    const logoutLink = document.querySelector('.logout-link');
    if (logoutLink) {
        logoutLink.addEventListener('click', (e) => {
            e.preventDefault();
            alert(translations[currentLang()].logoutSoon);
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