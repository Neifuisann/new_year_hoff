// Global variables for pagination and sorting
let currentPage = 1;
const itemsPerPage = 15; // Default limit for history items
let totalItems = 0;
let currentSearch = '';
let currentSortColumn = 'time-desc'; // Default sort: newest first
let isLoading = false;

// Function to show/hide loader
function showLoader(show) {
    const loader = document.getElementById('loading-indicator');
    if (loader) {
        loader.style.display = show ? 'flex' : 'none';
    } else {
        // Create loader if it doesn't exist
        const loadingIndicator = document.createElement('div');
        loadingIndicator.id = 'loading-indicator';
        loadingIndicator.className = 'loading-indicator';
        loadingIndicator.innerHTML = `
            <div class="spinner"></div>
            <p>Đang tải...</p>
        `;
        loadingIndicator.style.display = show ? 'flex' : 'none';
        document.body.appendChild(loadingIndicator);
    }
}

async function loadHistory() {
    if (isLoading) return; // Prevent concurrent loads
    isLoading = true;
    showLoader(true);
    
    try {
        // Construct API URL with parameters
        const params = new URLSearchParams({
            page: currentPage,
            limit: itemsPerPage,
            sort: currentSortColumn
        });
        
        if (currentSearch) {
            params.append('search', currentSearch);
        }
        
        const response = await fetch(`/api/history?${params.toString()}`);
        if (!response.ok) {
            throw new Error('HTTP error! status: ' + response.status);
        }
        
        const data = await response.json();
        
        // Debug log to see data structure
        console.log('History Data:', data);
        
        // Store data globally for export
        window.historyData = data.history || [];
        totalItems = data.total || 0;
        
        // Update statistics cards
        updateStatisticsCards(window.historyData);
        
        // Update table
        updateTable();
        
        // Update pagination controls
        updatePaginationControls();

    } catch (error) {
        console.error('Error loading history:', error);
        showErrorMessage('Failed to load activity log.');
    } finally {
        showLoader(false);
        isLoading = false;
    }
}

function updateStatisticsCards(historyData) {
    // Calculate statistics
    const uniqueStudents = new Set(historyData.map(log => log.studentName)).size;
    const totalSubmissions = historyData.length > 0 ? totalItems : 0;
    
    // Calculate average score if there are submissions
    let avgScore = 0;
    if (historyData.length > 0) {
        avgScore = historyData.reduce((sum, log) => {
            const score = parseFloat(log.score);
            const totalPoints = parseFloat(log.totalPoints || 10); // Default to 10 if not provided
            return sum + (score / totalPoints);
        }, 0) / historyData.length;
    }
    
    // Count submissions from today
    const today = new Date().setHours(0, 0, 0, 0);
    const submissionsToday = historyData.filter(log => {
        const submissionDate = new Date(log.submittedAt).setHours(0, 0, 0, 0);
        return submissionDate === today;
    }).length;

    // Update statistics cards
    document.getElementById('total-students-history').textContent = uniqueStudents;
    document.getElementById('total-submissions').textContent = totalSubmissions;
    document.getElementById('avg-score-history').textContent = (avgScore * 100).toFixed(2) + '%';
    document.getElementById('submissions-today').textContent = submissionsToday;
}

function viewDetails(id) {
    console.log('viewDetails called with ID:', id);
    if (!id) {
        console.error('No result ID provided');
        return;
    }
    window.location.href = `/result/${id}`;
}

function exportToExcel() {
    if (!window.historyData || window.historyData.length === 0) {
        alert('Không có dữ liệu để xuất');
        return;
    }

    // Convert data to Excel format
    let data = window.historyData.map((log, index) => ({
        'STT': (currentPage - 1) * itemsPerPage + index + 1,
        'Tên học sinh': log.studentName,
        'Bài học': log.lessonTitle,
        'Thời gian nộp': new Date(log.submittedAt).toLocaleString(),
        'Điểm số': parseFloat(log.score).toFixed(2),
        'Tỉ lệ': log.totalPoints ? ((log.score / log.totalPoints) * 100).toFixed(1) + '%' : 'N/A'
    }));

    // Create worksheet
    const worksheet = XLSX.utils.json_to_sheet(data);
    
    // Create workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'History');
    
    // Generate Excel file
    XLSX.writeFile(workbook, 'history_export.xlsx');
}

// Function to update pagination controls
function updatePaginationControls() {
    const paginationContainer = document.getElementById('pagination-controls');
    if (!paginationContainer) {
        console.error('Pagination container not found');
        return;
    }
    
    paginationContainer.innerHTML = ''; // Clear existing controls
    
    if (totalItems <= itemsPerPage) {
        return; // No pagination needed
    }
    
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    
    // Previous button
    const prevButton = document.createElement('button');
    prevButton.className = 'pagination-btn prev';
    prevButton.innerHTML = '<i class="fas fa-chevron-left"></i> Trước';
    prevButton.disabled = currentPage === 1;
    prevButton.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            loadHistory();
        }
    });
    paginationContainer.appendChild(prevButton);
    
    // Page numbers
    const pagesElement = document.createElement('div');
    pagesElement.className = 'pagination-pages';
    
    // Determine which page numbers to show
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    
    // Adjust if we're near the end
    if (endPage - startPage < 4) {
        startPage = Math.max(1, endPage - 4);
    }
    
    // First page link if not in first group
    if (startPage > 1) {
        const firstPageBtn = document.createElement('button');
        firstPageBtn.className = 'pagination-btn page';
        firstPageBtn.textContent = '1';
        firstPageBtn.addEventListener('click', () => {
            currentPage = 1;
            loadHistory();
        });
        pagesElement.appendChild(firstPageBtn);
        
        if (startPage > 2) {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'pagination-ellipsis';
            ellipsis.textContent = '...';
            pagesElement.appendChild(ellipsis);
        }
    }
    
    // Page buttons
    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `pagination-btn page ${i === currentPage ? 'active' : ''}`;
        pageBtn.textContent = i;
        pageBtn.addEventListener('click', () => {
            if (i !== currentPage) {
                currentPage = i;
                loadHistory();
            }
        });
        pagesElement.appendChild(pageBtn);
    }
    
    // Last page link if not in last group
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'pagination-ellipsis';
            ellipsis.textContent = '...';
            pagesElement.appendChild(ellipsis);
        }
        
        const lastPageBtn = document.createElement('button');
        lastPageBtn.className = 'pagination-btn page';
        lastPageBtn.textContent = totalPages;
        lastPageBtn.addEventListener('click', () => {
            currentPage = totalPages;
            loadHistory();
        });
        pagesElement.appendChild(lastPageBtn);
    }
    
    paginationContainer.appendChild(pagesElement);
    
    // Next button
    const nextButton = document.createElement('button');
    nextButton.className = 'pagination-btn next';
    nextButton.innerHTML = 'Tiếp <i class="fas fa-chevron-right"></i>';
    nextButton.disabled = currentPage === totalPages;
    nextButton.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            loadHistory();
        }
    });
    paginationContainer.appendChild(nextButton);
}

// Function to handle search input
function handleSearch() {
    const searchInput = document.getElementById('history-filter-input');
    currentSearch = searchInput.value.trim();
    currentPage = 1; // Reset to first page for new search
    loadHistory();
}

// Function to handle sort selection
function sortTable(column) {
    // Toggle sort direction if clicking the same column
    if (currentSortColumn.replace(/-asc|-desc/, '') === column) {
        // Toggle direction: asc -> desc, desc -> asc
        currentSortColumn = currentSortColumn.includes('-asc') ? 
            column + '-desc' : column + '-asc';
    } else {
        // Default to ascending for new column
        currentSortColumn = column + '-asc';
    }
    
    // Update UI - clear old sort indicators
    const headers = document.querySelectorAll('th.sortable');
    headers.forEach(header => {
        header.classList.remove('sorted-asc', 'sorted-desc');
        const icon = header.querySelector('.fas');
        if (icon) {
            icon.className = 'fas fa-sort';
        }
    });
    
    // Find the header for the current sort column and update its icon
    const currentHeader = document.querySelector(`th.sortable[data-sort="${column}"]`);
    if (currentHeader) {
        const isSortAsc = currentSortColumn.includes('-asc');
        currentHeader.classList.add(isSortAsc ? 'sorted-asc' : 'sorted-desc');
        const icon = currentHeader.querySelector('.fas');
        if (icon) {
            icon.className = `fas fa-sort-${isSortAsc ? 'up' : 'down'}`;
        }
    }
    
    // Reset to page 1 and load with new sort
    currentPage = 1;
    loadHistory();
}

// Function to filter the history log based on student name or lesson title
function filterHistory(filterValue) {
    currentSearch = filterValue.trim();
    currentPage = 1; // Reset to first page for new search
    loadHistory();
}

function showErrorMessage(message) {
    // Create error message element
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
        <i class="fas fa-exclamation-circle"></i>
        <span>${message}</span>
        <button class="retry-btn" onclick="loadHistory()">
            <i class="fas fa-redo"></i> Retry
        </button>
    `;
    
    // Insert error message at the top of the history container
    const container = document.querySelector('.history-container');
    container.insertBefore(errorDiv, container.firstChild);
    
    // Remove error message after 5 seconds
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

function showSuccessMessage(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.innerHTML = `
        <i class="fas fa-check-circle"></i>
        <span>${message}</span>
    `;
    
    const container = document.querySelector('.history-container');
    container.insertBefore(successDiv, container.firstChild);
    
    setTimeout(() => {
        successDiv.remove();
    }, 3000);
}

function updateTable() {
    const table = document.getElementById('history-log');
    const tbody = table.querySelector('tbody');
    
    if (window.historyData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="no-results">
                    <i class="fas fa-info-circle"></i>
                    Không tìm thấy kết quả
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = window.historyData.map((log, index) => {
        const submittedAt = new Date(log.submittedAt).toLocaleString();
        const score = parseFloat(log.score).toFixed(2);
        const scorePercentage = log.totalPoints ? ((log.score / log.totalPoints) * 100).toFixed(1) + '%' : 'N/A';
        const scoreClass = (log.score / (log.totalPoints || 10)) >= 0.5 ? 'text-success' : 'text-danger';
        
        // Use the result ID for viewing details
        const resultId = log.resultId; 

        return `<tr>
                    <td>${(currentPage - 1) * itemsPerPage + index + 1}</td>
                    <td>
                        <div class="student-info">
                            <i class="fas fa-user-circle"></i>
                            <span>${log.studentName}</span>
                        </div>
                    </td>
                    <td>
                        <div class="lesson-info">
                            <i class="fas fa-book"></i>
                            <span>${log.lessonTitle}</span>
                        </div>
                    </td>
                    <td>
                        <div class="time-info">
                            <i class="fas fa-clock"></i>
                            <span>${submittedAt}</span>
                        </div>
                    </td>
                    <td>
                        <div class="score ${scoreClass}">
                            <i class="fas fa-star"></i>
                            <span>${score} (${scorePercentage})</span>
                        </div>
                    </td>
                    <td>
                        <button class="view-btn" data-result-id="${resultId}"> 
                            <i class="fas fa-eye"></i>
                        </button>
                    </td>
                </tr>`;
    }).join('');

    // Reattach view button event listeners
    attachViewButtonListeners();
}

function attachViewButtonListeners() {
    const viewButtons = document.querySelectorAll('.view-btn');
    viewButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Retrieve the result ID from the data attribute
            const resultId = button.getAttribute('data-result-id');
            
            if (!resultId) {
                console.error('Result ID not found on button.');
                alert('Could not determine the result to view.');
                return;
            }
            
            // Navigate to the correct result page using the ID
            window.location.href = `/result/${resultId}`;
        });
    });
}

async function deleteAllHistory() {
    if (!confirm('Bạn có chắc chắn muốn xóa tất cả lịch sử không?')) {
        return;
    }

    try {
        const response = await fetch('/api/history', {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Failed to delete history');
        }

        // Clear the table and update statistics
        window.historyData = [];
        currentPage = 1;
        totalItems = 0;
        updateTable();
        updateStatisticsCards([]);
        updatePaginationControls();
        showSuccessMessage('Đã xóa tất cả lịch sử thành công');
    } catch (error) {
        console.error('Error deleting history:', error);
        showErrorMessage('Không thể xóa lịch sử. Vui lòng thử lại sau.');
    }
}

// After the DOM content is loaded, attach event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Show loader
    showLoader(true);
    
    // Load initial data
    loadHistory();
    
    // Attach search events with debounce
    const filterInput = document.getElementById('history-filter-input');
    if (filterInput) {
        let debounceTimeout;
        filterInput.addEventListener('input', function() {
            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(() => {
                filterHistory(this.value);
            }, 2000); // Change from 300ms to 2000ms (2 seconds)
        });
    }
    
    const clearFilterBtn = document.getElementById('history-clear-filter-btn');
    if (clearFilterBtn) {
        clearFilterBtn.addEventListener('click', function() {
            if (filterInput) {
                filterInput.value = '';
                filterHistory('');
            }
        });
    }

    // Attach sort events
    const sortableHeaders = document.querySelectorAll('th.sortable');
    sortableHeaders.forEach(header => {
        header.addEventListener('click', () => {
            sortTable(header.dataset.sort);
        });
    });
}); 