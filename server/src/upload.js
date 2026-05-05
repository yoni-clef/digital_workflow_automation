import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from './auth.js';
import { addAttachmentToRequest, getRequestById } from './store.js';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const router = express.Router();

router.post('/requests/:id/attachments', authenticate, upload.single('file'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'INVALID_ID' });

    if (!req.file) {
      return res.status(400).json({ error: 'NO_FILE_UPLOADED' });
    }

    // Verify user can view the request (and thus add attachments)
    const request = await getRequestById(id, { user: req.user });
    if (!request) {
      // Remove the uploaded file if request is invalid
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'NOT_FOUND_OR_FORBIDDEN' });
    }

    const attachment = await addAttachmentToRequest({
      requestId: id,
      filename: req.file.filename,
      path: req.file.path,
      mimetype: req.file.mimetype,
      sizeBytes: req.file.size
    });

    res.status(201).json({ attachment });
  } catch (err) {
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
    next(err);
  }
});

export default router;
