import express from 'express';
import multer from 'multer';
import {
  createUser,
  loginUser,
  getMe,
  logoutUser,
  updateMe,
  deleteMe,
  verifyEmail,
  resendVerificationEmail,
} from '../controllers/auth.controller.js';
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

/** Email Verification */
router.get('/verify-email', verifyEmail);
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerificationEmail);

/** POST /auth/login & /auth/logout */
router.post('/login', loginUser);
router.post('/logout', logoutUser);

/** /auth/me */
router.get('/me', verifyAuth, getMe);
router.patch('/me', verifyAuth, updateMe);

/** Delete Me (Account Deletion) */
router.delete('/me', verifyAuth, deleteMe);
router.delete('/delete-me', verifyAuth, deleteMe);
router.get('/delete', verifyAuth, deleteMe);

export default router;