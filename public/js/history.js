async function loadHistory() {
    try {
        const response = await fetch('/api/history');
        if (!response.ok) {
            throw new Error('HTTP error! status: ' + response.status);
        }
        const historyData = await response.json();
        const table = document.getElementById('history-log');
        const tbody = table.querySelector('tbody');
        
        tbody.innerHTML = historyData.map((log, index) => {
            // Format submission time
            const submittedAt = new Date(log.submittedAt).toLocaleString();
            return `<tr>
                        <td>${index + 1}</td>
                        <td>${log.studentName}</td>
                        <td>${log.lessonTitle}</td>
                        <td>${submittedAt}</td>
                        <td>${log.score}</td>
                    </tr>`;
        }).join('');
    } catch (error) {
        console.error('Error loading history:', error);
        alert('Failed to load activity log.');
    }
}

// Initialize the history page when the DOM is loaded
document.addEventListener('DOMContentLoaded', loadHistory);

// Function to filter the history log based on student name or lesson title
function filterHistory(filterValue) {
    const table = document.getElementById('history-log');
    if (!table) return;
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    const rows = tbody.getElementsByTagName('tr');
    for (let row of rows) {
        const studentCell = row.cells[1]; // Student Name column
        const lessonCell = row.cells[2];  // Lesson Title column
        if (studentCell && lessonCell) {
            const studentName = studentCell.textContent.toLowerCase();
            const lessonTitle = lessonCell.textContent.toLowerCase();
            if (studentName.includes(filterValue.toLowerCase()) || lessonTitle.includes(filterValue.toLowerCase())) {
                row.style.display = "";
            } else {
                row.style.display = "none";
            }
        }
    }
}

// After the DOM content is loaded, attach filter event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Attach filter events after ensuring the page has loaded
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