// ===== ENHANCED ADMIN DASHBOARD JAVASCRIPT =====
// Professional educational management system with improved UX

let displayedLessons = [];
let currentPage = 1;
const lessonsPerPage = 10; // Reduced for better overview
let totalLessons = 0;
let isLoading = false;
let allTags = [];
let currentSearch = '';
let currentSort = 'newest'; // Default to newest
let currentTags = [];
let completeTagsData = null; // Cache for complete tags data

const LESSONS_CACHE_TTL_MS = 300000;
const LESSONS_PREFETCH_NEIGHBOR_PAGES = 2;
const LESSONS_CACHE_STORAGE_KEY = 'adminLessonsCache:v1';
const LESSONS_CACHE_INVALIDATION_KEY = 'adminLessonsCacheInvalidate:v1';
const TAGS_CACHE_TTL_MS = 300000;
const TAGS_CACHE_STORAGE_KEY = 'adminTagsCache:v1';
const STATS_CACHE_TTL_MS = 180000;
const STATS_CACHE_STORAGE_KEY = 'adminStatsCache:v1';
const lessonsRequestCache = new Map();
const inFlightLessonRequests = new Map();

function readSessionCache(key, ttlMs) {
    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        if (typeof parsed.timestamp !== 'number') return null;
        if (!('data' in parsed)) return null;
        const isExpired = (Date.now() - parsed.timestamp) > ttlMs;
        return isExpired ? null : parsed.data;
    } catch (error) {
        console.warn(`Failed to read session cache for ${key}:`, error);
        return null;
    }
}

function writeSessionCache(key, data) {
    try {
        sessionStorage.setItem(key, JSON.stringify({
            timestamp: Date.now(),
            data
        }));
    } catch (error) {
        console.warn(`Failed to write session cache for ${key}:`, error);
    }
}

function loadLessonsCacheFromStorage() {
    try {
        const raw = sessionStorage.getItem(LESSONS_CACHE_STORAGE_KEY);
        if (!raw) return;

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return;

        Object.entries(parsed).forEach(([key, entry]) => {
            if (!entry || typeof entry !== 'object') return;
            if (typeof entry.timestamp !== 'number') return;
            if (!('data' in entry)) return;

            const isExpired = (Date.now() - entry.timestamp) > LESSONS_CACHE_TTL_MS;
            if (!isExpired) {
                lessonsRequestCache.set(key, {
                    timestamp: entry.timestamp,
                    data: entry.data
                });
            }
        });
    } catch (error) {
        console.warn('Failed to hydrate lessons cache from sessionStorage:', error);
    }
}

function persistLessonsCacheToStorage() {
    try {
        const serializable = Object.fromEntries(lessonsRequestCache.entries());
        sessionStorage.setItem(LESSONS_CACHE_STORAGE_KEY, JSON.stringify(serializable));
    } catch (error) {
        console.warn('Failed to persist lessons cache to sessionStorage:', error);
    }
}

function invalidateLessonsCacheByPages(pages) {
    const pageSet = new Set(
        (pages || [])
            .map((page) => Number(page))
            .filter((page) => Number.isFinite(page))
    );

    if (pageSet.size === 0) return;

    let removed = false;
    lessonsRequestCache.forEach((entry, key) => {
        const params = new URLSearchParams(key);
        const page = Number(params.get('page'));
        if (pageSet.has(page)) {
            lessonsRequestCache.delete(key);
            removed = true;
        }
    });

    if (removed) {
        persistLessonsCacheToStorage();
    }
}

function consumeLessonsCacheInvalidation() {
    try {
        const raw = sessionStorage.getItem(LESSONS_CACHE_INVALIDATION_KEY);
        if (!raw) return;

        sessionStorage.removeItem(LESSONS_CACHE_INVALIDATION_KEY);
        const payload = JSON.parse(raw);
        if (!payload || typeof payload !== 'object') return;

        if (payload.mode === 'all') {
            invalidateLessonsCache();
            return;
        }

        if (Array.isArray(payload.pages)) {
            invalidateLessonsCacheByPages(payload.pages);
            return;
        }

        if (payload.page !== undefined) {
            invalidateLessonsCacheByPages([payload.page]);
        }
    } catch (error) {
        console.warn('Failed to consume lessons cache invalidation:', error);
    }
}

function buildLessonsQueryParams(page = currentPage) {
    const params = new URLSearchParams({
        page: String(page),
        limit: String(lessonsPerPage),
        sort: currentSort,
        includeStats: 'true'
    });

    if (currentSearch) {
        params.append('search', currentSearch);
    }

    if (currentTags.length > 0) {
        params.append('tags', currentTags.join(','));
    }

    return params;
}

function buildLessonsCacheKey(page = currentPage) {
    return buildLessonsQueryParams(page).toString();
}

function getCachedLessonsData(cacheKey) {
    const cached = lessonsRequestCache.get(cacheKey);
    if (!cached) return null;

    const isExpired = (Date.now() - cached.timestamp) > LESSONS_CACHE_TTL_MS;
    if (isExpired) {
        lessonsRequestCache.delete(cacheKey);
        return null;
    }

    return cached.data;
}

function setCachedLessonsData(cacheKey, data) {
    lessonsRequestCache.set(cacheKey, {
        timestamp: Date.now(),
        data
    });
    persistLessonsCacheToStorage();
}

function invalidateLessonsCache() {
    lessonsRequestCache.clear();
    inFlightLessonRequests.clear();
    try {
        sessionStorage.removeItem(LESSONS_CACHE_STORAGE_KEY);
    } catch (error) {
        console.warn('Failed to clear lessons cache from sessionStorage:', error);
    }
}

async function fetchLessonsData(page = currentPage) {
    const cacheKey = buildLessonsCacheKey(page);
    const cachedData = getCachedLessonsData(cacheKey);
    if (cachedData) {
        return cachedData;
    }

    if (inFlightLessonRequests.has(cacheKey)) {
        return inFlightLessonRequests.get(cacheKey);
    }

    const requestPromise = (async () => {
        const params = buildLessonsQueryParams(page);
        const url = `/api/lessons?${params.toString()}`;
        console.log('Admin lessons API URL:', url);

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Failed to fetch lessons');
        }

        const data = await response.json();
        setCachedLessonsData(cacheKey, data);
        return data;
    })();

    inFlightLessonRequests.set(cacheKey, requestPromise);

    try {
        return await requestPromise;
    } finally {
        inFlightLessonRequests.delete(cacheKey);
    }
}

function prefetchNeighborLessonPages() {
    const totalPages = Math.ceil(totalLessons / lessonsPerPage);
    if (!totalPages || totalPages <= 1) return;

    for (let offset = 1; offset <= LESSONS_PREFETCH_NEIGHBOR_PAGES; offset++) {
        const candidates = [currentPage + offset, currentPage - offset];

        candidates.forEach((page) => {
            if (page < 1 || page > totalPages) return;

            const key = buildLessonsCacheKey(page);
            if (getCachedLessonsData(key) || inFlightLessonRequests.has(key)) return;

            fetchLessonsData(page).catch((error) => {
                console.warn(`Prefetch lessons page ${page} failed:`, error);
            });
        });
    }
}

// Statistics tracking
let statsData = {
    total: 0,
    active: 0,
    students: 0,
    recentActivity: 0
};

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    initializeAdminDashboard();
});

function initializeAdminDashboard() {
    loadLessonsCacheFromStorage();
    consumeLessonsCacheInvalidation();

    // Create search and sort elements if they don't exist
    createEnhancedUIElements();
    
    // Initialize event listeners
    initializeEventListeners();
    
    // Load initial data
    showLoader(true);
    
    // Load lessons immediately; fetch tags/stats in parallel without blocking
    loadLessonsForAdmin();
    loadTags();
    loadDashboardStats();
}

// ===== UI CREATION =====
function createEnhancedUIElements() {
    // Ensure stats overview exists
    if (!document.querySelector('.stats-overview')) {
        createStatsOverview();
    }
    
    // Ensure proper content structure
    if (!document.querySelector('.content-wrapper')) {
        restructureContent();
    }
}

function createStatsOverview() {
    const adminContainer = document.querySelector('.admin-container') || document.querySelector('.admin-dashboard');
    if (!adminContainer) return;
    
    const statsHTML = `
        <div class="stats-overview">
            <div class="stat-widget total">
                <div class="stat-widget-icon">
                    <i class="fas fa-book"></i>
                </div>
                <div class="stat-widget-value">0</div>
                <div class="stat-widget-label">Tổng bài học</div>
            </div>
            <div class="stat-widget active">
                <div class="stat-widget-icon">
                    <i class="fas fa-check-circle"></i>
                </div>
                <div class="stat-widget-value">0</div>
                <div class="stat-widget-label">Hoạt động</div>
            </div>
            <div class="stat-widget students">
                <div class="stat-widget-icon">
                    <i class="fas fa-user-graduate"></i>
                </div>
                <div class="stat-widget-value">0</div>
                <div class="stat-widget-label">Học sinh</div>
            </div>
            <div class="stat-widget recent">
                <div class="stat-widget-icon">
                    <i class="fas fa-clock"></i>
                </div>
                <div class="stat-widget-value">0</div>
                <div class="stat-widget-label">Hoạt động gần đây</div>
            </div>
        </div>
    `;
    
    // Insert after header
    const header = adminContainer.querySelector('h1')?.parentElement || adminContainer.firstElementChild;
    header.insertAdjacentHTML('afterend', statsHTML);
}

function restructureContent() {
    const lessonList = document.getElementById('lesson-list');
    if (!lessonList) return;
    
    const adminContainer = lessonList.closest('.admin-container') || lessonList.parentElement;
    
    // Create new structure
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'content-wrapper';
    
    // Create sidebar
    const sidebar = createSidebar();
    
    // Create main content
    const mainContent = document.createElement('main');
    mainContent.className = 'main-content';
    
    // Move lesson list to main content
    mainContent.innerHTML = `
        <div class="content-header">
            <h2 class="content-title">Danh sách bài học</h2>
            <div class="view-options">
                <button class="view-btn active" data-view="list">
                    <i class="fas fa-list"></i>
                </button>
                <button class="view-btn" data-view="grid">
                    <i class="fas fa-th"></i>
                </button>
            </div>
        </div>
        <div id="sortable-lessons" class="lessons-container"></div>
        <div id="admin-pagination-controls" class="pagination-controls"></div>
    `;
    
    // Append to wrapper
    contentWrapper.appendChild(sidebar);
    contentWrapper.appendChild(mainContent);
    
    // Replace old content
    lessonList.replaceWith(contentWrapper);
}

function createSidebar() {
    const sidebar = document.createElement('aside');
    sidebar.className = 'sidebar';
    
    sidebar.innerHTML = `
        <!-- Search -->
        <div class="sidebar-section">
            <div class="sidebar-title">
                <i class="fas fa-search"></i>
                Tìm kiếm
            </div>
            <div class="search-wrapper">
                <i class="fas fa-search"></i>
                <input type="text" id="search-input" placeholder="Tìm bài học hoặc tag...">
            </div>
        </div>
        
        <!-- Filters -->
        <div class="sidebar-section">
            <div class="sidebar-title">
                <i class="fas fa-filter"></i>
                Lọc & Sắp xếp
            </div>
            <div class="filter-group">
                <label class="filter-label">Sắp xếp theo</label>
                <select id="sort-select" class="filter-select">
                    <option value="newest">Mới nhất</option>
                    <option value="oldest">Cũ nhất</option>
                    <option value="az">Tên A-Z</option>
                    <option value="za">Tên Z-A</option>
                    <option value="popular">Phổ biến</option>
                </select>
            </div>
        </div>
        
        <!-- Tags -->
        <div class="sidebar-section">
            <div class="sidebar-title">
                <i class="fas fa-tags"></i>
                Tags phổ biến
            </div>
            <div class="tag-cloud tags-container">
                <!-- Tags will be loaded here -->
            </div>
        </div>
        
        <!-- Quick Actions -->
        <div class="sidebar-section">
            <button onclick="window.location.href='/admin/adaptive-quiz'" class="button primary" style="width: 100%;">
                <i class="fas fa-bullseye"></i>
                Tạo đề từ lỗi sai
            </button>
        </div>
    `;
    
    return sidebar;
}

// ===== EVENT LISTENERS =====
function initializeEventListeners() {
    // Search functionality with debounce
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        let debounceTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(() => {
                currentSearch = e.target.value.toLowerCase();
                currentPage = 1;
                loadLessonsForAdmin();
            }, 300); // Faster response
        });
    }
    
    // Sort functionality
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
        sortSelect.value = currentSort;
        sortSelect.addEventListener('change', (e) => {
            currentSort = e.target.value;
            currentPage = 1;
            loadLessonsForAdmin();
        });
    }
    
    // View toggle
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            const view = this.dataset.view;
            const container = document.getElementById('sortable-lessons');
            
            if (view === 'grid') {
                container.style.gridTemplateColumns = 'repeat(auto-fill, minmax(350px, 1fr))';
            } else {
                container.style.gridTemplateColumns = '1fr';
            }
        });
    });
    
    // Stats widget clicks
    document.querySelectorAll('.stat-widget').forEach(widget => {
        widget.addEventListener('click', handleStatWidgetClick);
    });
}

// ===== DATA LOADING =====
async function loadTags() {
    const cachedTags = readSessionCache(TAGS_CACHE_STORAGE_KEY, TAGS_CACHE_TTL_MS);
    if (cachedTags) {
        allTags = cachedTags.tags || cachedTags;
        completeTagsData = cachedTags.completeTagsData || null;
        renderTagsList();
    }

    try {
        console.log('Loading complete tags data for admin dashboard...');
        const response = await fetch('/api/tags/complete?limit=8');
        if (!response.ok) throw new Error('Failed to fetch complete tags');

        const result = await response.json();
        if (result.success && result.tags && result.tagToLessons) {
            // Store complete tags data for client-side filtering
            completeTagsData = {
                tags: result.tags,
                tagToLessons: result.tagToLessons
            };
            allTags = result.tags;
            writeSessionCache(TAGS_CACHE_STORAGE_KEY, {
                tags: result.tags,
                tagToLessons: result.tagToLessons,
                completeTagsData: {
                    tags: result.tags,
                    tagToLessons: result.tagToLessons
                }
            });
            console.log('Loaded complete tags data for admin:', allTags.length, 'tags');
            renderTagsList();
        } else {
            throw new Error('Invalid complete tags response format');
        }
    } catch (error) {
        console.error('Error loading complete tags:', error);
        console.log('Falling back to popular tags...');

        // Fallback to popular tags endpoint
        try {
            const fallbackResponse = await fetch('/api/tags/popular?limit=8');
            if (fallbackResponse.ok) {
                const popularResult = await fallbackResponse.json();
                if (popularResult.success && popularResult.tags) {
                    allTags = popularResult.tags;
                    // Without complete data, admin will use simpler filtering
                    completeTagsData = null;
                    writeSessionCache(TAGS_CACHE_STORAGE_KEY, {
                        tags: popularResult.tags,
                        tagToLessons: null,
                        completeTagsData: null
                    });
                    console.log('Loaded fallback popular tags for admin:', allTags);
                    renderTagsList();
                } else {
                    throw new Error('Popular tags fallback failed');
                }
            } else {
                throw new Error('Popular tags fallback also failed');
            }
        } catch (fallbackError) {
            console.error('Popular tags fallback failed:', fallbackError);
            // Final hardcoded fallback
            allTags = ['dao-dong', 'song-co', 'dien-xoay-chieu', 'dao-dong-dien-tu', 'song-anh-sang', 'luong-tu', 'hat-nhan']
                .map(tag => ({
                    tag,
                    lessonCount: 0,
                    totalViews: 0,
                    recentActivity: 0,
                    popularityScore: 0
                }));
            completeTagsData = null;
            writeSessionCache(TAGS_CACHE_STORAGE_KEY, {
                tags: allTags,
                tagToLessons: null,
                completeTagsData: null
            });
            console.log('Using hardcoded fallback tags for admin');
            renderTagsList();
        }
    }
}

async function loadDashboardStats() {
    const cachedStats = readSessionCache(STATS_CACHE_STORAGE_KEY, STATS_CACHE_TTL_MS);
    if (cachedStats) {
        statsData = cachedStats;
        updateStatsDisplay();
    }

    try {
        const response = await fetch('/api/admin/dashboard-stats');
        if (response.ok) {
            const result = await response.json();
            if (result.success && result.data) {
                statsData = result.data;
                writeSessionCache(STATS_CACHE_STORAGE_KEY, statsData);
                updateStatsDisplay();
            } else {
                console.error('Failed to load dashboard stats');
                updateStatsDisplay();
            }
        } else {
            console.error('Failed to fetch dashboard stats:', response.status);
            updateStatsDisplay();
        }
    } catch (error) {
        console.error('Error loading stats:', error);
        updateStatsDisplay();
    }
}

async function loadLessonsForAdmin() {
    if (isLoading) return;
    isLoading = true;
    showLoader(true);

    try {
        if (currentTags.length > 0) {
            console.log('Admin filtering by tags:', currentTags);
        }

        const data = await fetchLessonsData(currentPage);
        displayedLessons = data.lessons || [];
        totalLessons = data.total || 0;

        console.log(`Admin loaded ${displayedLessons.length} lessons (total: ${totalLessons}) with tags:`, currentTags);

        updateStatsFromLessons();
        renderLessons();
        updateAdminPaginationControls();
        prefetchNeighborLessonPages();

    } catch (error) {
        console.error('Error loading lessons:', error);
        showErrorMessage();
    } finally {
        showLoader(false);
        isLoading = false;
    }
}

// ===== RENDERING =====
function renderLessons() {
    const container = document.getElementById('sortable-lessons');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (displayedLessons.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-folder-open" style="font-size: 4rem; color: var(--text-tertiary); margin-bottom: 1rem;"></i>
                <p style="color: var(--text-secondary);">Không tìm thấy bài học nào phù hợp.</p>
            </div>
        `;
        return;
    }
    
    displayedLessons.forEach((lesson, index) => {
        const lessonCard = createLessonCard(lesson, index);
        container.appendChild(lessonCard);
    });
}

function createLessonCard(lesson, index) {
    const div = document.createElement('div');
    div.className = 'lesson-card';
    div.dataset.id = lesson.id;
    div.style.animationDelay = `${index * 0.05}s`;
    
    // Use real data if available, otherwise show N/A
    const studentCount = lesson.studentCount !== undefined ? lesson.studentCount : 'N/A';
    const completionRate = lesson.completionRate !== undefined ? lesson.completionRate : 'N/A';
    const lastActivity = lesson.lastActivity || 'N/A';
    
    // Calculate lesson number based on current page and index
    const lessonNumber = (currentPage - 1) * lessonsPerPage + index + 1;
    
    div.innerHTML = `
        <div class="lesson-status"></div>
        <div class="lesson-number">${lessonNumber}</div>
        <div class="lesson-color" style="background: ${lesson.color || '#a4aeff'};"></div>
        <div class="lesson-details">
            <div class="lesson-header">
                <h3 class="lesson-title" title="${lesson.title}">${lesson.title}</h3>
            </div>
            <div class="lesson-meta">
                <div class="meta-item">
                    <i class="fas fa-users"></i>
                    <span>${studentCount !== 'N/A' ? `${studentCount} học sinh` : 'N/A'}</span>
                </div>
                <div class="meta-item">
                    <i class="fas fa-chart-line"></i>
                    <span>${completionRate !== 'N/A' ? `${completionRate} đã học` : 'N/A'}</span>
                </div>
                <div class="meta-item">
                    <i class="fas fa-clock"></i>
                    <span>${lastActivity}</span>
                </div>
            </div>
            ${lesson.tags && lesson.tags.length > 0 ? 
                `<div class="lesson-tags">
                    ${lesson.tags.map(tag => `<span class="lesson-tag">${tag}</span>`).join('')}
                </div>` : ''}
        </div>
        <div class="lesson-actions">
            <div class="color-picker-wrapper">
                <input type="color"
                       class="color-picker"
                       value="${lesson.color || '#a4aeff'}"
                       onchange="updateLessonColor(${lesson.id}, this.value)"
                       title="Đổi màu">
                <div class="color-circle" style="background-color: ${lesson.color || '#a4aeff'};"></div>
            </div>
            <div class="edit-dropdown">
                <a href="/admin/edit/${lesson.id}" class="action-btn" title="Chỉnh sửa với giao diện mới">
                    <i class="fas fa-edit"></i>
                    <span>Sửa</span>
                </a>
                <button class="dropdown-toggle" onclick="toggleEditDropdown(${lesson.id})" title="Tùy chọn chỉnh sửa">
                    <i class="fas fa-chevron-down"></i>
                </button>
                <div class="dropdown-menu" id="edit-dropdown-${lesson.id}">
                    <a href="/admin/edit/${lesson.id}" class="dropdown-item">
                        <i class="fas fa-magic"></i>
                        <span>Giao diện mới</span>
                    </a>
                    <a href="/admin/edit-legacy/${lesson.id}" class="dropdown-item">
                        <i class="fas fa-edit"></i>
                        <span>Giao diện cũ</span>
                    </a>
                </div>
            </div>
            <a href="/admin/lessons/${lesson.id}/statistics" class="action-btn">
                <i class="fas fa-chart-bar"></i>
                <span>Thống kê</span>
            </a>
            <button onclick="copyShareLink(${lesson.id})" class="action-btn">
                <i class="fas fa-share"></i>
                <span>Chia sẻ</span>
            </button>
            <button onclick="confirmDeleteLesson(${lesson.id}, '${lesson.title.replace(/'/g, "\\'")}')" class="action-btn danger">
                <i class="fas fa-trash"></i>
                <span>Xóa</span>
            </button>
        </div>
    `;
    
    return div;
}

function renderTagsList() {
    const tagsContainer = document.querySelector('.tags-container');
    if (!tagsContainer) return;

    console.log('Rendering tags list with data:', allTags);
    tagsContainer.innerHTML = '';

    // Add "All" button first
    const allButton = document.createElement('button');
    allButton.className = 'tag-filter active';
    allButton.setAttribute('data-tag', 'all');
    allButton.innerHTML = `
        <span class="tag-name">Tất cả</span>
    `;
    tagsContainer.appendChild(allButton);

    // Show top 8 popular tags
    const topTags = allTags.slice(0, 8);

    topTags.forEach(tagData => {
        const tagButton = document.createElement('button');
        tagButton.className = 'tag-filter';

        // Handle both old format (string) and new format (object)
        const tagName = typeof tagData === 'string' ? tagData : tagData.tag;
        const lessonCount = typeof tagData === 'object' ? tagData.lessonCount : 0;
        const totalViews = typeof tagData === 'object' ? tagData.totalViews : 0;

        tagButton.setAttribute('data-tag', tagName);
        tagButton.title = `${lessonCount} bài học • ${totalViews} lượt xem`;

        tagButton.innerHTML = `
            <span class="tag-name">${formatTagName(tagName)}</span>
            ${lessonCount > 0 ? `<span class="tag-count">${lessonCount}</span>` : ''}
        `;

        tagsContainer.appendChild(tagButton);
    });

    // Setup event listeners for all tag buttons
    setupTagListeners();
}

function formatTagName(tag) {
    // Convert tag names to display format (same as lessons page)
    const tagMap = {
        'dao-dong': 'Dao động cơ',
        'song-co': 'Sóng cơ',
        'dien-xoay-chieu': 'Điện xoay chiều',
        'dao-dong-dien-tu': 'Dao động điện từ',
        'song-anh-sang': 'Sóng ánh sáng',
        'luong-tu': 'Lượng tử',
        'hat-nhan': 'Hạt nhân',
        'dien-tu': 'Điện từ',
        'co-hoc': 'Cơ học',
        'nhiet-hoc': 'Nhiệt học'
    };
    return tagMap[tag] || tag.charAt(0).toUpperCase() + tag.slice(1).replace(/-/g, ' ');
}

function setupTagListeners() {
    const tagButtons = document.querySelectorAll('.tags-container .tag-filter');

    tagButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            // Check if user clicked with Ctrl/Cmd for additional options
            if (e.ctrlKey || e.metaKey) {
                const tag = button.dataset.tag;
                if (tag !== 'all') {
                    // Open lessons page filtered by this tag in new tab
                    const lessonsUrl = `/lessons?tags=${encodeURIComponent(tag)}`;
                    window.open(lessonsUrl, '_blank');
                    return;
                }
            }

            // Normal click behavior - filter admin lessons
            console.log('Tag clicked:', button.dataset.tag);

            // Remove active class from all buttons
            tagButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            const tag = button.dataset.tag;

            // Update current tags
            if (tag === 'all') {
                currentTags = [];
                console.log('Showing all lessons');
            } else {
                currentTags = [tag];
                console.log('Filtering by tag:', tag);
            }

            // Reset page and reload lessons
            currentPage = 1;
            loadLessonsForAdmin();
        });

        // Add right-click context menu for additional options
        button.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const tag = button.dataset.tag;

            if (tag !== 'all') {
                // Show context menu with options
                showTagContextMenu(e, tag);
            }
        });
    });
}

function showTagContextMenu(event, tag) {
    // Remove any existing context menu
    const existingMenu = document.querySelector('.tag-context-menu');
    if (existingMenu) {
        existingMenu.remove();
    }

    const menu = document.createElement('div');
    menu.className = 'tag-context-menu';
    menu.style.position = 'fixed';
    menu.style.left = event.clientX + 'px';
    menu.style.top = event.clientY + 'px';
    menu.style.zIndex = '10000';
    menu.style.background = 'var(--glass-bg)';
    menu.style.border = '1px solid var(--glass-border)';
    menu.style.borderRadius = 'var(--radius-md)';
    menu.style.padding = '0.5rem';
    menu.style.backdropFilter = 'blur(20px)';
    menu.style.minWidth = '200px';

    menu.innerHTML = `
        <div class="context-menu-item" onclick="openLessonsPageWithTag('${tag}')">
            <i class="fas fa-external-link-alt"></i>
            Xem bài học với tag này
        </div>
        <div class="context-menu-item" onclick="showTagStatistics('${tag}')">
            <i class="fas fa-chart-bar"></i>
            Xem thống kê tag
        </div>
        <div class="context-menu-item" onclick="copyTagName('${tag}')">
            <i class="fas fa-copy"></i>
            Sao chép tên tag
        </div>
    `;

    document.body.appendChild(menu);

    // Remove menu when clicking elsewhere
    setTimeout(() => {
        document.addEventListener('click', function removeMenu() {
            menu.remove();
            document.removeEventListener('click', removeMenu);
        });
    }, 100);
}

function openLessonsPageWithTag(tag) {
    const lessonsUrl = `/lessons?tags=${encodeURIComponent(tag)}`;
    window.open(lessonsUrl, '_blank');
}

function showTagStatistics(tag) {
    const tagData = allTags.find(t => (typeof t === 'string' ? t : t.tag) === tag);
    if (tagData && typeof tagData === 'object') {
        alert(`Thống kê cho tag "${formatTagName(tag)}":\n\n` +
              `• Số bài học: ${tagData.lessonCount}\n` +
              `• Tổng lượt xem: ${tagData.totalViews}\n` +
              `• Hoạt động gần đây: ${tagData.recentActivity}\n` +
              `• Điểm phổ biến: ${tagData.popularityScore.toFixed(2)}`);
    } else {
        alert(`Không có thống kê cho tag "${formatTagName(tag)}"`);
    }
}

function copyTagName(tag) {
    navigator.clipboard.writeText(tag).then(() => {
        showToast(`Đã sao chép tag: ${tag}`, 'success');
    }).catch(err => {
        console.error('Failed to copy tag name:', err);
        showToast('Không thể sao chép tag', 'error');
    });
}

// Simple toast notification function
function showToast(message, type = 'info') {
    // Remove existing toast
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
        border-radius: var(--radius-md);
        padding: 1rem 1.5rem;
        color: var(--text-primary);
        backdrop-filter: blur(20px);
        z-index: 10001;
        transform: translateX(100%);
        transition: transform 0.3s ease;
        max-width: 300px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    `;

    if (type === 'success') {
        toast.style.borderColor = '#10b981';
        toast.innerHTML = `<i class="fas fa-check-circle" style="color: #10b981; margin-right: 0.5rem;"></i>${message}`;
    } else if (type === 'error') {
        toast.style.borderColor = '#ef4444';
        toast.innerHTML = `<i class="fas fa-exclamation-circle" style="color: #ef4444; margin-right: 0.5rem;"></i>${message}`;
    } else {
        toast.innerHTML = `<i class="fas fa-info-circle" style="color: var(--neon-purple); margin-right: 0.5rem;"></i>${message}`;
    }

    document.body.appendChild(toast);

    // Animate in
    setTimeout(() => {
        toast.style.transform = 'translateX(0)';
    }, 100);

    // Auto remove after 3 seconds
    setTimeout(() => {
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 300);
    }, 3000);
}

// ===== STATS MANAGEMENT =====
function updateStatsDisplay() {
    const statWidgets = {
        total: document.querySelector('.stat-widget.total .stat-widget-value'),
        active: document.querySelector('.stat-widget.active .stat-widget-value'),
        students: document.querySelector('.stat-widget.students .stat-widget-value'),
        recent: document.querySelector('.stat-widget.recent .stat-widget-value')
    };
    
    if (statWidgets.total) {
        animateValue(statWidgets.total, 0, statsData.totalLessons || totalLessons, 1000);
    }
    if (statWidgets.active) {
        animateValue(statWidgets.active, 0, statsData.activeLessons || Math.floor(totalLessons * 0.8), 1000);
    }
    if (statWidgets.students) {
        animateValue(statWidgets.students, 0, statsData.totalStudents || Math.floor(totalLessons * 15), 1000);
    }
    if (statWidgets.recent) {
        animateValue(statWidgets.recent, 0, statsData.recentActivity || Math.floor(Math.random() * 20) + 5, 1000);
    }
}

function updateStatsFromLessons() {
    statsData.total = totalLessons;
    updateStatsDisplay();
}

function animateValue(element, start, end, duration) {
    const startTimestamp = Date.now();
    const step = () => {
        const timestamp = Date.now();
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const value = Math.floor(progress * (end - start) + start);
        element.textContent = value;
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// ===== ACTIONS =====

function copyShareLink(lessonId) {
    const shareUrl = `${window.location.origin}/share/lesson/${lessonId}`;
    
    navigator.clipboard.writeText(shareUrl).then(() => {
        showToast('Đã sao chép link chia sẻ!', 'success');
    }).catch(err => {
        console.error('Failed to copy:', err);
        showToast('Không thể sao chép link', 'error');
    });
}

function confirmDeleteLesson(id, title) {
    const confirmMessage = `Bạn có chắc chắn muốn xóa bài học "${title}"?\n\nHành động này không thể hoàn tác.`;
    
    if (confirm(confirmMessage)) {
        deleteLesson(id);
    }
}

async function deleteLesson(id) {
    try {
        // Get CSRF token before making the request
        const csrfResponse = await fetch('/api/csrf-token');
        if (!csrfResponse.ok) {
            throw new Error('Failed to get CSRF token');
        }
        const csrfData = await csrfResponse.json();

        const response = await fetch(`/api/lessons/${id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'x-csrf-token': csrfData.csrfToken
            }
        });

        if (!response.ok) {
            throw new Error('Failed to delete lesson');
        }
        
        showToast('Đã xóa bài học thành công', 'success');

        invalidateLessonsCache();

        // Reload the current page after deletion
        loadLessonsForAdmin();
        
    } catch (error) {
        console.error('Error deleting lesson:', error);
        showToast('Không thể xóa bài học', 'error');
    }
}

async function updateLessonColor(id, color) {
    try {
        // Get CSRF token before making the request
        const csrfResponse = await fetch('/api/csrf-token');
        if (!csrfResponse.ok) {
            throw new Error('Failed to get CSRF token');
        }
        const csrfData = await csrfResponse.json();

        const payload = {
            color: color,
            csrfToken: csrfData.csrfToken
        };

        const response = await fetch(`/api/lessons/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Color update failed:', errorData);
            throw new Error(errorData.message || 'Failed to update lesson color');
        }
        
        const result = await response.json();
        console.log('Color update result:', result);

        invalidateLessonsCache();
        
        // Update local data
        const lesson = displayedLessons.find(l => l.id == id);
        if (lesson) {
            lesson.color = color;
        }
        
        // Update UI
        const lessonCard = document.querySelector(`.lesson-card[data-id="${id}"]`);
        if (lessonCard) {
            const colorBar = lessonCard.querySelector('.lesson-color');
            if (colorBar) {
                colorBar.style.background = color;
            }
            
            const colorPicker = lessonCard.querySelector('.color-picker');
            if (colorPicker && colorPicker.value !== color) {
                colorPicker.value = color;
            }
            
            // Update the color circle
            const colorCircle = lessonCard.querySelector('.color-circle');
            if (colorCircle) {
                colorCircle.style.backgroundColor = color;
            }
        }
        
        showToast('Đã cập nhật màu sắc', 'success');
        
    } catch (error) {
        console.error('Error updating lesson color:', error);
        showToast(error.message || 'Không thể cập nhật màu sắc', 'error');
    }
}

// ===== PAGINATION =====
function updateAdminPaginationControls() {
    const container = document.getElementById('admin-pagination-controls');
    if (!container) return;

    container.innerHTML = '';
    const totalPages = Math.ceil(totalLessons / lessonsPerPage);

    if (totalPages <= 1) return;

    // Previous button
    const prevButton = document.createElement('button');
    prevButton.innerHTML = '<i class="fas fa-chevron-left"></i> Trước';
    prevButton.disabled = currentPage === 1;
    prevButton.onclick = () => {
        if (currentPage > 1) {
            currentPage--;
            loadLessonsForAdmin();
            scrollToTop();
        }
    };
    container.appendChild(prevButton);

    // Page numbers
    const pageNumbers = getPageNumbers(currentPage, totalPages);
    
    pageNumbers.forEach(pageNum => {
        if (pageNum === '...') {
            const dots = document.createElement('span');
            dots.textContent = '...';
            dots.style.padding = '0 0.5rem';
            container.appendChild(dots);
        } else {
            const pageButton = document.createElement('button');
            pageButton.textContent = pageNum;
            pageButton.className = pageNum === currentPage ? 'active-page' : '';
            pageButton.onclick = () => {
                if (pageNum !== currentPage) {
                    currentPage = pageNum;
                    loadLessonsForAdmin();
                    scrollToTop();
                }
            };
            container.appendChild(pageButton);
        }
    });

    // Next button
    const nextButton = document.createElement('button');
    nextButton.innerHTML = 'Tiếp <i class="fas fa-chevron-right"></i>';
    nextButton.disabled = currentPage === totalPages;
    nextButton.onclick = () => {
        if (currentPage < totalPages) {
            currentPage++;
            loadLessonsForAdmin();
            scrollToTop();
        }
    };
    container.appendChild(nextButton);
}

function getPageNumbers(current, total) {
    const delta = 2;
    const range = [];
    const rangeWithDots = [];
    let l;

    for (let i = 1; i <= total; i++) {
        if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
            range.push(i);
        }
    }

    range.forEach((i) => {
        if (l) {
            if (i - l === 2) {
                rangeWithDots.push(l + 1);
            } else if (i - l !== 1) {
                rangeWithDots.push('...');
            }
        }
        rangeWithDots.push(i);
        l = i;
    });

    return rangeWithDots;
}

// ===== UTILITY FUNCTIONS =====
function showLoader(show) {
    const loader = document.getElementById('loading-indicator');
    if (loader) {
        loader.classList.toggle('hidden', !show);
    }
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showToast(message, type = 'info') {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    
    // Add styles if not exists
    if (!document.getElementById('toast-styles')) {
        const style = document.createElement('style');
        style.id = 'toast-styles';
        style.textContent = `
            .toast {
                position: fixed;
                bottom: 2rem;
                left: 50%;
                transform: translateX(-50%) translateY(100px);
                background: var(--glass-bg);
                border: 1px solid var(--glass-border);
                border-radius: var(--radius-full);
                padding: 1rem 2rem;
                display: flex;
                align-items: center;
                gap: 0.75rem;
                backdrop-filter: blur(10px);
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
                animation: toastSlideIn 0.3s ease forwards;
                z-index: 9999;
            }
            
            .toast-success {
                border-color: rgba(67, 233, 123, 0.3);
                background: linear-gradient(135deg, rgba(67, 233, 123, 0.1) 0%, rgba(56, 249, 215, 0.1) 100%);
            }
            
            .toast-error {
                border-color: rgba(244, 59, 71, 0.3);
                background: linear-gradient(135deg, rgba(244, 59, 71, 0.1) 0%, rgba(245, 87, 108, 0.1) 100%);
            }
            
            @keyframes toastSlideIn {
                to { transform: translateX(-50%) translateY(0); }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(toast);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'toastSlideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showErrorMessage() {
    const container = document.getElementById('sortable-lessons');
    if (container) {
        container.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-triangle"></i>
                <span>Lỗi khi tải dữ liệu. Vui lòng thử lại sau.</span>
            </div>
        `;
    }
}

function handleStatWidgetClick(e) {
    const widget = e.currentTarget;
    
    if (widget.classList.contains('total')) {
        // Show all lessons
        currentSearch = '';
        selectedTags.clear();
        document.getElementById('search-input').value = '';
        loadLessonsForAdmin();
    } else if (widget.classList.contains('active')) {
        // Filter active lessons
        currentSort = 'popular';
        document.getElementById('sort-select').value = 'popular';
        loadLessonsForAdmin();
    } else if (widget.classList.contains('students')) {
        // Navigate to students page
        window.location.href = '/admin/students';
    } else if (widget.classList.contains('recent')) {
        // Show recent activity
        window.location.href = '/history';
    }
}



// ===== REVIEW LESSON MODAL =====
// Keep existing review lesson functions
function openReviewLessonModal() {
    const container = document.getElementById('review-lesson-rows');
    if (container) {
        container.innerHTML = '';
        addReviewRow();
    }
    const modal = document.getElementById('review-lesson-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeReviewLessonModal() {
    const modal = document.getElementById('review-lesson-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function addReviewRow() {
    const container = document.getElementById('review-lesson-rows');
    if (!container) return;
    
    const row = document.createElement('div');
    row.className = 'review-lesson-row';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '10px';
    row.style.marginBottom = '10px';
    
    row.innerHTML = `
        <select class="review-lesson-select modern-input" required style="flex: 1;">
            <option value="">Chọn bài học...</option>
        </select>
        <input type="number" class="review-question-count modern-input" min="1" max="50" required style="width: 100px;" placeholder="Số câu" />
        <button type="button" class="action-btn danger" onclick="removeReviewRow(this)" style="padding: 0.75rem;">
            <i class="fas fa-trash"></i>
        </button>
    `;
    
    container.appendChild(row);
    populateReviewRowSelect(row);
}

function removeReviewRow(button) {
    const row = button.closest('.review-lesson-row');
    if (row && row.parentElement.children.length > 1) {
        row.remove();
    }
}

function populateReviewRowSelect(row) {
    const select = row.querySelector('.review-lesson-select');
    if (!select) return;
    
    // Populate with current lessons
    displayedLessons.forEach(lesson => {
        const option = document.createElement('option');
        option.value = lesson.id;
        option.textContent = lesson.title;
        select.appendChild(option);
    });
}

// Initialize form handler
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('review-lesson-form');
    if (form) {
        form.addEventListener('submit', handleReviewLessonSubmit);
    }
});

async function handleReviewLessonSubmit(e) {
    e.preventDefault();
    
    const name = document.getElementById('review-lesson-name').value;
    const rows = document.querySelectorAll('.review-lesson-row');
    
    const lessons = Array.from(rows).map(row => ({
        lessonId: row.querySelector('.review-lesson-select').value,
        questionCount: parseInt(row.querySelector('.review-question-count').value)
    })).filter(item => item.lessonId && item.questionCount);
    
    if (lessons.length === 0) {
        showToast('Vui lòng chọn ít nhất một bài học', 'error');
        return;
    }
    
    try {
        // Get CSRF token before making the request
        const csrfResponse = await fetch('/api/csrf-token');
        if (!csrfResponse.ok) {
            throw new Error('Failed to get CSRF token');
        }
        const csrfData = await csrfResponse.json();

        const payload = {
            name,
            lessons,
            csrfToken: csrfData.csrfToken
        };

        const response = await fetch('/api/review-lessons', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) throw new Error('Failed to create review lesson');
        
        showToast('Đã tạo bài ôn tập thành công', 'success');
        closeReviewLessonModal();
        loadLessonsForAdmin();
        
    } catch (error) {
        console.error('Error creating review lesson:', error);
        showToast('Không thể tạo bài ôn tập', 'error');
    }
}

// Toggle edit dropdown menu
function toggleEditDropdown(lessonId) {
    const dropdown = document.getElementById(`edit-dropdown-${lessonId}`);
    const allDropdowns = document.querySelectorAll('.dropdown-menu');
    
    // Close all other dropdowns
    allDropdowns.forEach(d => {
        if (d !== dropdown) {
            d.classList.remove('active');
        }
    });
    
    // Toggle current dropdown
    dropdown.classList.toggle('active');
}

// Close dropdowns when clicking outside
document.addEventListener('click', function(event) {
    if (!event.target.closest('.edit-dropdown')) {
        document.querySelectorAll('.dropdown-menu').forEach(dropdown => {
            dropdown.classList.remove('active');
        });
    }
});

// Export functions for global access
window.updateLessonColor = updateLessonColor;
window.copyShareLink = copyShareLink;
window.confirmDeleteLesson = confirmDeleteLesson;
window.openReviewLessonModal = openReviewLessonModal;
window.closeReviewLessonModal = closeReviewLessonModal;
window.addReviewRow = addReviewRow;
window.removeReviewRow = removeReviewRow;
window.toggleEditDropdown = toggleEditDropdown;
