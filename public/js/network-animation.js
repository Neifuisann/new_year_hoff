class NetworkAnimation {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.nodes = [];
        this.connections = [];
        this.mouse = { x: 0, y: 0 };
        this.nodeCount = 40;
        this.connectionDistance = 200;
        this.isAnimating = true;
        this.color = '#4e54c8';

        // Set canvas size
        this.resize();
        
        // Event listeners
        window.addEventListener('resize', () => this.resize());
        canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        
        // Initialize nodes
        this.initNodes();
        
        // Start animation
        this.animate();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    initNodes() {
        for (let i = 0; i < this.nodeCount; i++) {
            this.nodes.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                radius: Math.random() * 1.5 + 1,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5
            });
        }
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = e.clientX - rect.left;
        this.mouse.y = e.clientY - rect.top;
    }

    drawNode(node) {
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        this.ctx.fillStyle = this.color;
        this.ctx.fill();
    }

    drawConnection(node1, node2, distance) {
        const opacity = 1 - (distance / this.connectionDistance);
        this.ctx.beginPath();
        this.ctx.moveTo(node1.x, node1.y);
        this.ctx.lineTo(node2.x, node2.y);
        this.ctx.strokeStyle = `rgba(78, 84, 200, ${opacity * 0.5})`;
        this.ctx.lineWidth = 0.3;
        this.ctx.stroke();
    }

    updateNodes() {
        this.nodes.forEach(node => {
            // Update position
            node.x += node.vx;
            node.y += node.vy;

            // Bounce off walls
            if (node.x < 0 || node.x > this.canvas.width) node.vx *= -1;
            if (node.y < 0 || node.y > this.canvas.height) node.vy *= -1;

            // Mouse interaction
            const dx = this.mouse.x - node.x;
            const dy = this.mouse.y - node.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < 120) {
                node.x -= dx * 0.02;
                node.y -= dy * 0.02;
            }
        });
    }

    drawConnections() {
        for (let i = 0; i < this.nodes.length; i++) {
            for (let j = i + 1; j < this.nodes.length; j++) {
                const dx = this.nodes[i].x - this.nodes[j].x;
                const dy = this.nodes[i].y - this.nodes[j].y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < this.connectionDistance) {
                    this.drawConnection(this.nodes[i], this.nodes[j], distance);
                }
            }
        }
    }

    animate() {
        if (!this.isAnimating) return;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Update and draw
        this.updateNodes();
        this.drawConnections();
        this.nodes.forEach(node => this.drawNode(node));

        // Request next frame
        requestAnimationFrame(() => this.animate());
    }

    start() {
        this.isAnimating = true;
        this.animate();
    }

    stop() {
        this.isAnimating = false;
    }
}

// Initialize animation when document is loaded
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('network-canvas');
    if (canvas) {
        new NetworkAnimation(canvas);
    }
}); 