const { supabaseAdmin, supabaseAnon } = require('../config/database');
const aiService = require('../services/ai/aiService');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');
const { UPLOAD_CONFIG } = require('../config/constants');
const sharp = require('sharp');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');

class UploadController {
  // Upload lesson image
  uploadLessonImage = asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new ValidationError('No image file provided');
    }

    const file = req.file;
    
    // Validate file type
    if (!UPLOAD_CONFIG.ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      throw new ValidationError('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.');
    }

    // Validate file size
    if (file.size > UPLOAD_CONFIG.MAX_FILE_SIZE) {
      throw new ValidationError('File size too large. Maximum size is 10MB.');
    }

    try {
      // Generate unique filename base
      const timestamp = Date.now();
      const filenameBase = `lesson-${timestamp}`;
      
      // Create multiple optimized versions for responsive images
      const sizes = [
        { width: 400, suffix: '-sm' },
        { width: 800, suffix: '-md' }, 
        { width: 1200, suffix: '-lg' }
      ];
      
      const uploadPromises = [];
      
      // Create WebP versions (better compression)
      for (const size of sizes) {
        const webpBuffer = await sharp(file.buffer)
          .resize(size.width, null, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .webp({ quality: 80 })
          .toBuffer();
          
        uploadPromises.push(
          supabaseAdmin.storage
            .from(UPLOAD_CONFIG.IMAGE_BUCKET)
            .upload(`${filenameBase}${size.suffix}.webp`, webpBuffer, {
              contentType: 'image/webp',
              cacheControl: '31536000' // 1 year cache
            })
        );
      }
      
      // Create fallback JPEG (for browser compatibility)
      const jpegBuffer = await sharp(file.buffer)
        .resize(UPLOAD_CONFIG.MAX_IMAGE_DIMENSION, UPLOAD_CONFIG.MAX_IMAGE_DIMENSION, {
          fit: 'inside', 
          withoutEnlargement: true
        })
        .jpeg({ quality: 85 })
        .toBuffer();
        
      uploadPromises.push(
        supabaseAdmin.storage
          .from(UPLOAD_CONFIG.IMAGE_BUCKET)
          .upload(`${filenameBase}.jpg`, jpegBuffer, {
            contentType: 'image/jpeg',
            cacheControl: '31536000' // 1 year cache
          })
      );
      
      // Upload all versions concurrently
      const results = await Promise.all(uploadPromises);
      const errors = results.filter(result => result.error);
      
      if (errors.length > 0) {
        console.error('Some image uploads failed:', errors);
        throw new Error('Failed to upload optimized images');
      }
      
      // Use the main JPEG as the primary image URL
      const { data, error } = results[results.length - 1]; // Last one is the JPEG

      if (error) {
        console.error('Supabase upload error:', error);
        throw new Error('Failed to upload image to storage');
      }

      // Get public URL using the uploaded file path
      const { data: urlData } = supabaseAnon.storage
        .from(UPLOAD_CONFIG.IMAGE_BUCKET)
        .getPublicUrl(data.path);

      res.json({
        success: true,
        message: 'Image uploaded successfully',
        imageUrl: urlData.publicUrl,
        filename: data.path
      });

    } catch (error) {
      console.error('Image processing error:', error);
      throw new Error('Failed to process image');
    }
  });

  // Upload and process document (PDF/DOCX)
  uploadDocument = asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new ValidationError('No document file provided');
    }

    const file = req.file;
    
    // Validate file type
    if (!UPLOAD_CONFIG.ALLOWED_DOCUMENT_TYPES.includes(file.mimetype)) {
      throw new ValidationError('Invalid file type. Only PDF and DOCX files are allowed.');
    }

    // Validate file size
    if (file.size > UPLOAD_CONFIG.MAX_FILE_SIZE) {
      throw new ValidationError('File size too large. Maximum size is 10MB.');
    }

    try {
      let extractedText = '';
      let formattedContent = '';

      // Extract text based on file type
      if (file.mimetype === 'application/pdf') {
        const pdfData = await pdfParse(file.buffer);
        extractedText = pdfData.text;

        if (!extractedText || extractedText.trim().length === 0) {
          // Image-only PDF: send raw bytes directly to Gemini for OCR + formatting
          console.log('PDF has no extractable text (image-only). Falling back to Gemini vision OCR...');
          formattedContent = await aiService.processImagePdfWithAI(file.buffer);
        } else {
          formattedContent = await aiService.formatDocumentWithAI(extractedText);
        }
      } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const docxData = await mammoth.extractRawText({ buffer: file.buffer });
        extractedText = docxData.value;

        if (!extractedText || extractedText.trim().length === 0) {
          throw new ValidationError('No text content found in the document');
        }

        formattedContent = await aiService.formatDocumentWithAI(extractedText);
      }

      res.json({
        success: true,
        message: 'Document processed successfully',
        originalText: extractedText,
        formattedContent: formattedContent,
        filename: file.originalname
      });

    } catch (error) {
      console.error('Document processing error:', error);
      if (error instanceof ValidationError || error.isOperational) {
        throw error; // Re-throw operational/validation errors as-is
      }
      throw new Error('Failed to process document');
    }
  });

  // Delete uploaded image
  deleteImage = asyncHandler(async (req, res) => {
    const { filename } = req.params;

    if (!filename) {
      throw new ValidationError('Filename is required');
    }

    try {
      const { error } = await supabaseAdmin.storage
        .from(UPLOAD_CONFIG.IMAGE_BUCKET)
        .remove([filename]);

      if (error) {
        console.error('Supabase delete error:', error);
        throw new Error('Failed to delete image from storage');
      }

      res.json({
        success: true,
        message: 'Image deleted successfully',
        filename: filename
      });

    } catch (error) {
      console.error('Image deletion error:', error);
      throw new Error('Failed to delete image');
    }
  });

  // Get upload configuration
  getUploadConfig = asyncHandler(async (req, res) => {
    res.json({
      success: true,
      config: {
        maxFileSize: UPLOAD_CONFIG.MAX_FILE_SIZE,
        maxImageDimension: UPLOAD_CONFIG.MAX_IMAGE_DIMENSION,
        allowedImageTypes: UPLOAD_CONFIG.ALLOWED_IMAGE_TYPES,
        allowedDocumentTypes: UPLOAD_CONFIG.ALLOWED_DOCUMENT_TYPES,
        imageBucket: UPLOAD_CONFIG.IMAGE_BUCKET
      }
    });
  });

  // Test AI service
  testAIService = asyncHandler(async (req, res) => {
    const { text } = req.body;

    if (!text) {
      throw new ValidationError('Text content is required for testing');
    }

    try {
      const formattedContent = await aiService.formatDocumentWithAI(text);

      res.json({
        success: true,
        message: 'AI service test successful',
        originalText: text,
        formattedContent: formattedContent
      });

    } catch (error) {
      console.error('AI service test error:', error);
      throw new Error('AI service test failed');
    }
  });

  // Validate uploaded file
  validateFile = asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new ValidationError('No file provided');
    }

    const file = req.file;
    const validationResult = {
      filename: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      valid: true,
      errors: []
    };

    // Check file size
    if (file.size > UPLOAD_CONFIG.MAX_FILE_SIZE) {
      validationResult.valid = false;
      validationResult.errors.push('File size exceeds maximum limit');
    }

    // Check file type
    const allowedTypes = [
      ...UPLOAD_CONFIG.ALLOWED_IMAGE_TYPES,
      ...UPLOAD_CONFIG.ALLOWED_DOCUMENT_TYPES
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      validationResult.valid = false;
      validationResult.errors.push('File type not allowed');
    }

    res.json({
      success: true,
      validation: validationResult
    });
  });

  // Get storage statistics
  getStorageStats = asyncHandler(async (req, res) => {
    try {
      // Get list of files in the bucket
      const { data: files, error } = await supabaseAdmin.storage
        .from(UPLOAD_CONFIG.IMAGE_BUCKET)
        .list();

      if (error) {
        console.error('Storage stats error:', error);
        throw new Error('Failed to get storage statistics');
      }

      const totalFiles = files ? files.length : 0;
      const totalSize = files ? files.reduce((sum, file) => sum + (file.metadata?.size || 0), 0) : 0;

      res.json({
        success: true,
        statistics: {
          totalFiles,
          totalSize,
          totalSizeMB: Math.round(totalSize / (1024 * 1024) * 100) / 100,
          bucket: UPLOAD_CONFIG.IMAGE_BUCKET
        }
      });

    } catch (error) {
      console.error('Storage statistics error:', error);
      throw new Error('Failed to get storage statistics');
    }
  });

  // Bulk upload images
  bulkUploadImages = asyncHandler(async (req, res) => {
    if (!req.files || req.files.length === 0) {
      throw new ValidationError('No files provided');
    }

    const results = [];
    const errors = [];

    for (const file of req.files) {
      try {
        // Validate each file
        if (!UPLOAD_CONFIG.ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
          errors.push(`${file.originalname}: Invalid file type`);
          continue;
        }

        if (file.size > UPLOAD_CONFIG.MAX_FILE_SIZE) {
          errors.push(`${file.originalname}: File too large`);
          continue;
        }

        // Process image
        const processedImageBuffer = await sharp(file.buffer)
          .resize(UPLOAD_CONFIG.MAX_IMAGE_DIMENSION, UPLOAD_CONFIG.MAX_IMAGE_DIMENSION, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .jpeg({ quality: 85 })
          .toBuffer();

        // Generate unique filename
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const filename = `lesson-${timestamp}-${randomSuffix}.jpg`;

        // Upload to Supabase Storage
        const { data, error } = await supabaseAdmin.storage
          .from(UPLOAD_CONFIG.IMAGE_BUCKET)
          .upload(filename, processedImageBuffer, {
            contentType: 'image/jpeg',
            cacheControl: '3600'
          });

        if (error) {
          errors.push(`${file.originalname}: Upload failed`);
          continue;
        }

        // Get public URL
        const { data: urlData } = supabaseAnon.storage
          .from(UPLOAD_CONFIG.IMAGE_BUCKET)
          .getPublicUrl(filename);

        results.push({
          originalName: file.originalname,
          filename: filename,
          imageUrl: urlData.publicUrl
        });

      } catch (error) {
        errors.push(`${file.originalname}: Processing failed`);
      }
    }

    res.json({
      success: true,
      message: `Processed ${results.length} files successfully`,
      results,
      errors,
      totalProcessed: results.length,
      totalErrors: errors.length
    });
  });
}

module.exports = new UploadController();
