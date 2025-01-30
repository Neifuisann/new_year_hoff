let allLessons = [];

document.addEventListener('DOMContentLoaded', async () => {
    const response = await fetch('/api/lessons');
    allLessons = await response.json();
    
    // Add event listeners for search and sort
    document.getElementById('search-input').addEventListener('input', filterAndRenderLessons);
    document.getElementById('sort-select').addEventListener('change', filterAndRenderLessons);
    
    // Initial render
    filterAndRenderLessons();
});

function filterAndRenderLessons() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const searchBox = document.getElementById('search-input');
    
    // Filter lessons based on search term and tags
    let filteredLessons = allLessons.filter(lesson => {
        const matchesTitle = lesson.title.toLowerCase().includes(searchTerm);
        const matchesTags = lesson.tags && lesson.tags.some(tag => 
            tag.toLowerCase().includes(searchTerm)
        );
        return matchesTitle || matchesTags;
    });
    
    // Update tags list
    updateTagsList();
    
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
                <a href="/lesson/${lesson.id}" class="button">Start Lesson</a>
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
    
    tagsContainer.innerHTML = '<h3>Popular Tags</h3>';
    Array.from(allTags).sort().forEach(tag => {
        const tagButton = document.createElement('button');
        tagButton.className = 'tag-filter';
        tagButton.textContent = tag;
        tagButton.onclick = () => {
            document.getElementById('search-input').value = tag;
            filterAndRenderLessons();
        };
        tagsContainer.appendChild(tagButton);
    });
}