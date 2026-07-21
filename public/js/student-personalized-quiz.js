(function () {
    'use strict';

    const MAX_SELECTED = 30;
    const MAX_HISTORY_PAGES = 3;
    const state = {
        rawMistakes: [],
        candidates: [],
        visibleCandidates: [],
        selected: new Set(),
        days: '14',
        subject: 'all',
        query: '',
        targetCount: 10,
        reportedTotal: 0
    };

    const elements = {};

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function normalizeQuestion(value) {
        return String(value || '')
            .replace(/\[img\s+src=[^\]]+\]/gi, ' ')
            .replace(/\s*\[\s*\d+(?:[.,]\d+)?\s*pts?\s*\]\s*$/i, '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLocaleLowerCase('vi');
    }

    function formatQuestion(value) {
        return escapeHtml(value)
            .replace(/\[img\s+src=[^\]]+\]/gi, '')
            .replace(/\s*\[\s*\d+(?:[.,]\d+)?\s*pts?\s*\]\s*$/i, '')
            .replace(/\n/g, '<br>')
            .trim();
    }

    function formatAnswer(value) {
        if (Array.isArray(value)) {
            if (value.every((item) => item === null || item === undefined)) return 'Bạn đã bỏ trống câu này';
            return value.map((item, index) => {
                const label = String.fromCharCode(65 + index);
                if (item === null || item === undefined) return `${label}: chưa chọn`;
                if (typeof item === 'boolean') return `${label}: ${item ? 'Đúng' : 'Sai'}`;
                return `${label}: ${String(item)}`;
            }).join(' · ');
        }
        if (value === null || value === undefined || value === '' || value === 'No answer') {
            return 'Bạn đã bỏ trống câu này';
        }
        if (typeof value === 'object') return JSON.stringify(value);
        return `Bạn từng trả lời: ${String(value)}`;
    }

    function formatType(type) {
        const labels = {
            abcd: 'Trắc nghiệm',
            multiple_choice: 'Trắc nghiệm',
            truefalse: 'Đúng / Sai',
            true_false: 'Đúng / Sai',
            number: 'Trả lời số',
            fill_blank: 'Trả lời số'
        };
        return labels[type] || 'Câu hỏi';
    }

    function formatSubject(subject) {
        const labels = {
            physics: 'Vật lý',
            math: 'Toán',
            chemistry: 'Hóa học'
        };
        return labels[String(subject || '').toLocaleLowerCase('vi')] || subject || 'Nội dung khác';
    }

    function formatRelativeTime(value) {
        const time = new Date(value).getTime();
        if (!Number.isFinite(time)) return 'Gần đây';
        const elapsedDays = Math.max(0, Math.floor((Date.now() - time) / 86400000));
        if (elapsedDays === 0) return 'Hôm nay';
        if (elapsedDays === 1) return 'Hôm qua';
        if (elapsedDays < 30) return `${elapsedDays} ngày trước`;
        return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(new Date(time));
    }

    function getCutoffTime() {
        if (state.days === 'all') return 0;
        return Date.now() - (Number(state.days) * 86400000);
    }

    function groupMistakes(mistakes) {
        const grouped = new Map();

        mistakes.forEach((mistake) => {
            const normalized = normalizeQuestion(mistake.question);
            if (!normalized) return;
            const key = `${mistake.lessonId || 'lesson'}::${normalized}`;
            const timestamp = new Date(mistake.timestamp).getTime();
            const existing = grouped.get(key);

            if (!existing) {
                grouped.set(key, {
                    ...mistake,
                    groupKey: key,
                    repeatCount: 1,
                    occurrenceIds: [mistake.id],
                    lastMistakeAt: Number.isFinite(timestamp) ? timestamp : 0
                });
                return;
            }

            existing.repeatCount += 1;
            existing.occurrenceIds.push(mistake.id);
            if (Number.isFinite(timestamp) && timestamp > existing.lastMistakeAt) {
                const repeatCount = existing.repeatCount;
                const occurrenceIds = existing.occurrenceIds;
                Object.assign(existing, mistake, {
                    groupKey: key,
                    repeatCount,
                    occurrenceIds,
                    lastMistakeAt: timestamp
                });
            }
        });

        return Array.from(grouped.values()).map((candidate) => {
            const ageDays = Math.max(0, (Date.now() - candidate.lastMistakeAt) / 86400000);
            const recencyScore = Math.max(0, 7 - ageDays) / 7;
            return {
                ...candidate,
                priorityScore: (candidate.repeatCount * 5) + (recencyScore * 4)
            };
        }).sort((a, b) => (
            b.priorityScore - a.priorityScore ||
            b.lastMistakeAt - a.lastMistakeAt ||
            String(a.question).localeCompare(String(b.question), 'vi')
        ));
    }

    function calculateDuration(questionCount) {
        return questionCount > 0 ? Math.max(2, Math.ceil(questionCount * 1.5)) : 0;
    }

    function getPriorityLabel(candidate) {
        if (candidate.repeatCount >= 3) return 'Cần ưu tiên';
        if (candidate.repeatCount === 2) return 'Lặp lại';
        return 'Gần đây';
    }

    function renderMath() {
        if (typeof window.renderMathInElement !== 'function') return;
        try {
            window.renderMathInElement(elements.mistakeList, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\(', right: '\\)', display: false },
                    { left: '\\[', right: '\\]', display: true }
                ],
                throwOnError: false
            });
        } catch (error) {
            console.warn('Could not render math preview:', error);
        }
    }

    function buildCandidateCard(candidate) {
        const selected = state.selected.has(candidate.id);
        return `
            <label class="mistake-card ${selected ? 'selected' : ''}" data-mistake-id="${escapeHtml(candidate.id)}" tabindex="0">
                <input class="mistake-selector" type="checkbox" value="${escapeHtml(candidate.id)}" ${selected ? 'checked' : ''}>
                <span class="selection-mark"><i class="fas fa-check"></i></span>
                <span class="mistake-main">
                    <span class="mistake-meta">
                        <span class="lesson-chip" title="${escapeHtml(candidate.lessonTitle)}"><i class="fas fa-book-open"></i> ${escapeHtml(candidate.lessonTitle || 'Bài học')}</span>
                        <span class="type-chip">${escapeHtml(formatType(candidate.type))}</span>
                        ${candidate.repeatCount > 1 ? `<span class="repeat-chip"><i class="fas fa-rotate"></i> Sai ${candidate.repeatCount} lần</span>` : ''}
                    </span>
                    <span class="mistake-question">${formatQuestion(candidate.question)}</span>
                    <span class="previous-answer"><i class="fas fa-circle-xmark"></i><span>${escapeHtml(formatAnswer(candidate.userAnswer))}</span></span>
                </span>
                <span class="mistake-side">
                    <span class="priority-badge"><i class="fas fa-bolt"></i> ${getPriorityLabel(candidate)}</span>
                    <span class="mistake-date">${formatRelativeTime(candidate.timestamp)}</span>
                </span>
            </label>
        `;
    }

    function updateCandidates() {
        const cutoff = getCutoffTime();
        const periodMistakes = state.rawMistakes.filter((mistake) => {
            const timestamp = new Date(mistake.timestamp).getTime();
            return !cutoff || (Number.isFinite(timestamp) && timestamp >= cutoff);
        });
        const subjectMistakes = periodMistakes.filter((mistake) => (
            state.subject === 'all' || String(mistake.subject) === state.subject
        ));

        state.candidates = groupMistakes(subjectMistakes);
        const normalizedQuery = state.query.trim().toLocaleLowerCase('vi');
        state.visibleCandidates = state.candidates.filter((candidate) => {
            if (!normalizedQuery) return true;
            return [candidate.question, candidate.lessonTitle, candidate.subject]
                .some((value) => String(value || '').toLocaleLowerCase('vi').includes(normalizedQuery));
        });

        elements.statMistakes.textContent = subjectMistakes.length.toLocaleString('vi-VN');
        elements.statUnique.textContent = state.candidates.length.toLocaleString('vi-VN');
        elements.statWindow.textContent = state.days === 'all' ? 'toàn bộ lịch sử' : `${state.days} ngày`;
        renderCandidateList();
        updateSelectionUI();
        updateSmartNote(subjectMistakes.length);
    }

    function renderCandidateList() {
        elements.mistakeList.setAttribute('aria-busy', 'false');
        elements.visibleCount.textContent = `${state.visibleCandidates.length} nội dung phù hợp`;

        if (state.visibleCandidates.length === 0) {
            const hasHistory = state.rawMistakes.length > 0;
            elements.mistakeList.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon"><i class="fas fa-${hasHistory ? 'filter-circle-xmark' : 'medal'}"></i></span>
                    <h3>${hasHistory ? 'Không có lỗi sai phù hợp' : 'Bạn chưa có lỗi sai nào'}</h3>
                    <p>${hasHistory
                        ? 'Thử đổi khoảng thời gian, nội dung hoặc từ khóa để xem thêm câu hỏi.'
                        : 'Hãy hoàn thành một bài học trước. Các câu cần củng cố sẽ tự động xuất hiện tại đây.'}</p>
                    <a href="/lessons"><i class="fas fa-book-open"></i> ${hasHistory ? 'Về danh sách bài học' : 'Làm bài đầu tiên'}</a>
                </div>
            `;
            return;
        }

        elements.mistakeList.innerHTML = state.visibleCandidates.map(buildCandidateCard).join('');
        window.requestAnimationFrame(renderMath);
    }

    function updateSmartNote(mistakeCount) {
        if (state.candidates.length === 0) {
            elements.smartNote.innerHTML = `
                <span><i class="fas fa-lightbulb"></i></span>
                <p>Chưa có dữ liệu trong bộ lọc hiện tại. Bạn có thể mở rộng khoảng thời gian để tìm thêm lỗi sai.</p>
            `;
            return;
        }

        const repeated = state.candidates.filter((candidate) => candidate.repeatCount > 1).length;
        const historyNote = state.reportedTotal > state.rawMistakes.length
            ? ` Đang hiển thị ${state.rawMistakes.length} lỗi mới nhất trong tổng số ${state.reportedTotal}.`
            : '';
        elements.smartNote.innerHTML = `
            <span><i class="fas fa-lightbulb"></i></span>
            <p>Tìm thấy <strong>${mistakeCount} lỗi sai</strong>, được gộp thành <strong>${state.candidates.length} nội dung</strong>${repeated ? `; ${repeated} nội dung đã sai lặp lại` : ''}. Câu lặp lại và mới xảy ra được ưu tiên trước.${historyNote}</p>
        `;
    }

    function updateSelectionUI() {
        const selectedCount = state.selected.size;
        const duration = calculateDuration(selectedCount);
        const hasSelection = selectedCount > 0;

        elements.statSelected.textContent = selectedCount;
        elements.statDuration.textContent = duration;
        elements.selectedSummary.textContent = `${selectedCount} câu`;
        elements.durationSummary.textContent = `${duration} phút`;
        elements.mobileSelected.textContent = `${selectedCount} câu`;
        elements.mobileDuration.textContent = `${duration} phút`;
        elements.startButton.disabled = !hasSelection;
        elements.mobileStartButton.disabled = !hasSelection;
        elements.startButtonDetail.textContent = hasSelection
            ? `Đề riêng tư • khoảng ${duration} phút`
            : 'Hãy chọn ít nhất 1 lỗi sai';
    }

    function toggleMistake(mistakeId, shouldSelect) {
        if (shouldSelect && !state.selected.has(mistakeId) && state.selected.size >= MAX_SELECTED) {
            showToast(`Mỗi đề tối đa ${MAX_SELECTED} câu.`, 'error');
            return false;
        }

        if (shouldSelect) state.selected.add(mistakeId);
        else state.selected.delete(mistakeId);
        return true;
    }

    function refreshCardSelection(mistakeId) {
        const card = Array.from(elements.mistakeList.querySelectorAll('.mistake-card'))
            .find((item) => item.dataset.mistakeId === mistakeId);
        if (!card) return;
        const selected = state.selected.has(mistakeId);
        card.classList.toggle('selected', selected);
        const checkbox = card.querySelector('.mistake-selector');
        if (checkbox) checkbox.checked = selected;
    }

    function recommendQuestions() {
        if (state.visibleCandidates.length === 0) {
            showToast('Không có câu phù hợp để gợi ý.', 'error');
            return;
        }

        state.selected.clear();
        state.visibleCandidates
            .slice(0, Math.min(state.targetCount, MAX_SELECTED))
            .forEach((candidate) => state.selected.add(candidate.id));
        renderCandidateList();
        updateSelectionUI();
        showToast(`Đã chọn ${state.selected.size} câu cần ưu tiên nhất.`);
    }

    function selectVisibleQuestions() {
        const available = state.visibleCandidates.filter((candidate) => !state.selected.has(candidate.id));
        const remainingSlots = MAX_SELECTED - state.selected.size;
        available.slice(0, remainingSlots).forEach((candidate) => state.selected.add(candidate.id));
        renderCandidateList();
        updateSelectionUI();

        if (available.length > remainingSlots) {
            showToast(`Đã chọn đủ giới hạn ${MAX_SELECTED} câu.`, 'error');
        } else if (available.length === 0) {
            showToast('Tất cả câu đang hiển thị đã được chọn.');
        } else {
            showToast(`Đã thêm ${Math.min(available.length, remainingSlots)} câu vào đề.`);
        }
    }

    function startQuiz() {
        if (state.selected.size === 0) {
            showToast('Hãy chọn ít nhất một lỗi sai.', 'error');
            return;
        }

        const orderedIds = [];
        state.candidates.forEach((candidate) => {
            if (state.selected.has(candidate.id)) orderedIds.push(candidate.id);
        });
        state.selected.forEach((id) => {
            if (!orderedIds.includes(id)) orderedIds.push(id);
        });

        sessionStorage.setItem('practiceMistakes', JSON.stringify({
            mistakeIds: orderedIds,
            title: 'Đề cá nhân hoá của bạn',
            returnUrl: '/personalized-quiz',
            timestamp: new Date().toISOString()
        }));
        window.location.href = '/practice';
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<i class="fas fa-${type === 'error' ? 'triangle-exclamation' : 'circle-check'}"></i><span>${escapeHtml(message)}</span>`;
        elements.toastRegion.appendChild(toast);
        window.setTimeout(() => toast.remove(), 3200);
    }

    async function fetchMistakePage(page) {
        const params = new URLSearchParams({ page: String(page), limit: '100' });
        const response = await fetch(`/api/progress/mistakes?${params.toString()}`, {
            headers: { Accept: 'application/json' }
        });
        if (response.status === 401) {
            window.location.href = `/student/login?redirect=${encodeURIComponent('/personalized-quiz')}`;
            throw new Error('Authentication required');
        }
        if (!response.ok) throw new Error(`Không thể tải lỗi sai (${response.status})`);
        const data = await response.json();
        if (!data.success) throw new Error(data.message || 'Không thể tải lỗi sai');
        return data;
    }

    async function loadMistakes() {
        try {
            const firstPage = await fetchMistakePage(1);
            const totalPages = Math.min(
                Number(firstPage.pagination?.totalPages || 1),
                MAX_HISTORY_PAGES
            );
            const remainingPages = totalPages > 1
                ? await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) => fetchMistakePage(index + 2)))
                : [];
            const allPages = [firstPage, ...remainingPages];
            const mistakeById = new Map();
            allPages.forEach((page) => {
                (page.mistakes || []).forEach((mistake) => mistakeById.set(String(mistake.id), mistake));
            });

            state.rawMistakes = Array.from(mistakeById.values());
            state.reportedTotal = Number(firstPage.pagination?.total || state.rawMistakes.length);
            populateSubjects();
            updateCandidates();
        } catch (error) {
            console.error('Could not load personalized quiz data:', error);
            elements.mistakeList.setAttribute('aria-busy', 'false');
            elements.visibleCount.textContent = 'Không thể tải dữ liệu';
            elements.smartNote.innerHTML = `
                <span><i class="fas fa-triangle-exclamation"></i></span>
                <p>Không thể đọc lịch sử làm bài lúc này. Vui lòng thử lại sau.</p>
            `;
            elements.mistakeList.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon"><i class="fas fa-cloud-arrow-down"></i></span>
                    <h3>Dữ liệu chưa sẵn sàng</h3>
                    <p>${escapeHtml(error.message || 'Đã xảy ra lỗi không xác định.')}</p>
                    <button type="button" id="retry-load">Thử tải lại</button>
                </div>
            `;
            document.getElementById('retry-load')?.addEventListener('click', () => {
                elements.mistakeList.innerHTML = '<article class="mistake-skeleton"></article><article class="mistake-skeleton"></article>';
                loadMistakes();
            });
        }
    }

    function populateSubjects() {
        const subjects = Array.from(new Set(
            state.rawMistakes.map((mistake) => mistake.subject).filter(Boolean)
        )).sort((a, b) => formatSubject(a).localeCompare(formatSubject(b), 'vi'));
        elements.subjectFilter.innerHTML = [
            '<option value="all">Tất cả nội dung</option>',
            ...subjects.map((subject) => `<option value="${escapeHtml(subject)}">${escapeHtml(formatSubject(subject))}</option>`)
        ].join('');
    }

    function cacheElements() {
        elements.daysControl = document.getElementById('days-control');
        elements.subjectFilter = document.getElementById('subject-filter');
        elements.search = document.getElementById('mistake-search');
        elements.targetCount = document.getElementById('target-count');
        elements.targetCountOutput = document.getElementById('target-count-output');
        elements.recommendButton = document.getElementById('recommend-button');
        elements.clearSelection = document.getElementById('clear-selection');
        elements.selectVisible = document.getElementById('select-visible');
        elements.startButton = document.getElementById('start-quiz-button');
        elements.mobileStartButton = document.getElementById('mobile-start-button');
        elements.mistakeList = document.getElementById('mistake-list');
        elements.visibleCount = document.getElementById('visible-count');
        elements.smartNote = document.getElementById('smart-note');
        elements.statMistakes = document.getElementById('stat-mistakes');
        elements.statUnique = document.getElementById('stat-unique');
        elements.statSelected = document.getElementById('stat-selected');
        elements.statDuration = document.getElementById('stat-duration');
        elements.statWindow = document.getElementById('stat-window');
        elements.selectedSummary = document.getElementById('selected-summary');
        elements.durationSummary = document.getElementById('duration-summary');
        elements.startButtonDetail = document.getElementById('start-button-detail');
        elements.mobileSelected = document.getElementById('mobile-selected');
        elements.mobileDuration = document.getElementById('mobile-duration');
        elements.toastRegion = document.getElementById('toast-region');
    }

    function bindEvents() {
        elements.daysControl.addEventListener('click', (event) => {
            const button = event.target.closest('[data-days]');
            if (!button) return;
            state.days = button.dataset.days;
            elements.daysControl.querySelectorAll('[data-days]').forEach((item) => {
                item.classList.toggle('active', item === button);
            });
            updateCandidates();
        });

        elements.subjectFilter.addEventListener('change', () => {
            state.subject = elements.subjectFilter.value;
            updateCandidates();
        });

        let searchTimer;
        elements.search.addEventListener('input', () => {
            window.clearTimeout(searchTimer);
            searchTimer = window.setTimeout(() => {
                state.query = elements.search.value;
                updateCandidates();
            }, 160);
        });

        elements.targetCount.addEventListener('input', () => {
            state.targetCount = Number(elements.targetCount.value);
            elements.targetCountOutput.textContent = `${state.targetCount} câu`;
        });

        elements.recommendButton.addEventListener('click', recommendQuestions);
        elements.clearSelection.addEventListener('click', () => {
            state.selected.clear();
            renderCandidateList();
            updateSelectionUI();
        });
        elements.selectVisible.addEventListener('click', selectVisibleQuestions);
        elements.startButton.addEventListener('click', startQuiz);
        elements.mobileStartButton.addEventListener('click', startQuiz);

        elements.mistakeList.addEventListener('change', (event) => {
            const checkbox = event.target.closest('.mistake-selector');
            if (!checkbox) return;
            const mistakeId = checkbox.value;
            toggleMistake(mistakeId, checkbox.checked);
            refreshCardSelection(mistakeId);
            updateSelectionUI();
        });

        elements.mistakeList.addEventListener('keydown', (event) => {
            const card = event.target.closest('.mistake-card');
            if (!card || (event.key !== 'Enter' && event.key !== ' ')) return;
            event.preventDefault();
            const mistakeId = card.dataset.mistakeId;
            toggleMistake(mistakeId, !state.selected.has(mistakeId));
            refreshCardSelection(mistakeId);
            updateSelectionUI();
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        cacheElements();
        bindEvents();
        updateSelectionUI();
        loadMistakes();
    });
})();
