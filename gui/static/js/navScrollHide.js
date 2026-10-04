class ScrollHide {
    constructor(element, options = {}) {
        this.container = typeof element === 'string'
            ? document.querySelector(element)
            : element;

        if (!this.container) {
            console.error('ScrollHide: 目标元素未找到');
            return;
        }

        this.settings = {
            speed: 50,
            smooth: true,
            ...options
        };

        this.isScrolling = false;
        this.startY = 0;

        this.handleWheel = this.handleWheel.bind(this);
        this.handleTouchStart = this.handleTouchStart.bind(this);
        this.handleTouchMove = this.handleTouchMove.bind(this);
        this.init();
    }

    init() {
        this.container.style.overflow = 'hidden';
        this.container.style.position = 'relative';
        this.bindEvents();
    }

    bindEvents() {
        this.container.addEventListener('wheel', this.handleWheel, { passive: false });
        this.container.addEventListener('touchstart', this.handleTouchStart, { passive: false });
        this.container.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    }

    handleWheel(e) {
        e.preventDefault();

        if (this.isScrolling) return;
        this.isScrolling = true;

        const scrollAmount = e.deltaY > 0 ? this.settings.speed : -this.settings.speed;

        if (this.settings.smooth) {
            this.smoothScroll(scrollAmount);
        } else {
            this.container.scrollTop += scrollAmount;
            this.isScrolling = false;
        }
    }

    smoothScroll(amount) {
        const start = this.container.scrollTop;
        const end = start + amount;
        const duration = 200;
        const startTime = performance.now();

        const animateScroll = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            this.container.scrollTop = start + (amount * progress);

            if (progress < 1) {
                requestAnimationFrame(animateScroll);
            } else {
                this.isScrolling = false;
            }
        };

        requestAnimationFrame(animateScroll);
    }

    handleTouchStart(e) {
        this.startY = e.touches[0].clientY;
    }

    handleTouchMove(e) {
        e.preventDefault();
        const y = e.touches[0].clientY;
        const diff = this.startY - y;
        this.container.scrollTop += diff;
        this.startY = y;
    }

    // 更新配置
    update(options) {
        this.settings = { ...this.settings, ...options };
    }

    // 销毁方法
    destroy() {
        this.container.removeEventListener('wheel', this.handleWheel);
        this.container.removeEventListener('touchstart', this.handleTouchStart);
        this.container.removeEventListener('touchmove', this.handleTouchMove);

        this.container.style.overflow = '';
        this.container.style.position = '';
    }
}
window.ScrollHide = ScrollHide;