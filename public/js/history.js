let currentSortColumn = null;
let currentSortDirection = 'asc';

async function loadHistory() {
    try {
        const response = await fetch('/api/history');
        if (!response.ok) {
            throw new Error('HTTP error! status: ' + response.status);
        }
        const historyData = await response.json();
        
        // Debug log to see data structure
        console.log('Raw History Data:', historyData);
        
        // Store data globally for export
        window.historyData = historyData;
        
        // Update statistics cards
        updateStatisticsCards(historyData);
        
        // Update table
        updateTable();

    } catch (error) {
        console.error('Error loading history:', error);
        showErrorMessage('Failed to load activity log.');
    }
}

function updateStatisticsCards(historyData) {
    // Calculate statistics
    const uniqueStudents = new Set(historyData.map(log => log.studentName)).size;
    const totalSubmissions = historyData.length;
    const avgScore = historyData.reduce((sum, log) => sum + parseFloat(log.score), 0) / totalSubmissions;
    
    // Count submissions from today
    const today = new Date().setHours(0, 0, 0, 0);
    const submissionsToday = historyData.filter(log => {
        const submissionDate = new Date(log.submittedAt).setHours(0, 0, 0, 0);
        return submissionDate === today;
    }).length;

    // Update statistics cards
    document.getElementById('total-students-history').textContent = uniqueStudents;
    document.getElementById('total-submissions').textContent = totalSubmissions;
    document.getElementById('avg-score-history').textContent = avgScore.toFixed(2);
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
    if (!window.historyData) return;

    // Convert data to Excel format
    let data = window.historyData.map(log => ({
        'STT': log.id,
        'Tên học sinh': log.studentName,
        'Bài học': log.lessonTitle,
        'Thời gian nộp': new Date(log.submittedAt).toLocaleString(),
        'Điểm số': parseFloat(log.score).toFixed(2)
    }));

    // Create worksheet
    const worksheet = XLSX.utils.json_to_sheet(data);
    
    // Create workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'History');
    
    // Generate Excel file
    XLSX.writeFile(workbook, 'history_export.xlsx');
}

// Function to filter the history log based on student name or lesson title
function filterHistory(filterValue) {
    const table = document.getElementById('history-log');
    if (!table) return;
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    const rows = tbody.getElementsByTagName('tr');
    
    const searchTerm = filterValue.toLowerCase();
    for (let row of rows) {
        const studentCell = row.cells[1];
        const lessonCell = row.cells[2];
        if (studentCell && lessonCell) {
            const studentName = studentCell.textContent.toLowerCase();
            const lessonTitle = lessonCell.textContent.toLowerCase();
            if (studentName.includes(searchTerm) || lessonTitle.includes(searchTerm)) {
                row.style.display = "";
            } else {
                row.style.display = "none";
            }
        }
    }
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

function sortTable(column) {
    const table = document.getElementById('history-log');
    const headers = table.querySelectorAll('th.sortable');
    const header = Array.from(headers).find(h => h.dataset.sort === column);
    
    // Remove active class and reset sort icons from all headers
    headers.forEach(h => {
        h.classList.remove('active');
        const icon = h.querySelector('.fas');
        if (icon && icon.classList.contains('fa-sort-up')) icon.classList.replace('fa-sort-up', 'fa-sort');
        if (icon && icon.classList.contains('fa-sort-down')) icon.classList.replace('fa-sort-down', 'fa-sort');
    });

    // Update sort direction
    if (currentSortColumn === column) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = column;
        currentSortDirection = 'asc';
    }

    // Update header icon
    if (header) {
        header.classList.add('active');
        const icon = header.querySelector('.fas');
        if (icon) {
            icon.classList.replace('fa-sort', currentSortDirection === 'asc' ? 'fa-sort-up' : 'fa-sort-down');
        }
    }

    // Sort the data
    if (window.historyData) {
        window.historyData.sort((a, b) => {
            let valueA, valueB;
            
            switch(column) {
                case 'name':
                    valueA = a.studentName.toLowerCase();
                    valueB = b.studentName.toLowerCase();
                    break;
                case 'lesson':
                    valueA = a.lessonTitle.toLowerCase();
                    valueB = b.lessonTitle.toLowerCase();
                    break;
                case 'time':
                    valueA = new Date(a.submittedAt).getTime();
                    valueB = new Date(b.submittedAt).getTime();
                    break;
                case 'score':
                    valueA = parseFloat(a.score);
                    valueB = parseFloat(b.score);
                    break;
                default:
                    return 0;
            }

            if (valueA < valueB) return currentSortDirection === 'asc' ? -1 : 1;
            if (valueA > valueB) return currentSortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        // Refresh the table
        updateTable();
    }
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
        updateTable();
        updateStatisticsCards([]);
        showSuccessMessage('Đã xóa tất cả lịch sử thành công');
    } catch (error) {
        console.error('Error deleting history:', error);
        showErrorMessage('Không thể xóa lịch sử. Vui lòng thử lại sau.');
    }
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
    
    tbody.innerHTML = window.historyData.map((log, index) => {
        const submittedAt = new Date(log.submittedAt).toLocaleString();
        const score = parseFloat(log.score).toFixed(2);
        const scoreClass = score >= 5 ? 'text-success' : 'text-danger';
        
        return `<tr>
                    <td>${index + 1}</td>
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
                            <span>${score}</span>
                        </div>
                    </td>
                    <td>
                        <button class="view-btn" data-student="${log.studentName}" 
                                               data-lesson="${log.lessonTitle}"
                                               data-time="${log.submittedAt}">
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
            const studentName = button.getAttribute('data-student');
            const lessonTitle = button.getAttribute('data-lesson');
            const submittedAt = button.getAttribute('data-time');
            
            const params = new URLSearchParams({
                student: studentName,
                lesson: lessonTitle,
                time: submittedAt
            });
            
            window.location.href = `/result?${params.toString()}`;
        });
    });
}

// After the DOM content is loaded, attach event listeners
document.addEventListener('DOMContentLoaded', () => {
    loadHistory();
    
    // Attach filter events
    const filterInput = document.getElementById('history-filter-input');
    const clearFilterBtn = document.getElementById('history-clear-filter-btn');
    
    if (filterInput) {
        filterInput.addEventListener('input', function() {
            filterHistory(this.value);
        });
    }
    
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