const autoScroll = {
    active: false,
    speed: 0,
    scrollContainer: null,
    
    start(container) {
        this.scrollContainer = container;
        if (!this.active) {
            this.active = true;
            this.scroll();
        }
    },
    
    stop() {
        this.active = false;
        this.speed = 0;
        this.scrollContainer = null;
    },
    
    scroll() {
        if (this.active && this.speed !== 0) {
            this.scrollContainer.scrollTop += this.speed;
            requestAnimationFrame(() => this.scroll());
        }
    },
    
    update(event, container) {
        const rect = container.getBoundingClientRect();
        const sensitivity = 50; // Pixels from edge to start scrolling
        const maxSpeed = 10;
        
        if (event.clientY - rect.top < sensitivity) {
            this.speed = -maxSpeed * (1 - ((event.clientY - rect.top) / sensitivity));
        } else if (rect.bottom - event.clientY < sensitivity) {
            this.speed = maxSpeed * (1 - ((rect.bottom - event.clientY) / sensitivity));
        } else {
            this.speed = 0;
        }
    }
};


const createDragBoundary = (element) => {
    const boundary = document.createElement('div');
    boundary.className = 'drag-boundary';
    const rect = element.getBoundingClientRect();
    
    boundary.style.position = 'fixed';
    boundary.style.top = `${rect.top}px`;
    boundary.style.left = `${rect.left}px`;
    boundary.style.width = `${rect.width}px`;
    boundary.style.height = `${rect.height}px`;
    boundary.style.border = '2px dashed #007bff';
    boundary.style.pointerEvents = 'none';
    boundary.style.zIndex = '1000';
    
    document.body.appendChild(boundary);
    return boundary;
}; 