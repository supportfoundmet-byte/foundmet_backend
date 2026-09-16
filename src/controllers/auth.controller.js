import UserModel from "../models/user.model.js";
import jwt from "jsonwebtoken";
import uploadFile from "../utils/imagekit.utils.js";
import bcrypt from "bcrypt";
import {
  boundingBoxFilter,
  coordinatesFromAddress,
  distanceKm,
  DISTANCE_FILTERS,
  publicLocation,
} from "../utils/geo.js";
import { sendError, sendSuccess } from "../utils/http.js";
import { logError } from "../utils/logger.js";
import { isStrongPassword } from "../utils/sanitize.js";
import { sendWelcomeEmail } from "../utils/mailer.js";

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
  congratulations: user.congratulations,
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
  };
}

async function createUser(req, res) {
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

    const normalizedEmail =
      typeof email === "string" ? email.trim().toLowerCase() : "";
    const normalizedName = typeof name === "string" ? name.trim() : "";

    if (!email || !name || !password) {
      return sendError(
        res,
        400,
        "Email, name and password are required",
        "VALIDATION_ERROR",
      );
    }
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedEmail) ||
      normalizedName.length < 2 ||
      normalizedName.length > 100 ||
      !isStrongPassword(password)
    ) {
      return sendError(
        res,
        400,
        "Use a valid email and a password with at least 8 characters, including a letter and a number.",
        "VALIDATION_ERROR",
      );
    }

    const isUserExists = await UserModel.exists({ email: normalizedEmail });
    if (isUserExists) {
      return sendError(
        res,
        409,
        "An account with this email already exists.",
        "DUPLICATE_ACCOUNT",
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    let photoUrl = null;
    if (req.file) {
      try {
        const result = await uploadFile(req.file.buffer);
        photoUrl = result?.url || null;
      } catch (uploadErr) {
        console.warn("Image upload warning:", uploadErr?.message || uploadErr);
      }
    }

    let validProjectStatus = undefined;
    if (
      hasProject === "yes" &&
      ["idea", "development", "execution"].includes(projectStatus)
    ) {
      validProjectStatus = projectStatus;
    }

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

    const user = await UserModel.create({
      email: normalizedEmail,
      name: normalizedName,
      password: hashedPassword,
      role: ["founder", "co-founder"].includes(role) ? role : "founder",
      hasProject: hasProject === "yes" ? "yes" : "no",
      projectDetails:
        hasProject === "yes" && projectDetails
          ? projectDetails.trim()
          : undefined,
      projectLink:
        hasProject === "yes" && projectLink ? projectLink.trim() : undefined,
      projectStatus: validProjectStatus,
      lookingFor: formattedLookingFor,
      address: address ? address.trim() : undefined,
      location: coordinatesFromAddress(address, { latitude, longitude }),
      matchRole: ["co-founder", "builder"].includes(matchRole)
        ? matchRole
        : "co-founder",
      canBring: formattedCanBring,
      buildType: ["startup", "product", "business", "not-sure"].includes(
        buildType,
      )
        ? buildType
        : "not-sure",
      commitment: ["full-time", "part-time", "exploring"].includes(commitment)
        ? commitment
        : "exploring",
      photo: photoUrl,
    });

    const accessToken = issueSession(user);
    res.cookie("accessToken", accessToken, authCookieOptions);

    try {
      await sendWelcomeEmail({ email: user.email, name: user.name });
    } catch (emailError) {
      logError("welcome_email", emailError, { email: user.email });
    }

    return res.status(201).json({
      success: true,
      message: "User account created successfully",
      data: { user: sessionUser(user), accessToken },
      user: sessionUser(user),
      accessToken,
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

    // Merge the radius/bounding-box constraint in defensively: if it ever
    // produces its own `$or` (e.g. a util that wraps the antimeridian as
    // two alternative ranges), a plain Object.assign would silently
    // overwrite the search `$or` above and drop the person's search term
    // from the query with no error. Combine them with `$and` instead so
    // both constraints always apply together.
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
        "name role matchRole canBring buildType commitment hasProject projectDetails projectLink projectStatus lookingFor address photo location createdAt",
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
        "name email role matchRole canBring buildType commitment hasProject projectDetails projectLink projectStatus lookingFor address location phoneNumber allowPhoneRequest discoverableNearby photo congratulations createdAt warnings",
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
    "name email role matchRole canBring buildType commitment hasProject projectDetails projectLink projectStatus lookingFor address location phoneNumber allowPhoneRequest discoverableNearby photo congratulations createdAt",
  );
  if (!user) return sendError(res, 404, "User not found", "NOT_FOUND");
  return res.json({
    success: true,
    message: "Profile updated",
    data: { user: sessionUser(user) },
    user: sessionUser(user),
  });
}

export { createUser, allUsers, loginUser, logoutUser, getMe, updateMe };
