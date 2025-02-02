async function loadStatistics() {
    try {
        const lessonId = window.location.pathname.split('/').pop();
        const response = await fetch(`/api/lessons/${lessonId}/statistics`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const stats = await response.json();

        // Update basic stats - Add null checks
        safeUpdateText('total-students', stats.uniqueStudents);
        safeUpdateText('total-attempts', stats.totalAttempts);
        safeUpdateText('avg-score', (parseFloat(stats.averageScore) || 0).toFixed(2));
        safeUpdateText('low-scores', stats.lowScores);
        safeUpdateText('high-scores', stats.highScores);

        // Update the stats card labels - Add null checks
        safeUpdateLabel('low-scores', 'Scores < 50%');
        safeUpdateLabel('high-scores', 'Scores ≥ 50%');

        // Modified score chart section
        const scoreChart = document.getElementById('scoreChart');
        if (scoreChart) {
            new Chart(scoreChart, {
                type: 'bar',
                data: {
                    labels: stats.scoreDistribution.labels,
                    datasets: [{
                        label: 'Number of Attempts',
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
                                text: 'Number of Attempts'
                            }
                        },
                        x: {
                            title: {
                                display: true,
                                text: 'Score Range'
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
                            text: 'Score Distribution'
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
                        <th>NO.</th>
                        <th>Question</th>
                        <th>Total Students</th>
                        <th>Completed</th>
                        <th>Not Completed</th>
                        <th>Correct</th>
                        <th>Incorrect</th>
                        <th>Completion Rate</th>
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
                        <th>NO.</th>
                        <th>Full Name</th>
                        <th>Date of Birth</th>
                        <th>Score</th>
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

document.addEventListener('DOMContentLoaded', loadStatistics); 