// Store chart instance globally
let scoreChartInstance = null;

async function loadStatistics() {
    try {
        const lessonId = window.location.pathname.split('/').pop();
        const response = await fetch(`/api/lessons/${lessonId}/statistics`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const stats = await response.json();
        
        // Store stats globally for export
        window.lessonStats = stats;

        // Update basic stats - Add null checks
        safeUpdateText('total-students', stats.uniqueStudents);
        safeUpdateText('total-attempts', stats.totalAttempts);
        safeUpdateText('avg-score', (parseFloat(stats.averageScore) || 0).toFixed(2));
        safeUpdateText('low-scores', stats.lowScores);
        safeUpdateText('high-scores', stats.highScores);

        // Update the stats card labels - Add null checks
        safeUpdateLabel('low-scores', 'Tỉ lệ đúng < 50%');
        safeUpdateLabel('high-scores', 'Tỉ lệ đúng ≥ 50%');

        // Modified score chart section
        const scoreChart = document.getElementById('scoreChart');
        if (scoreChart) {
            // Destroy existing chart if it exists
            if (scoreChartInstance) {
                scoreChartInstance.destroy();
            }

            // Create new chart
            scoreChartInstance = new Chart(scoreChart, {
                type: 'bar',
                data: {
                    labels: stats.scoreDistribution.labels,
                    datasets: [{
                        label: 'Số lượt làm bài',
                        data: stats.scoreDistribution.data,
                        backgroundColor: 'rgba(54, 162, 235, 0.5)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1,
                                precision: 0
                            },
                            title: {
                                display: true,
                                text: 'Số lượt làm bài'
                            }
                        },
                        x: {
                            title: {
                                display: true,
                                text: 'Khoảng điểm'
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top'
                        },
                        title: {
                            display: true,
                            text: 'Phân bố điểm'
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return `Number of attempts: ${context.raw}`;
                                }
                            }
                        }
                    }
                }
            });
        }

        // Add null checks for tables
        const questionTable = document.getElementById('question-stats');
        if (questionTable) {
            questionTable.innerHTML = `
                <thead>
                    <tr>
                        <th>STT.</th>
                        <th>Câu</th>
                        <th>Tổng số học sinh</th>
                        <th>Đã làm</th>
                        <th>Chưa làm</th>
                        <th>Làm đúng</th>
                        <th>Làm Sai</th>
                        <th>Tỉ lệ làm</th>
                    </tr>
                </thead>
                <tbody>
                    ${stats.questionStats.map((q, idx) => `
                        <tr>
                            <td>${idx + 1}</td>
                            <td>${q.question}</td>
                            <td>${q.totalStudents}</td>
                            <td>${q.completed}</td>
                            <td>${q.notCompleted}</td>
                            <td>${q.correct}</td>
                            <td>${q.incorrect}</td>
                            <td>${(q.completed/q.totalStudents * 100).toFixed(2)}%</td>
                        </tr>
                    `).join('')}
                </tbody>
            `;
        }

        const transcriptsTable = document.getElementById('transcripts');
        if (transcriptsTable) {
            transcriptsTable.innerHTML = `
                <thead>
                    <tr>
                        <th>STT.</th>
                        <th>Tên</th>
                        <th>Ngày sinh</th>
                        <th>Điểm</th>
                    </tr>
                </thead>
                <tbody>
                    ${stats.transcripts.map((t, idx) => `
                        <tr>
                            <td>${idx + 1}</td>
                            <td>${t.name}</td>
                            <td>${t.dob || 'N/A'}</td>
                            <td>${t.score}</td>
                        </tr>
                    `).join('')}
                </tbody>
            `;
        }
    } catch (error) {
        console.error('Error loading statistics:', error);
        alert('Failed to load statistics. Please try again later.');
    }
}

function exportToExcel() {
    if (!window.lessonStats) return;

    // Create workbook
    const workbook = XLSX.utils.book_new();

    // Add Overview sheet
    const overviewData = [
        {
            'Chỉ số': 'Tổng số học sinh',
            'Giá trị': window.lessonStats.uniqueStudents
        },
        {
            'Chỉ số': 'Tổng số lần làm bài',
            'Giá trị': window.lessonStats.totalAttempts
        },
        {
            'Chỉ số': 'Điểm trung bình',
            'Giá trị': parseFloat(window.lessonStats.averageScore).toFixed(2)
        },
        {
            'Chỉ số': 'Tỉ lệ đúng < 50%',
            'Giá trị': window.lessonStats.lowScores
        },
        {
            'Chỉ số': 'Tỉ lệ đúng ≥ 50%',
            'Giá trị': window.lessonStats.highScores
        }
    ];
    const overviewSheet = XLSX.utils.json_to_sheet(overviewData);
    XLSX.utils.book_append_sheet(workbook, overviewSheet, 'Tổng quan');

    // Add Question Analysis sheet
    const questionData = window.lessonStats.questionStats.map((q, idx) => ({
        'STT': idx + 1,
        'Câu hỏi': q.question,
        'Tổng số học sinh': q.totalStudents,
        'Đã làm': q.completed,
        'Chưa làm': q.notCompleted,
        'Làm đúng': q.correct,
        'Làm sai': q.incorrect,
        'Tỉ lệ làm': `${(q.completed/q.totalStudents * 100).toFixed(2)}%`
    }));
    const questionSheet = XLSX.utils.json_to_sheet(questionData);
    XLSX.utils.book_append_sheet(workbook, questionSheet, 'Phân tích câu hỏi');

    // Add Student Transcripts sheet
    const transcriptData = window.lessonStats.transcripts.map((t, idx) => ({
        'STT': idx + 1,
        'Tên': t.name,
        'Ngày sinh': t.dob || 'N/A',
        'Điểm': t.score
    }));
    const transcriptSheet = XLSX.utils.json_to_sheet(transcriptData);
    XLSX.utils.book_append_sheet(workbook, transcriptSheet, 'Bảng điểm');

    // Add Score Distribution sheet
    const distributionData = window.lessonStats.scoreDistribution.labels.map((label, idx) => ({
        'Khoảng điểm': label,
        'Số lượt làm bài': window.lessonStats.scoreDistribution.data[idx]
    }));
    const distributionSheet = XLSX.utils.json_to_sheet(distributionData);
    XLSX.utils.book_append_sheet(workbook, distributionSheet, 'Phân bố điểm');

    // Generate Excel file
    XLSX.writeFile(workbook, 'lesson_statistics.xlsx');
}

// Add helper functions to handle null elements
function safeUpdateText(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) element.textContent = value;
}

function safeUpdateLabel(elementId, text) {
    const parent = document.getElementById(elementId)?.parentElement;
    const label = parent?.querySelector('.stat-label');
    if (label) label.textContent = text;
}

// Append student filter functionality for transcripts by student name
document.addEventListener('DOMContentLoaded', () => {
    loadStatistics();
    
    const studentFilterInput = document.getElementById('student-filter-input');
    const clearFilterBtn = document.getElementById('clear-filter-btn');
    if (studentFilterInput) {
        studentFilterInput.addEventListener('input', function() {
            filterTranscripts(this.value);
        });
    }
    if (clearFilterBtn) {
        clearFilterBtn.addEventListener('click', function() {
            if (studentFilterInput) {
                studentFilterInput.value = '';
                filterTranscripts('');
            }
        });
    }
});

function filterTranscripts(filterValue) {
    const transcriptsTable = document.getElementById('transcripts');
    if (!transcriptsTable) return;
    const tbody = transcriptsTable.querySelector('tbody');
    if (!tbody) return;
    const rows = tbody.getElementsByTagName('tr');
    for (let row of rows) {
        const nameCell = row.cells[1]; // Assuming Full Name is in the second column
        if (nameCell) {
            const nameText = nameCell.textContent.toLowerCase();
            if (nameText.includes(filterValue.toLowerCase())) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        }
    }
} 