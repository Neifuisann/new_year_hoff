document.addEventListener('DOMContentLoaded', function() {
    // Get the modal
    const modal = document.getElementById('user-info-modal');
    const userInfoForm = document.getElementById('user-info-form');

    // Get the "Chinh phục" button
    const conquestButton = document.querySelector('.nav-bar a[href="#chinh-phuc"]');
    if (conquestButton) {
        conquestButton.addEventListener('click', function(e) {
            e.preventDefault();
            openModal();
        });
    }

    // Function to open modal
    function openModal() {
        modal.style.display = 'block';
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
    }

    // Function to close modal
    window.closeModal = function() {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }

    // Close modal when clicking outside
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Handle form submission
    userInfoForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const studentName = document.getElementById('student-name').value;
        const studentDob = document.getElementById('student-dob').value;
        const studentId = document.getElementById('student-id').value;

        // Create student info object
        const studentInfo = {
            name: studentName,
            dob: studentDob,
            id: studentId,
            studentId: studentId // Adding this for consistency with other parts of the app
        };

        // Store in both localStorage and sessionStorage
        localStorage.setItem('studentInfo', JSON.stringify(studentInfo));
        sessionStorage.setItem('studentInfo', JSON.stringify(studentInfo));

        // Redirect to the quizgame page
        window.location.href = '/quizgame';
    });
}); 