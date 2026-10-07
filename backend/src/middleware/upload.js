import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { env } from '../config/env.js';

// Ensure upload directory exists
if (!fs.existsSync(env.UPLOAD_DIR)) {
  fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, env.UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const randomHex = crypto.randomBytes(16).toString('hex');
    cb(null, `${Date.now()}-${randomHex}.pdf`);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const isPdfMime = file.mimetype === 'application/pdf';
  const isPdfExt = ext === '.pdf';

  if (isPdfMime && isPdfExt) {
    cb(null, true);
  } else {
    const err = new Error('Invalid file type. Only PDF documents (.pdf) are permitted.');
    err.statusCode = 400;
    cb(err, false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.MAX_UPLOAD_MB * 1024 * 1024
  }
});

/**
 * Middleware wrapper to provide specific error messages on upload limits / type errors
 */
export const uploadSinglePdf = (fieldName = 'file') => {
  const single = upload.single(fieldName);

  return (req, res, next) => {
    single(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            error: `File size exceeds the ${env.MAX_UPLOAD_MB}MB limit. Please upload a smaller PDF.`
          });
        }
        return res.status(400).json({
          success: false,
          error: `Upload error: ${err.message}`
        });
      } else if (err) {
        return res.status(err.statusCode || 400).json({
          success: false,
          error: err.message || 'File upload failed.'
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No PDF file was uploaded. Please attach a file.'
        });
      }

      next();
    });
  };
};

export default uploadSinglePdf;
