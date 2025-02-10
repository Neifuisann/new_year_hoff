document.addEventListener('DOMContentLoaded', () => {
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
            const response = await fetch('/api/gallery-images');
            images = await response.json();
            if (images.length > 0) {
                showImage(currentImageIndex);
                createPreviewStrip();
            }
            updateCounter();
        } catch (error) {
            console.error('Error loading images:', error);
            galleryContent.innerHTML = '<div style="color: red;">Error loading images</div>';
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
        
        isTransitioning = true;
        const oldImg = galleryContent.querySelector('img');
        const img = document.createElement('img');
        img.src = images[index];
        img.alt = `Gallery image ${index + 1}`;
        img.style.opacity = '0';
        img.style.transform = direction === 'next' ? 'translateX(100%)' : 'translateX(-100%)';
        
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
            modalImage.src = images[index];
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
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