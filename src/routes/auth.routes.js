import express from 'express';
import multer from 'multer';
import { createUser, loginUser, getMe, logoutUser, updateMe } from '../controllers/auth.controller.js';
import { verifyAuth } from '../middleware/auth.middleware.js';

const router = express.Router();

/** POST /auth/create-account */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (!file.mimetype.startsWith("image/")) {
      return callback(new Error("Only image files are allowed"));
    }
    callback(null, true);
  },
});
router.post('/create-account', upload.single("image"), createUser);

/** POST /auth/login */
router.post('/login', loginUser);
router.post('/logout', logoutUser);

/** GET /auth/me */
router.get('/me', verifyAuth, getMe);
router.patch('/me', verifyAuth, updateMe);

export default router;