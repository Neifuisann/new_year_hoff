(function () {
    'use strict';

    const state = {
        days: 14,
        count: 12,
        studentId: 'all',
        subject: 'all',
        insights: null,
        availableStudents: [],
        availableSubjects: [],
        titleTouched: false,
        loadController: null,
        loadTimer: null,
        loading: false
    };

    const elements = {};

    function cacheElements() {
        [
            'adaptive-quiz-form', 'student-filter', 'student-hint', 'days-control',
            'subject-filter', 'question-count', 'question-count-output', 'quiz-title',
            'create-quiz-button', 'create-button-detail', 'refresh-analysis', 'insight-strip',
            'source-breakdown', 'source-count', 'question-list', 'question-list-count',
            'footer-question-count', 'footer-duration', 'stat-mistakes', 'stat-window',
            'stat-questions', 'stat-students', 'stat-attempts', 'stat-selected',
            'toast-region', 'success-modal', 'success-title', 'success-description',
            'success-questions', 'success-duration', 'success-preview-link',
            'success-edit-link', 'close-success-modal'
        ].forEach((id) => {
            elements[id] = document.getElementById(id);
        });
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatNumber(value) {
        return new Intl.NumberFormat('vi-VN').format(Number(value) || 0);
    }

    function formatSubject(value) {
        const labels = {
            physics: 'Vật lý',
            chemistry: 'Hóa học',
            mathematics: 'Toán học',
            math: 'Toán học'
        };
        return labels[value] || value || 'Chưa phân loại';
    }

    function formatType(value) {
        return {
            abcd: 'Trắc nghiệm',
            truefalse: 'Đúng / Sai',
            number: 'Trả lời ngắn'
        }[value] || 'Câu hỏi';
    }

    function formatRelativeTime(value) {
        const timestamp = new Date(value).getTime();
        if (!Number.isFinite(timestamp)) return 'Gần đây';
        const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
        if (minutes < 1) return 'Vừa xong';
        if (minutes < 60) return `${minutes} phút trước`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} giờ trước`;
        const days = Math.floor(hours / 24);
        if (days === 1) return 'Hôm qua';
        return `${days} ngày trước`;
    }

    function getDuration(questionCount = state.count) {
        return Math.max(10, Math.ceil(Number(questionCount || 0) * 1.5));
    }

    function getSelectedStudent() {
        return state.availableStudents.find((student) => student.id === state.studentId) || null;
    }

    function buildDefaultTitle() {
        const date = new Intl.DateTimeFormat('vi-VN', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        }).format(new Date());
        const student = getSelectedStudent();
        return student
            ? `Ôn lỗi sai • ${student.name} • ${date}`
            : `Đề ôn lỗi sai gần đây • ${date}`;
    }

    function updateDefaultTitle() {
        if (!state.titleTouched) {
            elements['quiz-title'].value = buildDefaultTitle();
        }
    }

    function updateRangePresentation() {
        const input = elements['question-count'];
        const min = Number(input.min);
        const max = Number(input.max);
        const progress = ((state.count - min) / (max - min)) * 100;
        input.style.setProperty('--range-progress', `${progress}%`);
        elements['question-count-output'].textContent = state.count;

        const selectedCount = state.insights?.summary?.selectedQuestions ?? state.count;
        elements['create-button-detail'].textContent = `${selectedCount} câu • khoảng ${getDuration(selectedCount)} phút`;
    }

    function mergeById(existing, incoming) {
        const merged = new Map(existing.map((item) => [item.id, item]));
        incoming.forEach((item) => merged.set(item.id, item));
        return Array.from(merged.values()).sort((a, b) => (
            b.mistakeCount - a.mistakeCount || a.name.localeCompare(b.name, 'vi')
        ));
    }

    function populateStudentOptions(students) {
        state.availableStudents = mergeById(state.availableStudents, students || []);
        const select = elements['student-filter'];
        const currentValue = state.studentId;
        select.innerHTML = '';

        const allOption = new Option('Tất cả học sinh gần đây', 'all');
        select.appendChild(allOption);
        state.availableStudents.forEach((student) => {
            const label = `${student.name} · ${formatNumber(student.mistakeCount)} lỗi`;
            select.appendChild(new Option(label, student.id));
        });

        select.value = currentValue;
        if (select.value !== currentValue) {
            state.studentId = 'all';
            select.value = 'all';
        }
    }

    function populateSubjectOptions(subjects) {
        state.availableSubjects = Array.from(new Set([
            ...state.availableSubjects,
            ...(subjects || [])
        ])).sort((a, b) => a.localeCompare(b, 'vi'));

        const select = elements['subject-filter'];
        const currentValue = state.subject;
        select.innerHTML = '';
        select.appendChild(new Option('Tất cả nội dung', 'all'));
        state.availableSubjects.forEach((subject) => {
            select.appendChild(new Option(formatSubject(subject), subject));
        });
        select.value = currentValue;
        if (select.value !== currentValue) {
            state.subject = 'all';
            select.value = 'all';
        }
    }

    function renderStats(data) {
        const summary = data.summary;
        elements['stat-mistakes'].textContent = formatNumber(summary.totalMistakes);
        elements['stat-window'].textContent = `${data.filters.days} ngày`;
        elements['stat-questions'].textContent = formatNumber(summary.uniqueQuestions);
        elements['stat-students'].textContent = formatNumber(summary.studentsAffected);
        elements['stat-attempts'].textContent = `${formatNumber(summary.attemptsAnalyzed)} lượt làm`;
        elements['stat-selected'].textContent = formatNumber(summary.selectedQuestions);
    }

    function renderInsight(data) {
        const summary = data.summary;
        const student = getSelectedStudent();
        const target = student ? `<strong>${escapeHtml(student.name)}</strong>` : 'nhóm học sinh gần đây';
        let message;

        if (summary.totalMistakes === 0) {
            message = `Chưa có lỗi sai trong ${data.filters.days} ngày với bộ lọc này. Hãy thử mở rộng thời gian phân tích.`;
        } else {
            message = `Từ <strong>${formatNumber(summary.totalMistakes)} lỗi sai</strong> của ${target}, hệ thống đã gộp thành <strong>${formatNumber(summary.uniqueQuestions)} câu</strong> và chọn ${formatNumber(summary.selectedQuestions)} câu có tín hiệu ôn tập cao nhất.`;
            if (summary.unusableMistakes > 0) {
                message += ` ${formatNumber(summary.unusableMistakes)} lỗi thiếu dữ liệu đáp án đã được bỏ qua an toàn.`;
            }
            if (summary.isTruncated) {
                message += ' Phân tích đang dùng 500 lượt làm mới nhất.';
            }
        }

        elements['insight-strip'].classList.remove('error');
        elements['insight-strip'].innerHTML = `
            <span class="insight-icon"><i class="fas fa-lightbulb"></i></span>
            <p>${message}</p>
        `;
    }

    function renderSources(data) {
        const sources = data.sourceBreakdown.slice(0, 4);
        elements['source-count'].textContent = `${data.sourceBreakdown.length} bài nguồn`;

        if (sources.length === 0) {
            elements['source-breakdown'].innerHTML = '<span class="field-hint">Chưa có nguồn lỗi sai phù hợp.</span>';
            return;
        }

        const maxMistakes = Math.max(...sources.map((source) => source.mistakeCount), 1);
        elements['source-breakdown'].innerHTML = sources.map((source) => {
            const width = Math.max(8, Math.round((source.mistakeCount / maxMistakes) * 100));
            return `
                <article class="source-item">
                    <div class="source-item-heading">
                        <strong title="${escapeHtml(source.title)}">${escapeHtml(source.title)}</strong>
                        <span>${formatNumber(source.mistakeCount)} lỗi</span>
                    </div>
                    <div class="source-track"><i style="--source-width: ${width}%"></i></div>
                </article>
            `;
        }).join('');
    }

    function renderMath(container) {
        if (typeof window.renderMathInElement !== 'function') return;
        try {
            window.renderMathInElement(container, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\(', right: '\\)', display: false },
                    { left: '\\[', right: '\\]', display: true }
                ],
                throwOnError: false
            });
        } catch (error) {
            console.warn('Math preview could not be rendered:', error);
        }
    }

    function renderQuestions(data) {
        const candidates = data.candidates;
        elements['question-list-count'].textContent = `${candidates.length} / ${data.summary.availableQuestions} câu`;

        if (candidates.length === 0) {
            elements['question-list'].innerHTML = `
                <div class="empty-state">
                    <div>
                        <i class="fas fa-search"></i>
                        <h3>Chưa đủ dữ liệu để tạo đề</h3>
                        <p>Thử chọn “Tất cả học sinh” hoặc tăng khoảng thời gian lên 30 ngày.</p>
                    </div>
                </div>
            `;
            return;
        }

        elements['question-list'].innerHTML = candidates.map((candidate, index) => `
            <article class="question-card">
                <span class="question-rank">${String(index + 1).padStart(2, '0')}</span>
                <div class="question-copy">
                    <p>${escapeHtml(candidate.question).replace(/\n/g, '<br>')}</p>
                    <div class="question-meta">
                        <span class="meta-chip lesson-chip"><i class="fas fa-book-open"></i><span>${escapeHtml(candidate.lesson.title)}</span></span>
                        <span class="meta-chip type-chip">${escapeHtml(formatType(candidate.type))}</span>
                        ${candidate.studentCount > 1 ? `<span class="meta-chip"><i class="fas fa-users"></i>${candidate.studentCount} học sinh</span>` : ''}
                    </div>
                </div>
                <div class="question-signal">
                    <span class="signal-count"><i class="fas fa-chart-line"></i>${formatNumber(candidate.mistakeCount)} lần sai</span>
                    <small>${escapeHtml(formatRelativeTime(candidate.lastMistakeAt))}</small>
                </div>
            </article>
        `).join('');

        renderMath(elements['question-list']);
    }

    function renderFooter(data) {
        const count = data.summary.selectedQuestions;
        const duration = getDuration(count);
        elements['footer-question-count'].textContent = `${count} câu`;
        elements['footer-duration'].textContent = `${duration} phút`;
        elements['create-button-detail'].textContent = `${count} câu • khoảng ${duration} phút`;
        elements['create-quiz-button'].disabled = count === 0 || state.loading;
    }

    function renderInsights(data) {
        renderStats(data);
        renderInsight(data);
        renderSources(data);
        renderQuestions(data);
        renderFooter(data);
    }

    function renderInitialSkeleton() {
        elements['source-breakdown'].innerHTML = '<div class="source-skeleton"></div><div class="source-skeleton short"></div>';
        elements['question-list'].innerHTML = '<article class="question-skeleton"></article><article class="question-skeleton"></article><article class="question-skeleton"></article>';
    }

    function renderError(error) {
        elements['insight-strip'].classList.add('error');
        elements['insight-strip'].innerHTML = `
            <span class="insight-icon"><i class="fas fa-exclamation-triangle"></i></span>
            <p><strong>Chưa thể tải dữ liệu.</strong> ${escapeHtml(error.message || 'Vui lòng thử lại sau.')}</p>
        `;
        elements['question-list'].innerHTML = `
            <div class="empty-state">
                <div>
                    <i class="fas fa-cloud-download-alt"></i>
                    <h3>Không tải được bản xem trước</h3>
                    <p>Kiểm tra phiên đăng nhập quản trị rồi nhấn nút làm mới.</p>
                </div>
            </div>
        `;
        elements['create-quiz-button'].disabled = true;
    }

    function setLoading(loading) {
        state.loading = loading;
        elements['refresh-analysis'].classList.toggle('loading', loading);
        elements['refresh-analysis'].disabled = loading;
        elements['question-list'].classList.toggle('loading-state', loading);
        elements['create-quiz-button'].disabled = loading || !state.insights?.summary?.selectedQuestions;
        if (loading && !state.insights) renderInitialSkeleton();
    }

    async function parseResponse(response) {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(body.message || body.error || `Yêu cầu thất bại (${response.status})`);
            error.status = response.status;
            throw error;
        }
        return body;
    }

    async function loadInsights() {
        if (state.loadController) state.loadController.abort();
        const controller = new AbortController();
        state.loadController = controller;
        setLoading(true);

        const params = new URLSearchParams({
            days: String(state.days),
            count: String(state.count),
            studentId: state.studentId,
            subject: state.subject
        });

        try {
            const response = await fetch(`/api/admin/adaptive-quiz/insights?${params}`, {
                credentials: 'same-origin',
                headers: { Accept: 'application/json' },
                signal: controller.signal
            });
            const body = await parseResponse(response);
            state.insights = body.data;
            populateStudentOptions(body.data.students);
            populateSubjectOptions(body.data.subjects);
            updateDefaultTitle();
            renderInsights(body.data);
        } catch (error) {
            if (error.name !== 'AbortError') {
                if (error.status === 401) {
                    error.message = 'Phiên quản trị đã hết hạn. Hãy đăng nhập lại.';
                }
                renderError(error);
            }
        } finally {
            if (state.loadController === controller) {
                setLoading(false);
            }
        }
    }

    function scheduleInsightsLoad(delay = 180) {
        clearTimeout(state.loadTimer);
        state.loadTimer = setTimeout(loadInsights, delay);
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<i class="fas fa-${type === 'error' ? 'exclamation-triangle' : 'info-circle'}"></i><span>${escapeHtml(message)}</span>`;
        elements['toast-region'].appendChild(toast);
        setTimeout(() => toast.remove(), 4500);
    }

    function setCreateLoading(loading) {
        const button = elements['create-quiz-button'];
        if (loading) {
            button.dataset.originalHtml = button.innerHTML;
            button.innerHTML = '<span class="button-icon"><i class="fas fa-spinner fa-spin"></i></span><span><strong>Đang tạo đề…</strong><small>Đang chuẩn hóa câu hỏi và thang điểm</small></span>';
            button.disabled = true;
        } else {
            button.innerHTML = button.dataset.originalHtml;
            button.disabled = !state.insights?.summary?.selectedQuestions;
        }
    }

    async function getCsrfToken() {
        const response = await fetch('/api/csrf-token', {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' }
        });
        const body = await parseResponse(response);
        if (!body.csrfToken) throw new Error('Không lấy được mã bảo vệ yêu cầu.');
        return body.csrfToken;
    }

    function openSuccessModal(result) {
        const lesson = result.data.lesson;
        const links = result.data.links;
        const duration = getDuration(lesson.questionCount);
        elements['success-title'].textContent = lesson.title;
        elements['success-description'].textContent = 'Đề mới đã được thêm vào kho bài học. Bạn có thể xem nhanh hoặc chỉnh sửa trước khi giao.';
        elements['success-questions'].textContent = lesson.questionCount;
        elements['success-duration'].textContent = duration;
        elements['success-preview-link'].href = links.preview;
        elements['success-edit-link'].href = links.edit;
        elements['success-modal'].hidden = false;
        document.body.style.overflow = 'hidden';
        elements['close-success-modal'].focus();
    }

    function closeSuccessModal() {
        elements['success-modal'].hidden = true;
        document.body.style.overflow = '';
    }

    async function createQuiz(event) {
        event.preventDefault();
        if (!state.insights?.summary?.selectedQuestions) {
            showToast('Chưa có câu hỏi phù hợp để tạo đề.', 'error');
            return;
        }

        setCreateLoading(true);
        try {
            const csrfToken = await getCsrfToken();
            const payload = {
                studentId: state.studentId,
                subject: state.subject,
                days: state.days,
                count: state.count,
                title: elements['quiz-title'].value.trim(),
                csrfToken
            };
            const response = await fetch('/api/admin/adaptive-quiz/create', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'x-csrf-token': csrfToken
                },
                body: JSON.stringify(payload)
            });
            const result = await parseResponse(response);
            openSuccessModal(result);
        } catch (error) {
            showToast(error.message || 'Không thể tạo đề luyện tập.', 'error');
        } finally {
            setCreateLoading(false);
        }
    }

    function bindEvents() {
        elements['adaptive-quiz-form'].addEventListener('submit', createQuiz);

        elements['student-filter'].addEventListener('change', (event) => {
            state.studentId = event.target.value;
            const selected = getSelectedStudent();
            elements['student-hint'].textContent = selected
                ? `Tạo đề tập trung vào lỗi sai gần đây của ${selected.name}.`
                : 'Tổng hợp những lỗi phổ biến của cả nhóm.';
            updateDefaultTitle();
            loadInsights();
        });

        elements['subject-filter'].addEventListener('change', (event) => {
            state.subject = event.target.value;
            loadInsights();
        });

        elements['days-control'].addEventListener('click', (event) => {
            const button = event.target.closest('[data-days]');
            if (!button || button.classList.contains('active')) return;
            state.days = Number(button.dataset.days);
            elements['days-control'].querySelectorAll('[data-days]').forEach((item) => {
                item.classList.toggle('active', item === button);
            });
            loadInsights();
        });

        elements['question-count'].addEventListener('input', (event) => {
            state.count = Number(event.target.value);
            updateRangePresentation();
            scheduleInsightsLoad();
        });

        elements['quiz-title'].addEventListener('input', () => {
            state.titleTouched = elements['quiz-title'].value.trim().length > 0;
        });

        elements['refresh-analysis'].addEventListener('click', loadInsights);
        elements['close-success-modal'].addEventListener('click', closeSuccessModal);
        elements['success-modal'].addEventListener('click', (event) => {
            if (event.target === elements['success-modal']) closeSuccessModal();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !elements['success-modal'].hidden) closeSuccessModal();
        });
    }

    function initialize() {
        cacheElements();
        bindEvents();
        updateRangePresentation();
        updateDefaultTitle();
        loadInsights();
    }

    document.addEventListener('DOMContentLoaded', initialize);
})();
