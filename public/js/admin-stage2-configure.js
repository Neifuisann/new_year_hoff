// Stage 2: Configuration Script

let editingId = null;
let currentQuestions = []; // To store questions from Stage 1
let currentConfigData = {}; // To store config data being edited
let currentTags = new Set();

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Retrieve data from sessionStorage
    const stage1DataString = sessionStorage.getItem('lessonStage1Data');
    if (!stage1DataString) {
        alert('Error: Could not find lesson content data. Please start from Stage 1.');
        // Optionally redirect back to stage 1 or admin list
        window.location.href = '/admin'; // Redirect to admin list for safety
        return;
    }

    try {
        const stage1Data = JSON.parse(stage1DataString);
        currentQuestions = stage1Data.questions || [];
        editingId = stage1Data.editingId || null;

        console.log("Stage 2 Loaded. Editing ID:", editingId, "Questions Count:", currentQuestions.length);

    } catch (error) {
        console.error("Error parsing Stage 1 data:", error);
        alert('Error processing lesson data. Please try again.');
        window.location.href = '/admin';
        return;
    }

    // 2. Load existing config data if editing
    if (editingId) {
        try {
            const response = await fetch(`/api/lessons/${editingId}`);
            if (!response.ok) throw new Error('Failed to load existing lesson configuration');
            const existingLesson = await response.json();
            // We already have questions, merge the rest of the config
            currentConfigData = { ...existingLesson }; 
             // Ensure questions aren't overwritten if they exist in fetched data (use Stage 1's)
             currentConfigData.questions = currentQuestions; 
            currentTags = new Set(currentConfigData.tags || []);
            console.log("Loaded existing config:", currentConfigData);
        } catch (error) {
            console.error("Error loading existing lesson config:", error);
            alert(`Failed to load existing lesson configuration: ${error.message}`);
            // Continue with default/empty config but keep questions and ID
            currentConfigData = { 
                id: editingId, 
                questions: currentQuestions, 
                tags: [], 
                color: '#a4aeff' 
            };
            currentTags = new Set();
        }
    } else {
        // New lesson: Initialize empty config data but keep questions
        currentConfigData = {
            questions: currentQuestions,
            tags: [],
            color: '#a4aeff' 
            // Initialize other fields as needed
        };
        currentTags = new Set();
        console.log("Initializing config for new lesson");
    }

    // 3. Populate the form
    populateForm();

    // 4. Add event listeners for this page
    setupEventListeners();
});

function populateForm() {
    // Populate standard fields
    document.getElementById('lesson-title').value = currentConfigData.title || '';
    document.getElementById('lesson-color').value = currentConfigData.color || '#a4aeff';
    document.getElementById('random-questions').value = currentConfigData.randomQuestions || 0;
    document.getElementById('lesson-description').value = currentConfigData.description || '';
    
    // Populate new fields (Grade, Subject, Purpose)
    document.getElementById('lesson-grade').value = currentConfigData.grade || '';
    document.getElementById('lesson-subject').value = currentConfigData.subject || '';
    document.getElementById('lesson-purpose').value = currentConfigData.purpose || '';

    // Populate Image
    if (currentConfigData.lessonImage) {
        const imagePreview = document.getElementById('lesson-image-preview');
        const removeButton = document.querySelector('#lesson-image')?.nextElementSibling;
         if (imagePreview && removeButton) {
            imagePreview.src = currentConfigData.lessonImage;
            imagePreview.style.display = 'block';
            removeButton.style.display = 'inline-block';
        }
    }

    // Populate Tags
    renderTags();
}

function setupEventListeners() {
    // Add listeners for all configurable fields on this page
    document.getElementById('lesson-title')?.addEventListener('input', (e) => { currentConfigData.title = e.target.value; });
    document.getElementById('lesson-color')?.addEventListener('input', (e) => { currentConfigData.color = e.target.value; });
    document.getElementById('random-questions')?.addEventListener('input', (e) => { currentConfigData.randomQuestions = parseInt(e.target.value) || 0; });
    document.getElementById('lesson-description')?.addEventListener('input', (e) => { currentConfigData.description = e.target.value; });
    document.getElementById('lesson-grade')?.addEventListener('change', (e) => { currentConfigData.grade = e.target.value; });
    document.getElementById('lesson-subject')?.addEventListener('change', (e) => { currentConfigData.subject = e.target.value; });
    document.getElementById('lesson-purpose')?.addEventListener('change', (e) => { currentConfigData.purpose = e.target.value; });
    
    document.getElementById('lesson-image')?.addEventListener('change', handleLessonImageUpload);
    document.querySelector('.remove-image-btn')?.addEventListener('click', removeLessonImage);
    document.getElementById('tag-input')?.addEventListener('keydown', handleTagInputKeydown);

     // Add save shortcut
     document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveLessonConfiguration();
        }
    });
}


// --- Tag Functions (Copied from previous script) --- 
function addTag(tagName) {
    if (!tagName) return;
    tagName = tagName.toLowerCase().trim();
    const tagInput = document.getElementById('tag-input');

    if (tagName && !currentTags.has(tagName)) {
        currentTags.add(tagName);
        renderTags(); // Update UI
        // Update the config data object
        if (currentConfigData) {
            currentConfigData.tags = Array.from(currentTags);
        }
    }
    if (tagInput) tagInput.value = ''; // Clear input
}

function removeTag(tagName) {
    currentTags.delete(tagName);
    renderTags(); // Update UI
    // Update the config data object
    if (currentConfigData) {
        currentConfigData.tags = Array.from(currentTags);
    }
}

function renderTags() {
    const tagsList = document.getElementById('tags-list');
    if (!tagsList) return;
    tagsList.innerHTML = ''; // Clear current tags
    currentTags.forEach(tag => {
        const tagElement = document.createElement('span');
        tagElement.className = 'tag';
        tagElement.innerHTML = `
            ${tag}
            <button type="button" onclick="removeTag('${tag}')" title="Remove tag">&times;</button>
        `;
        tagsList.appendChild(tagElement);
    });
}

function handleTagInputKeydown(e) {
    if (e.target.id !== 'tag-input') return;

    if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const tagInput = e.target;
        const tagValue = tagInput.value.replace(',', '').trim();
        if (tagValue) {
            addTag(tagValue);
        } else {
            tagInput.value = '';
        }
    }
}

// --- Lesson Image Functions (Copied from previous script) ---
async function handleLessonImageUpload(event) {
     const input = event.target;
     if (!input || !input.files || input.files.length === 0) return;

    const file = input.files[0];
    const preview = document.getElementById('lesson-image-preview');
    const removeButton = input.closest('.image-upload-container')?.querySelector('.remove-image-btn');

    if (file && preview && removeButton) {
        try {
            const compressedDataUrl = await compressImage(file);
            preview.src = compressedDataUrl;
            preview.style.display = 'block';
            removeButton.style.display = 'inline-block';
            if (currentConfigData) {
                currentConfigData.lessonImage = compressedDataUrl;
            }
        } catch (error) {
            console.error('Error processing lesson image:', error);
            alert('Error processing lesson image. Please try again.');
            input.value = '';
        }
    }
}

function removeLessonImage() {
    const fileInput = document.getElementById('lesson-image');
    const preview = document.getElementById('lesson-image-preview');
    const removeButton = fileInput?.closest('.image-upload-container')?.querySelector('.remove-image-btn');

    if (fileInput) fileInput.value = '';
    if (preview) {
        preview.removeAttribute('src');
        preview.style.display = 'none';
    }
    if (removeButton) {
        removeButton.style.display = 'none';
    }
    if (currentConfigData) {
        currentConfigData.lessonImage = null;
    }
}

async function compressImage(file, maxSize = 800, quality = 0.7) {
     const img = new Image();
     const canvas = document.createElement('canvas');
     const ctx = canvas.getContext('2d');

     if (!window.URL || !window.URL.createObjectURL) {
         throw new Error('Browser does not support URL.createObjectURL');
     }
     const objectURL = URL.createObjectURL(file);

     try {
         await new Promise((resolve, reject) => {
             img.onload = resolve;
             img.onerror = (err) => reject(new Error(`Image loading failed: ${err.type}`));
             img.src = objectURL;
         });
         let { width, height } = img;
         if (width > maxSize || height > maxSize) {
             if (width > height) {
                 height = Math.round(height * (maxSize / width));
                 width = maxSize;
             } else {
                 width = Math.round(width * (maxSize / height));
                 height = maxSize;
             }
         }
         canvas.width = width;
         canvas.height = height;
         ctx.drawImage(img, 0, 0, width, height);
         const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
         const compressedDataUrl = canvas.toDataURL(mimeType, mimeType === 'image/png' ? undefined : quality);
         return compressedDataUrl;
     } finally {
         URL.revokeObjectURL(objectURL);
     }
}

// --- Final Save Function --- 
async function saveLessonConfiguration() {
    if (!currentConfigData || !currentQuestions) {
        alert('Error: Lesson data is missing. Please start from Stage 1.');
        return;
    }

    try {
        // --- Validation ---
        currentConfigData.title = document.getElementById('lesson-title')?.value.trim();
        currentConfigData.description = document.getElementById('lesson-description')?.value.trim();

        if (!currentConfigData.title) {
            alert('Please enter a lesson title.');
            document.getElementById('lesson-title')?.focus();
            return;
        }

        const now = new Date().toISOString();

        // Construct the final payload
        const lessonPayload = {
            // Core metadata from form
            title: currentConfigData.title,
            color: document.getElementById('lesson-color')?.value || '#a4aeff',
            randomQuestions: parseInt(document.getElementById('random-questions')?.value) || 0,
            description: currentConfigData.description,
            lessonImage: currentConfigData.lessonImage || null,
            tags: Array.from(currentTags),

            // New configuration fields
            grade: document.getElementById('lesson-grade')?.value || null,
            subject: document.getElementById('lesson-subject')?.value || null,
            purpose: document.getElementById('lesson-purpose')?.value || null,
            
            // Questions from Stage 1
            questions: currentQuestions, 
            
            lastUpdated: now
        };

        // Determine API endpoint and method
        let method = 'POST';
        let url = '/api/lessons';
        if (editingId) {
            method = 'PUT';
            url = `/api/lessons/${editingId}`;
        }

        console.log(`Saving lesson config. URL: ${url}, Method: ${method}`);

        const saveButton = document.querySelector('.save-btn');
        if (saveButton) saveButton.disabled = true;

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(lessonPayload)
        });

        if (saveButton) saveButton.disabled = false;

        if (!response.ok) {
            let errorData = { error: `Request failed with status ${response.status}` };
            try {
                errorData = await response.json();
            } catch (e) { /* Ignore if response is not JSON */ }
            console.error("Save error response:", errorData);
            throw new Error(errorData.error || errorData.message || 'Failed to save lesson configuration');
        }

        // Success - clear sessionStorage and redirect
        sessionStorage.removeItem('lessonStage1Data');
        window.location.href = '/admin';

    } catch (error) {
        console.error('Error saving lesson configuration:', error);
        alert('Error saving lesson: ' + error.message);
        const saveButton = document.querySelector('.save-btn');
        if (saveButton) saveButton.disabled = false;
    }
}

// Optional: Clear sessionStorage if the user navigates away without saving
window.addEventListener('beforeunload', () => {
    // You might want to add a confirmation here if data is unsaved
    // For simplicity, just clear it. Be cautious if user might want to go back.
    // Consider clearing only if not navigating to stage 1?
    // sessionStorage.removeItem('lessonStage1Data'); 
}); 