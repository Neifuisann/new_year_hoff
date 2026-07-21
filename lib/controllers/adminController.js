const databaseService = require('../services/databaseService');
const adaptiveQuizService = require('../services/adaptiveQuizService');
const cacheService = require('../services/cacheService');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

function parseAdaptiveInteger(value, fallback, min, max, label) {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        throw new ValidationError(`${label} must be between ${min} and ${max}`);
    }
    return parsed;
}

async function loadAdaptiveSourceData(days) {
    const cacheKey = cacheService.createCacheKey('adaptive-quiz-source', days);
    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;

    const sourceData = await databaseService.getAdaptiveQuizSourceData({
        days,
        maxResults: 500
    });
    await cacheService.set(cacheKey, sourceData, 30);
    return sourceData;
}

function getAdaptiveOptions(source = {}) {
    const studentId = source.studentId && source.studentId !== 'all'
        ? String(source.studentId).trim()
        : null;
    const subject = source.subject && source.subject !== 'all'
        ? String(source.subject).trim()
        : null;

    if (studentId && studentId.length > 100) {
        throw new ValidationError('Student ID is invalid');
    }
    if (subject && subject.length > 80) {
        throw new ValidationError('Subject is invalid');
    }

    return {
        studentId,
        subject,
        days: parseAdaptiveInteger(source.days, 14, 1, 90, 'Lookback period'),
        count: parseAdaptiveInteger(source.count, 12, 1, 30, 'Question count')
    };
}

class AdminController {
    // Get all students
    getStudents = asyncHandler(async (req, res) => {
        const { approved } = req.query;
        const approvedFilter = approved === 'true' ? true : approved === 'false' ? false : null;

        const students = await databaseService.getStudents({ approved: approvedFilter });
        res.json(students);
    });

    // Get unapproved students
    getUnapprovedStudents = asyncHandler(async (req, res) => {
        const students = await databaseService.getStudents({ approved: false });
        res.json(students);
    });

    // Get approved students
    getApprovedStudents = asyncHandler(async (req, res) => {
        const students = await databaseService.getStudents({ approved: true });
        res.json(students);
    });
    
    // Approve student
    approveStudent = asyncHandler(async (req, res) => {
        const { studentId } = req.params;
        const { deviceId } = req.body;
        
        const updateData = { is_approved: true };
        if (deviceId) {
            updateData.approved_device_id = deviceId;
            updateData.device_registered_at = new Date().toISOString();
        }
        
        await databaseService.updateStudent(studentId, updateData);
        
        res.json({ 
            success: true, 
            message: 'Student approved successfully' 
        });
    });
    
    // Reject student
    rejectStudent = asyncHandler(async (req, res) => {
        const { studentId } = req.params;
        
        await databaseService.updateStudent(studentId, { is_approved: false });
        
        res.json({ 
            success: true, 
            message: 'Student rejected successfully' 
        });
    });
    
    // Delete student and all data
    deleteStudent = asyncHandler(async (req, res) => {
        const { studentId } = req.params;
        
        await databaseService.deleteStudentAndData(studentId);
        
        res.json({ 
            success: true, 
            message: 'Student and all associated data deleted successfully' 
        });
    });
    
    // Update device info
    updateDeviceInfo = asyncHandler(async (req, res) => {
        const { studentId } = req.params;
        const { deviceId, deviceFingerprint } = req.body;
        
        await databaseService.updateDeviceInfo(studentId, deviceId, deviceFingerprint);
        
        res.json({ 
            success: true, 
            message: 'Device information updated successfully' 
        });
    });
    
    // Unbind device
    unbindDevice = asyncHandler(async (req, res) => {
        const { studentId } = req.params;
        
        await databaseService.unbindDevice(studentId);
        
        res.json({ 
            success: true, 
            message: 'Device unbound successfully' 
        });
    });
    
    // Get student profile
    getStudentProfile = asyncHandler(async (req, res) => {
        const { studentId } = req.params;

        const profile = await databaseService.getStudentProfile(studentId);
        res.json(profile);
    });

    // Analyze recent wrong answers and return a ranked, reusable question preview.
    getAdaptiveQuizInsights = asyncHandler(async (req, res) => {
        const options = getAdaptiveOptions(req.query);
        const sourceData = await loadAdaptiveSourceData(options.days);
        const insights = adaptiveQuizService.analyzeRecentMistakes(sourceData, options);

        res.json({
            success: true,
            data: adaptiveQuizService.toPublicInsights(insights)
        });
    });

    // Create a standard 10-point lesson from the latest ranked mistake analysis.
    createAdaptiveQuiz = asyncHandler(async (req, res) => {
        const options = getAdaptiveOptions(req.body);
        const sourceData = await loadAdaptiveSourceData(options.days);
        const insights = adaptiveQuizService.analyzeRecentMistakes(sourceData, options);

        if (insights.candidates.length === 0) {
            return res.status(422).json({
                success: false,
                code: 'NO_RECENT_MISTAKES',
                message: 'No reusable wrong answers were found for the selected filters.'
            });
        }

        const lessonPayload = adaptiveQuizService.buildAdaptiveLessonPayload(insights, {
            title: req.body.title
        });
        const lesson = await databaseService.createLesson(lessonPayload);

        res.status(201).json({
            success: true,
            message: 'Adaptive review quiz created successfully',
            data: {
                lesson: {
                    id: lesson.id,
                    title: lesson.title,
                    questionCount: lessonPayload.questions.length,
                    totalPoints: 10
                },
                analysis: insights.summary,
                links: {
                    preview: `/lesson/${lesson.id}`,
                    edit: `/admin/edit/${lesson.id}`,
                    lessons: '/admin'
                }
            }
        });
    });

    // Get dashboard statistics
    getDashboardStats = asyncHandler(async (req, res) => {
        try {
            const stats = await databaseService.calculatePlatformStats();
            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            console.error('Error getting dashboard stats:', error);
            res.status(500).json({
                success: false,
                message: 'Error calculating dashboard statistics'
            });
        }
    });
}

module.exports = new AdminController();
