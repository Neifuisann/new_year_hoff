const express = require('express');
const router = express.Router();
const adminController = require('../lib/controllers/adminController');
const uploadController = require('../lib/controllers/uploadController');
const multer = require('multer');
const { requireAdminAuth } = require('../lib/middleware/auth');
const { noCacheMiddleware } = require('../lib/middleware/cache');
const {
  validateFileUpload
} = require('../lib/middleware/validation');
const { uploadErrorHandler } = require('../lib/middleware/errorHandler');

// Configure multer for document uploads
const documentStorage = multer.memoryStorage();
const documentUpload = multer({
  storage: documentStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  }
});

// Configure multer for image uploads
const imageStorage = multer.memoryStorage();
const imageUpload = multer({
  storage: imageStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  }
});

// All admin routes require admin authentication and no caching
router.use(requireAdminAuth);
router.use(noCacheMiddleware);

// Student management
router.get('/students', adminController.getStudents);
router.get('/unapproved-students', adminController.getUnapprovedStudents);
router.get('/approved-students', adminController.getApprovedStudents);
router.post('/students/:studentId/approve', adminController.approveStudent);
router.post('/students/:studentId/reject', adminController.rejectStudent);
router.delete('/students/:studentId', adminController.deleteStudent);
router.delete('/delete-student/:studentId', adminController.deleteStudent); // Alternative route for compatibility

// Device management
router.post('/students/:studentId/device', adminController.updateDeviceInfo);
router.delete('/students/:studentId/device', adminController.unbindDevice);
router.post('/unbind-device/:studentId', adminController.unbindDevice); // Alternative route for compatibility

// Student profile
router.get('/students/:studentId/profile', adminController.getStudentProfile);

// Adaptive quiz generation from recent student mistakes
router.get('/adaptive-quiz/insights', adminController.getAdaptiveQuizInsights);
router.post('/adaptive-quiz/create', adminController.createAdaptiveQuiz);

// Dashboard statistics
router.get('/dashboard-stats', adminController.getDashboardStats);

// Image upload route (for admin interface compatibility)
router.post('/upload-image',
  imageUpload.single('imageFile'),
  uploadErrorHandler,
  validateFileUpload,
  uploadController.uploadLessonImage
);

// Document upload routes (for backward compatibility)
router.post('/upload-document',
  documentUpload.single('document'),
  uploadErrorHandler,
  validateFileUpload,
  uploadController.uploadDocument
);

router.post('/process-document',
  documentUpload.single('document'),
  uploadErrorHandler,
  validateFileUpload,
  uploadController.uploadDocument
);

module.exports = router;
