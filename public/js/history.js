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
        const table = document.getElementById('history-log');
        const tbody = table.querySelector('tbody');
        
        tbody.innerHTML = historyData.map((log, index) => {
            // Debug log for each entry with all possible ID fields
            console.log('Log entry:', {
                log: log,
                possibleIds: {
                    id: log.id,
                    _id: log._id,
                    resultId: log.resultId,
                    submissionId: log.submissionId
                }
            });
            
            // Format submission time
            const submittedAt = new Date(log.submittedAt).toLocaleString();
            const score = parseFloat(log.score).toFixed(2);
            const scoreClass = score >= 5 ? 'text-success' : 'text-danger';
            
            // Create a unique identifier using studentName, lessonTitle, and submittedAt
            const uniqueId = `${log.studentName}-${log.lessonTitle}-${log.submittedAt}`;
            
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

        // Add click event listeners to all view buttons
        const viewButtons = document.querySelectorAll('.view-btn');
        viewButtons.forEach((button, index) => {
            button.addEventListener('click', () => {
                const studentName = button.getAttribute('data-student');
                const lessonTitle = button.getAttribute('data-lesson');
                const submittedAt = button.getAttribute('data-time');
                
                // Encode the parameters for the URL
                const params = new URLSearchParams({
                    student: studentName,
                    lesson: lessonTitle,
                    time: submittedAt
                });
                
                window.location.href = `/result?${params.toString()}`;
            });
        });

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
}); 