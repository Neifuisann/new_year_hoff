document.addEventListener('DOMContentLoaded', async () => {
    // --- NEW: Perform authentication check first ---
    const isAuthenticated = await checkStudentAuthentication();
    if (!isAuthenticated) {
        // Stop further execution if not authenticated (redirect already happened)
        return; 
    }
    // --- END NEW ---

    let currentImageIndex = 0;
    let images = [];
    let isTransitioning = false;
    const TRANSITION_DURATION = 300; // match this with CSS transition duration
    
    const galleryContent = document.querySelector('.gallery-content');
    const previewStrip = document.querySelector('.preview-strip');
    const prevButton = document.querySelector('.prev-arrow');
    const nextButton = document.querySelector('.next-arrow');
    const modal = document.querySelector('.image-modal');
    const modalImage = document.querySelector('.modal-image');
    const closeModal = document.querySelector('.close-modal');
    const imageCounter = document.querySelector('.image-counter');

    // Load images from the server
    async function loadImages() {
        try {
            galleryContent.classList.add('loading');
            
            // Clear any existing content and add loading indicator
            galleryContent.innerHTML = '<div class="loading-indicator">Đang tải ảnh...</div>';
            
            const response = await fetch('/api/gallery-images');
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            
            images = await response.json();
            
            if (!Array.isArray(images)) {
                console.error('Server returned non-array data:', images);
                throw new Error('Invalid data format received from server');
            }
            
            // Filter out any undefined or invalid image paths
            images = images.filter(img => img && typeof img === 'string');
            
            // Clear loading indicator
            galleryContent.innerHTML = '';
            
            if (images.length > 0) {
                showImage(currentImageIndex);
                createPreviewStrip();
            } else {
                galleryContent.innerHTML = '<div class="error-message">Không có ảnh nào</div>';
            }
            updateCounter();
        } catch (error) {
            console.error('Lỗi tải ảnh:', error);
            galleryContent.innerHTML = `<div class="error-message">Lỗi tải ảnh: ${error.message}</div>`;
        } finally {
            galleryContent.classList.remove('loading');
        }
    }

    function createPreviewStrip() {
        previewStrip.innerHTML = '';
        images.forEach((src, index) => {
            const img = document.createElement('img');
            img.src = src;
            img.alt = `Preview ${index + 1}`;
            img.className = index === currentImageIndex ? 'active' : '';
            img.addEventListener('click', () => {
                if (!isTransitioning && currentImageIndex !== index) {
                    currentImageIndex = index;
                    showImage(currentImageIndex);
                }
            });
            previewStrip.appendChild(img);
        });
    }

    function updatePreviewStrip() {
        const previews = previewStrip.querySelectorAll('img');
        previews.forEach((preview, index) => {
            preview.className = index === currentImageIndex ? 'active' : '';
        });
        
        // Scroll the active preview into view
        const activePreview = previews[currentImageIndex];
        if (activePreview) {
            const isMobile = window.innerWidth <= 768;
            const scrollOptions = {
                behavior: 'smooth',
                [isMobile ? 'left' : 'top']: activePreview.offsetTop - (isMobile ? 10 : 200)
            };
            previewStrip.scrollTo(scrollOptions);
        }
    }

    function updateCounter() {
        imageCounter.textContent = `${currentImageIndex + 1} / ${images.length}`;
    }

    function showImage(index, direction = 'next') {
        if (images.length === 0 || isTransitioning) return;
        
        // Validate index is within bounds
        if (index < 0 || index >= images.length) {
            console.error('Invalid image index:', index);
            return;
        }
        
        // Ensure image exists at this index
        if (!images[index]) {
            console.error('No image found at index:', index);
            return;
        }
        
        // Clear any loading or error messages first
        const loadingIndicator = galleryContent.querySelector('.loading-indicator');
        const errorMessage = galleryContent.querySelector('.error-message');
        if (loadingIndicator) loadingIndicator.remove();
        if (errorMessage) errorMessage.remove();
        
        isTransitioning = true;
        const oldImg = galleryContent.querySelector('img');
        const img = document.createElement('img');
        img.src = images[index];
        img.alt = `Gallery image ${index + 1}`;
        img.style.opacity = '0';
        img.style.transform = direction === 'next' ? 'translateX(100%)' : 'translateX(-100%)';
        
        // Add error handling for image loading
        img.onerror = function() {
            console.error('Failed to load image:', images[index]);
            img.src = '/images/lesson1.jpg'; // Fallback to an existing image
            img.alt = 'Image not available';
        };
        
        if (oldImg) {
            oldImg.style.transform = direction === 'next' ? 'translateX(-100%)' : 'translateX(100%)';
            oldImg.style.opacity = '0';
        }
        
        galleryContent.appendChild(img);
        
        // Trigger reflow
        img.offsetHeight;
        
        img.style.transition = 'all 0.3s ease';
        img.style.transform = 'translateX(0)';
        img.style.opacity = '1';
        
        img.addEventListener('click', () => {
            if (modalImage && images[index]) {
                modalImage.src = images[index];
                modal.classList.add('active');
                document.body.style.overflow = 'hidden';
            }
        });
        
        // Remove old image after transition
        if (oldImg) {
            setTimeout(() => {
                oldImg.remove();
                isTransitioning = false;
            }, TRANSITION_DURATION);
        } else {
            isTransitioning = false;
        }
        
        updateCounter();
        updatePreviewStrip();
    }

    // Event Listeners with debounce for navigation
    function handleNavigation(direction) {
        if (!isTransitioning) {
            if (direction === 'prev') {
                currentImageIndex = (currentImageIndex - 1 + images.length) % images.length;
            } else {
                currentImageIndex = (currentImageIndex + 1) % images.length;
            }
            showImage(currentImageIndex, direction);
        }
    }

    prevButton.addEventListener('click', () => handleNavigation('prev'));
    nextButton.addEventListener('click', () => handleNavigation('next'));

    closeModal.addEventListener('click', () => {
        modal.classList.remove('active');
        setTimeout(() => {
            modalImage.src = '';
            document.body.style.overflow = '';
        }, 300);
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
            setTimeout(() => {
                modalImage.src = '';
                document.body.style.overflow = '';
            }, 300);
        }
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (modal.classList.contains('active')) {
            if (e.key === 'Escape') {
                modal.classList.remove('active');
                setTimeout(() => {
                    modalImage.src = '';
                    document.body.style.overflow = '';
                }, 300);
            }
        } else {
            if (e.key === 'ArrowLeft') {
                handleNavigation('prev');
            } else if (e.key === 'ArrowRight') {
                handleNavigation('next');
            }
        }
    });

    // Initialize
    loadImages();
});

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
            console.log('Student authenticated:', authData.student.name);
            // Display student name and logout button
            document.getElementById('student-name-display').textContent = `Chào, ${authData.student.name}!`;
            document.getElementById('student-info-area').style.display = 'flex'; // Use flex for better alignment
            document.getElementById('logout-button').addEventListener('click', handleLogout);
            return true; // Authenticated
        } else {
            // Not authenticated, redirect to login
            console.log('Student not authenticated, redirecting...');
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