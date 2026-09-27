import UserModel from "../models/user.model.js";
import jwt from "jsonwebtoken";
import uploadFile from "../utils/imagekit.utils.js";
import bcrypt from "bcrypt";
import crypto from "crypto";
import {
  boundingBoxFilter,
  coordinatesFromAddress,
  distanceKm,
  DISTANCE_FILTERS,
  publicLocation,
} from "../utils/geo.js";
import { sendError, sendSuccess } from "../utils/http.js";
import { logError, logInfo } from "../utils/logger.js";
import { validateCreateUserInput } from "../utils/registrationValidation.js";
import {
  sendWelcomeEmail,
  sendVerificationEmail,
  getAppUrl,
} from "../utils/mailer.js";
import { purgeUserById } from "../utils/purge-user.js";

const usesCrossSiteCookies =
  process.env.NODE_ENV === "production" ||
  (process.env.FRONTEND_URL || "")
    .split(",")
    .some((origin) => /^https:\/\//i.test(origin.trim()));

export const authCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
};

const getAccessSecret = () => {
  if (!process.env.ACCESS_TOKEN_SECRET) {
    throw new Error("ACCESS_TOKEN_SECRET is not configured");
  }
  return process.env.ACCESS_TOKEN_SECRET;
};

const issueSession = (user) =>
  jwt.sign(
    {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    getAccessSecret(),
    { expiresIn: "7d" },
  );

const sessionUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  matchRole: user.matchRole,
  canBring: user.canBring,
  buildType: user.buildType,
  commitment: user.commitment,
  hasProject: user.hasProject,
  projectDetails: user.projectDetails,
  projectLink: user.projectLink,
  projectStatus: user.projectStatus,
  lookingFor: user.lookingFor,
  address: user.address,
  location: publicLocation(user.location, user.address),
  photo: user.photo,
  phoneNumber: user.phoneNumber,
  allowPhoneRequest: user.allowPhoneRequest,
  discoverableNearby: user.discoverableNearby,
  subscriptionStatus: user.subscriptionStatus || "free",
  subscriptionPlan: user.subscriptionPlan || "free",
  congratulations: user.congratulations,
  isVerified: Boolean(user.isVerified),
  createdAt: user.createdAt,
});

function toPublicFounder(user, viewerLat, viewerLng) {
  const dist =
    Number.isFinite(viewerLat) &&
    Number.isFinite(viewerLng) &&
    user.location?.lat &&
    user.location?.lng
      ? distanceKm(viewerLat, viewerLng, user.location.lat, user.location.lng)
      : null;
  return {
    _id: user._id,
    name: user.name,
    role: user.role,
    matchRole: user.matchRole,
    canBring: user.canBring,
    buildType: user.buildType,
    commitment: user.commitment,
    hasProject: user.hasProject,
    projectDetails: user.projectDetails,
    projectLink: user.projectLink,
    projectStatus: user.projectStatus,
    lookingFor: user.lookingFor,
    photo: user.photo,
    createdAt: user.createdAt,
    address: user.address || "",
    location: publicLocation(user.location, user.address),
    distanceKm: dist,
    isVerified: Boolean(user.isVerified),
    verified: Boolean(user.isVerified),
  };
}

export async function createUser(req, res) {
  try {
    const {
      email,
      name,
      password,
      role,
      hasProject,
      projectDetails,
      projectLink,
      projectStatus,
      lookingFor,
      address,
      latitude,
      longitude,
      matchRole,
      canBring,
      buildType,
      commitment,
    } = req.body;

    // Validate request data
    const validation = validateCreateUserInput({
      email,
      name,
      password,
      hasProject,
      projectDetails,
      imageProvided: Boolean(req.file),
    });

    if (!validation.valid) {
      logInfo("registration_validation_failed", {
        email: validation.normalizedEmail,
        issues: validation.issues,
      });

      return sendError(
        res,
        400,
        validation.message,
        "VALIDATION_ERROR",
      );
    }

    const normalizedEmail = validation.normalizedEmail;
    const normalizedName = validation.normalizedName;

    // Extra image validation
    if (!req.file?.buffer) {
      return sendError(
        res,
        400,
        "Profile photo is required.",
        "IMAGE_REQUIRED",
      );
    }

    // Check duplicate email
    const isUserExists = await UserModel.exists({
      email: normalizedEmail,
    });

    if (isUserExists) {
      logInfo("registration_duplicate_email", {
        email: normalizedEmail,
      });

      return sendError(
        res,
        409,
        "An account with this email already exists.",
        "DUPLICATE_ACCOUNT",
      );
    }

    // Upload profile photo
    let photoUrl;

    try {
      const result = await uploadFile(req.file.buffer);
      photoUrl = result?.url;
    } catch (uploadErr) {
      logError("registration_image_upload", uploadErr, {
        email: normalizedEmail,
      });

      return sendError(
        res,
        502,
        "Profile photo upload failed. Please try again.",
        "IMAGE_UPLOAD_FAILED",
      );
    }

    if (!photoUrl) {
      logError(
        "registration_image_upload",
        new Error("Image upload returned no URL"),
        {
          email: normalizedEmail,
        },
      );

      return sendError(
        res,
        502,
        "Profile photo upload failed. Please try again.",
        "IMAGE_UPLOAD_FAILED",
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Validate project status
    let validProjectStatus;

    if (
      hasProject === "yes" &&
      ["idea", "development", "execution"].includes(projectStatus)
    ) {
      validProjectStatus = projectStatus;
    }

    // Format lookingFor
    let formattedLookingFor = [];

    if (Array.isArray(lookingFor)) {
      formattedLookingFor = lookingFor.filter((item) =>
        ["cto", "ceo", "cfo"].includes(item),
      );
    } else if (
      typeof lookingFor === "string" &&
      ["cto", "ceo", "cfo"].includes(lookingFor)
    ) {
      formattedLookingFor = [lookingFor];
    }

    // Format canBring
    const allowedStrengths = [
      "technology",
      "business",
      "design",
      "marketing",
      "product",
      "other",
    ];

    const formattedCanBring = (
      Array.isArray(canBring) ? canBring : [canBring]
    ).filter((item) => allowedStrengths.includes(item));

    // Calculate location safely
    const userLocation = coordinatesFromAddress(address, {
      latitude,
      longitude,
    });

    // Generate email verification token (24-hour expiry)
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Create user
    const user = await UserModel.create({
      email: normalizedEmail,
      name: normalizedName,
      password: hashedPassword,

      role: ["founder", "co-founder"].includes(role)
        ? role
        : "founder",

      hasProject: hasProject === "yes" ? "yes" : "no",

      projectDetails:
        hasProject === "yes" && typeof projectDetails === "string"
          ? projectDetails.trim()
          : undefined,

      projectLink:
        hasProject === "yes" && typeof projectLink === "string"
          ? projectLink.trim()
          : undefined,

      projectStatus: validProjectStatus,
      lookingFor: formattedLookingFor,

      address:
        typeof address === "string" && address.trim()
          ? address.trim()
          : undefined,

      location: userLocation,

      matchRole: ["co-founder", "builder"].includes(matchRole)
        ? matchRole
        : "co-founder",

      canBring: formattedCanBring,

      buildType: [
        "startup",
        "product",
        "business",
        "not-sure",
      ].includes(buildType)
        ? buildType
        : "not-sure",

      commitment: [
        "full-time",
        "part-time",
        "exploring",
      ].includes(commitment)
        ? commitment
        : "exploring",

      photo: photoUrl,
      isVerified: false,
      verificationToken,
      verificationTokenExpires,
    });

    logInfo("registration_created", {
      userId: String(user._id),
      email: user.email,
      hasPhoto: Boolean(user.photo),
      isVerified: false,
    });

    // Send verification email in the background without blocking response
    const appUrl = getAppUrl(req);
    const verificationUrl = `${appUrl}/verify-email?token=${verificationToken}`;

    await sendVerificationEmail({
      email: user.email,
      name: user.name,
      verificationUrl,
    }).catch((emailError) => {
      logError("verification_email", emailError, {
        email: user.email,
      });
    });

    // Prepare safe user response once
    const safeUser = sessionUser(user);

    // Return immediately informing user to verify their email
    return res.status(201).json({
      success: true,
      message:
        "User account created successfully! Please check your email and click the verification link before logging in.",
      data: {
        user: safeUser,
        isVerified: false,
        email: user.email,
      },
      user: safeUser,
      isVerified: false,
      email: user.email,
    });
  } catch (error) {
    logError("create_user", error);

    if (error?.code === 11000) {
      return sendError(
        res,
        409,
        "An account with this email already exists.",
        "DUPLICATE_ACCOUNT",
      );
    }

    if (
      error?.name === "MongooseServerSelectionError" ||
      error?.name === "MongoNetworkError"
    ) {
      return sendError(
        res,
        503,
        "Registration service is temporarily unavailable. Please try again shortly.",
        "SERVICE_UNAVAILABLE",
      );
    }

    return sendError(
      res,
      500,
      "Unable to create your account right now. Please try again.",
      "INTERNAL_ERROR",
    );
  }
}
async function allUsers(req, res) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 20),
    );
    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim().slice(0, 80)
        : "";
    const skill =
      typeof req.query.skill === "string"
        ? req.query.skill.trim().toLowerCase()
        : "";
    const role =
      typeof req.query.role === "string"
        ? req.query.role.trim().toLowerCase()
        : "";
    const stage =
      typeof req.query.stage === "string"
        ? req.query.stage.trim().toLowerCase()
        : "";
    const filter = {
      isSuperAdmin: { $ne: true },
      discoverableNearby: true,
      hiddenFromFeed: { $ne: true },
      isBlocked: { $ne: true },
      isDeleted: { $ne: true },
      accountStatus: { $nin: ["banned", "suspended"] },
    };
    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { name: { $regex: safeSearch, $options: "i" } },
        { role: { $regex: safeSearch, $options: "i" } },
        { projectDetails: { $regex: safeSearch, $options: "i" } },
        { address: { $regex: safeSearch, $options: "i" } },
        { "location.city": { $regex: safeSearch, $options: "i" } },
      ];
    }
    const lat = Number.parseFloat(req.query.lat);
    const lng = Number.parseFloat(req.query.lng);
    let radiusKm = Number.parseInt(req.query.radiusKm, 10);
    if (!DISTANCE_FILTERS.includes(radiusKm)) radiusKm = Number.NaN;
    const city =
      typeof req.query.city === "string"
        ? req.query.city.trim().slice(0, 80)
        : "";
    const state =
      typeof req.query.state === "string"
        ? req.query.state.trim().slice(0, 80)
        : "";
    const country =
      typeof req.query.country === "string"
        ? req.query.country.trim().slice(0, 80)
        : "";
    if (city)
      filter["location.city"] = {
        $regex: city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        $options: "i",
      };
    if (state)
      filter["location.state"] = {
        $regex: state.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        $options: "i",
      };
    if (country)
      filter["location.country"] = {
        $regex: country.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        $options: "i",
      };
    if (["founder", "co-founder"].includes(role)) filter.role = role;
    if (["idea", "development", "execution"].includes(stage))
      filter.projectStatus = stage;
    if (skill) filter.canBring = skill;

   
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Number.isFinite(radiusKm)
    ) {
      const geoFilter = boundingBoxFilter(lat, lng, radiusKm);
      const { $or: geoOr, ...geoRest } = geoFilter;
      Object.assign(filter, geoRest);
      if (geoOr) {
        const clauses = [{ $or: geoOr }];
        if (filter.$or) {
          clauses.unshift({ $or: filter.$or });
          delete filter.$or;
        }
        filter.$and = [...(filter.$and || []), ...clauses];
      }
    }

    const users = await UserModel.find(filter)
      .select(
        "name role matchRole canBring buildType commitment hasProject projectDetails projectLink projectStatus lookingFor address photo location createdAt isVerified",
      )
      .sort({ createdAt: -1 })
      .limit(400)
      .lean();

    const withDistance = users
      .map((user) => toPublicFounder(user, lat, lng))
      .filter(
        (user) =>
          !Number.isFinite(radiusKm) ||
          user.distanceKm === null ||
          user.distanceKm <= radiusKm,
      );

    const total = withDistance.length;
    const paged = withDistance.slice((page - 1) * limit, page * limit);

    return res.status(200).json({
      success: true,
      message: "Founders loaded",
      count: paged.length,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
      users: paged,
      data: { users: paged, page, limit, total },
    });
  } catch (error) {
    logError("feed", error);
    return sendError(
      res,
      500,
      "Unable to load founders right now. Please try again.",
      "INTERNAL_ERROR",
    );
  }
}

async function loginUser(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return sendError(
        res,
        400,
        "Email and password are required",
        "VALIDATION_ERROR",
      );
    }
    const normalizedEmail =
      typeof email === "string" ? email.trim().toLowerCase() : "";
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedEmail) ||
      typeof password !== "string" ||
      !password ||
      password.length > 256
    ) {
      return sendError(
        res,
        401,
        "Invalid email or password",
        "INVALID_CREDENTIALS",
      );
    }

    const user = await UserModel.findOne({ email: normalizedEmail })
      .select("+password")
      .lean();

    if (!user) {
      return sendError(
        res,
        401,
        "Invalid email or password",
        "INVALID_CREDENTIALS",
      );
    }
    if (user.isDeleted) {
      return sendError(
        res,
        403,
        "This account is no longer available.",
        "ACCOUNT_UNAVAILABLE",
      );
    }
    if (user.isBlocked || user.accountStatus === "banned") {
      return sendError(
        res,
        403,
        "This account has been blocked. Contact FoundMet support.",
        "ACCOUNT_BANNED",
      );
    }
    if (user.accountStatus === "suspended") {
      return sendError(
        res,
        403,
        "This account is suspended. Contact FoundMet support.",
        "ACCOUNT_SUSPENDED",
      );
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return sendError(
        res,
        401,
        "Invalid email or password",
        "INVALID_CREDENTIALS",
      );
    }

    // Require email verification before logging in
    if (user.isVerified === false) {
      return sendError(
        res,
        403,
        "Please verify your email address before logging in. Check your inbox for the verification link.",
        "EMAIL_NOT_VERIFIED",
      );
    }

    await UserModel.updateOne(
      { _id: user._id },
      { $set: { lastLogin: new Date() } },
    );
    const accessToken = issueSession(user);
    res.cookie("accessToken", accessToken, authCookieOptions);

    return res.status(200).json({
      success: true,
      message: "Logged in successfully",
      data: { user: sessionUser(user), accessToken },
      user: sessionUser(user),
      accessToken,
    });
  } catch (error) {
    logError("login", error);
    if (
      error?.name === "MongooseServerSelectionError" ||
      error?.name === "MongoNetworkError"
    ) {
      return sendError(
        res,
        503,
        "Login service is temporarily unavailable. Please try again shortly.",
        "SERVICE_UNAVAILABLE",
      );
    }
    return sendError(
      res,
      500,
      "Unable to sign in right now. Please try again.",
      "INTERNAL_ERROR",
    );
  }
}

function logoutUser(req, res) {
  res.clearCookie("accessToken", {
    httpOnly: true,
    secure: usesCrossSiteCookies,
    sameSite: usesCrossSiteCookies ? "none" : "lax",
    path: "/",
  });
  return sendSuccess(res, "Logged out successfully");
}

async function getMe(req, res) {
  try {
    const user = await UserModel.findById(req.user._id)
      .select(
        "name email role matchRole canBring buildType commitment hasProject projectDetails projectLink projectStatus lookingFor address location phoneNumber allowPhoneRequest discoverableNearby photo congratulations createdAt warnings subscriptionStatus subscriptionPlan isVerified",
      )
      .lean();

    if (!user) {
      return sendError(res, 404, "User not found", "NOT_FOUND");
    }

    return res.status(200).json({
      success: true,
      message: "Session loaded",
      data: { user: sessionUser(user) },
      user: sessionUser(user),
    });
  } catch (error) {
    logError("get_me", error);
    return sendError(
      res,
      500,
      "Unable to load your profile right now.",
      "INTERNAL_ERROR",
    );
  }
}

async function updateMe(req, res) {
  const allowed = [
    "name",
    "address",
    "phoneNumber",
    "role",
    "matchRole",
    "canBring",
    "buildType",
    "commitment",
    "projectDetails",
    "projectLink",
    "projectStatus",
    "hasProject",
    "allowPhoneRequest",
    "discoverableNearby",
  ];
  const updates = Object.fromEntries(
    Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)),
  );
  if (typeof updates.name === "string") updates.name = updates.name.trim();
  if (typeof updates.address === "string") {
    updates.address = updates.address.trim();
    updates.location = coordinatesFromAddress(updates.address, {
      latitude: req.body?.latitude,
      longitude: req.body?.longitude,
    });
  }
  if (typeof updates.projectDetails === "string")
    updates.projectDetails = updates.projectDetails.trim();
  if (typeof updates.projectLink === "string")
    updates.projectLink = updates.projectLink.trim();
  if (updates.name !== undefined && String(updates.name).trim().length < 2) {
    return sendError(
      res,
      400,
      "Name must be at least 2 characters.",
      "VALIDATION_ERROR",
    );
  }
  const user = await UserModel.findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true,
  }).select(
    "name email role matchRole canBring buildType commitment hasProject projectDetails projectLink projectStatus lookingFor address location phoneNumber allowPhoneRequest discoverableNearby photo congratulations createdAt isVerified",
  );
  if (!user) return sendError(res, 404, "User not found", "NOT_FOUND");
  return res.json({
    success: true,
    message: "Profile updated",
    data: { user: sessionUser(user) },
    user: sessionUser(user),
  });
}

/**
 * Verify user email via token
 * GET /auth/verify-email?token=xxx
 * POST /auth/verify-email { token: "xxx" }
 */
async function verifyEmail(req, res) {
  try {
    const token =
      typeof req.query.token === "string"
        ? req.query.token.trim()
        : typeof req.body?.token === "string"
          ? req.body.token.trim()
          : "";

    if (!token) {
      return sendError(
        res,
        400,
        "Verification token is required.",
        "VALIDATION_ERROR",
      );
    }

    const user = await UserModel.findOne({
      verificationToken: token,
      verificationTokenExpires: { $gt: new Date() },
    });

    if (!user) {
      // Check if user is already verified with this token cleared
      return sendError(
        res,
        400,
        "This verification link is invalid or has expired. Please request a new verification email.",
        "INVALID_TOKEN",
      );
    }

    user.isVerified = true;
    user.verificationToken = null;
    user.verificationTokenExpires = null;
    await user.save();

    // Send welcome email after successful verification
    sendWelcomeEmail({
      email: user.email,
      name: user.name,
    }).catch((emailError) => {
      logError("welcome_email_post_verify", emailError, {
        email: user.email,
      });
    });

    logInfo("email_verified", {
      userId: String(user._id),
      email: user.email,
    });

    return sendSuccess(res, "Email verified successfully! You can now log in.", {
      email: user.email,
      isVerified: true,
    });
  } catch (error) {
    logError("verify_email", error);
    return sendError(
      res,
      500,
      "Unable to verify your email right now. Please try again.",
      "INTERNAL_ERROR",
    );
  }
}

/**
 * Resend verification email
 * POST /auth/resend-verification { email: "user@example.com" }
 */
async function resendVerificationEmail(req, res) {
  try {
    const rawEmail = req.body?.email;
    const email =
      typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return sendError(
        res,
        400,
        "Please provide a valid email address.",
        "VALIDATION_ERROR",
      );
    }

    const user = await UserModel.findOne({ email });
    if (!user) {
      return sendError(
        res,
        404,
        "No account was found with that email address.",
        "NOT_FOUND",
      );
    }

    if (user.isVerified) {
      return sendError(
        res,
        400,
        "This account is already verified. You can log in directly.",
        "ALREADY_VERIFIED",
      );
    }

    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    user.verificationToken = verificationToken;
    user.verificationTokenExpires = verificationTokenExpires;
    await user.save();

    const appUrl = getAppUrl(req);
    const verificationUrl = `${appUrl}/verify-email?token=${verificationToken}`;

    sendVerificationEmail({
      email: user.email,
      name: user.name,
      verificationUrl,
    }).catch((emailError) => {
      logError("resend_verification_email", emailError, {
        email: user.email,
      });
    });

    logInfo("verification_email_resent", {
      userId: String(user._id),
      email: user.email,
    });

    return sendSuccess(
      res,
      "A new verification email has been sent. Please check your inbox.",
    );
  } catch (error) {
    logError("resend_verification", error);
    return sendError(
      res,
      500,
      "Unable to resend verification email right now. Please try again.",
      "INTERNAL_ERROR",
    );
  }
}

/**
 * Delete current user account with full cleanup
 * DELETE /auth/me or DELETE /auth/delete-me
 */
async function deleteMe(req, res) {
  try {
    const userId = req.user._id;
    const user = await purgeUserById(userId);

    if (!user) {
      return sendError(res, 404, "User not found", "NOT_FOUND");
    }

    res.clearCookie("accessToken", authCookieOptions);

    logInfo("account_deleted", {
      userId: String(userId),
      email: user.email,
    });

    return res.status(200).json({
      success: true,
      message: "Your account and all associated data have been permanently deleted.",
    });
  } catch (error) {
    logError("delete_me", error);
    return sendError(
      res,
      500,
      "Unable to delete your account right now. Please try again.",
      "INTERNAL_ERROR",
    );
  }
}

export {
  allUsers,
  loginUser,
  logoutUser,
  getMe,
  updateMe,
  deleteMe,
  verifyEmail,
  resendVerificationEmail,
};
