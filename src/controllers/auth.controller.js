import UserModel from "../models/user.model.js";
import jwt from "jsonwebtoken";
import uploadFile from "../utils/imagekit.utils.js";
import bcrypt from "bcrypt";
import { coordinatesFromAddress, distanceKm } from "../utils/geo.js";

const authCookieOptions = {
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
      matchRole,
      canBring,
      buildType,
      commitment,
    } = req.body;

    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const normalizedName = typeof name === "string" ? name.trim() : "";

    if (!email || !name || !password) {
      return res.status(400).json({
        message: "Email, name and password are required",
      });
    }
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedEmail) ||
      normalizedName.length < 2 ||
      normalizedName.length > 100 ||
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 128
    ) {
      return res.status(400).json({
        message: "Use a valid email and a password with at least 8 characters",
      });
    }

    // Check if user already exists
    const isUserExists = await UserModel.exists({ email: normalizedEmail });

    if (isUserExists) {
      return res.status(403).json({
        message: "User account already exists",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Upload profile photo if provided
    let photoUrl = null;

    if (req.file) {
      try {
        const result = await uploadFile(req.file.buffer);
        photoUrl = result?.url || null;
      } catch (uploadErr) {
        console.warn("Image upload warning:", uploadErr?.message || uploadErr);
      }
    }

    // Sanitize optional enum values
    let validProjectStatus = undefined;
    if (hasProject === "yes" && ["idea", "development", "execution"].includes(projectStatus)) {
      validProjectStatus = projectStatus;
    }

    let formattedLookingFor = [];
    if (Array.isArray(lookingFor)) {
      formattedLookingFor = lookingFor.filter((role) =>
        ["cto", "ceo", "cfo"].includes(role)
      );
    } else if (typeof lookingFor === "string" && ["cto", "ceo", "cfo"].includes(lookingFor)) {
      formattedLookingFor = [lookingFor];
    }
    const allowedStrengths = ["technology", "business", "design", "marketing", "product", "other"];
    const formattedCanBring = (Array.isArray(canBring) ? canBring : [canBring]).filter((item) => allowedStrengths.includes(item));

    // Create user
    const user = await UserModel.create({
      email: normalizedEmail,
      name: normalizedName,
      password: hashedPassword,
      role: ["founder", "co-founder"].includes(role) ? role : "founder",
      hasProject: hasProject === "yes" ? "yes" : "no",
      projectDetails: hasProject === "yes" && projectDetails ? projectDetails.trim() : undefined,
      projectLink: hasProject === "yes" && projectLink ? projectLink.trim() : undefined,
      projectStatus: validProjectStatus,
      lookingFor: formattedLookingFor,
      address: address ? address.trim() : undefined,
      location: coordinatesFromAddress(address),
      matchRole: ["co-founder", "builder"].includes(matchRole) ? matchRole : "co-founder",
      canBring: formattedCanBring,
      buildType: ["startup", "product", "business", "not-sure"].includes(buildType) ? buildType : "not-sure",
      commitment: ["full-time", "part-time", "exploring"].includes(commitment) ? commitment : "exploring",
      photo: photoUrl,
    });

    // Create JWT
    const accessToken = issueSession(user);
    res.cookie("accessToken", accessToken, authCookieOptions);

    return res.status(201).json({
      message: "User account created successfully",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        hasProject: user.hasProject,
        projectDetails: user.projectDetails,
        projectLink: user.projectLink,
        projectStatus: user.projectStatus,
        lookingFor: user.lookingFor,
        address: user.address,
        location: user.location,
        photo: user.photo,
      },
    });
  } catch (error) {
    console.error("Create User Error:", error);

    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: "User account already exists" });
    }

    if (error?.name === "MongooseServerSelectionError" || error?.name === "MongoNetworkError") {
      return res.status(503).json({
        success: false,
        message: "Registration service is temporarily unavailable. Please try again shortly.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to create your account right now. Please try again.",
    });
  }
}

async function allUsers(req, res) {
    try {
        const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
        const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
        const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 80) : "";
        const filter = { isSuperAdmin: { $ne: true }, discoverableNearby: true, hiddenFromFeed: { $ne: true }, isBlocked: { $ne: true } };
        if (search) {
          const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          filter.$or = [
            { name: { $regex: safeSearch, $options: "i" } },
            { role: { $regex: safeSearch, $options: "i" } },
            { projectDetails: { $regex: safeSearch, $options: "i" } },
            { address: { $regex: safeSearch, $options: "i" } },
          ];
        }
        const lat = Number.parseFloat(req.query.lat);
        const lng = Number.parseFloat(req.query.lng);
        const radiusKm = Number.parseInt(req.query.radiusKm, 10);
        const city = typeof req.query.city === "string" ? req.query.city.trim().slice(0, 80) : "";
        if (city) filter["location.city"] = { $regex: city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
        const [users, total] = await Promise.all([
          UserModel
            .find(filter)
            .select(
                "name role matchRole canBring buildType commitment hasProject projectDetails projectLink projectStatus lookingFor address photo location createdAt"
            )
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
          UserModel.countDocuments(filter),
        ]);
        const withDistance = users.map((user) => {
          const dist = Number.isFinite(lat) && Number.isFinite(lng) && user.location?.lat && user.location?.lng
            ? distanceKm(lat, lng, user.location.lat, user.location.lng)
            : null;
          return { ...user, distanceKm: dist };
        }).filter((user) => !Number.isFinite(radiusKm) || user.distanceKm === null || user.distanceKm <= radiusKm);

        return res.status(200).json({
            success: true,
            count: withDistance.length,
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
            users: withDistance
        });

    } catch (error) {
        console.error("Feed Error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error."
        });
    }
}

async function loginUser(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedEmail) || typeof password !== "string" || password.length < 8 || password.length > 128) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = await UserModel.findOne({ email: normalizedEmail }).select("+password").lean();

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }
    if (user.isBlocked) {
      return res.status(403).json({ success: false, message: "This account has been blocked. Contact FoundMet support." });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    await UserModel.updateOne({ _id: user._id }, { $set: { lastLogin: new Date() } });
    const accessToken = issueSession(user);
    res.cookie("accessToken", accessToken, authCookieOptions);

    return res.status(200).json({
      message: "Logged in successfully",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        hasProject: user.hasProject,
        projectDetails: user.projectDetails,
        projectLink: user.projectLink,
        projectStatus: user.projectStatus,
        lookingFor: user.lookingFor,
        address: user.address,
        location: user.location,
        photo: user.photo,
        phoneNumber: user.phoneNumber,
        allowPhoneRequest: user.allowPhoneRequest,
        discoverableNearby: user.discoverableNearby,
      },
    });
  } catch (error) {
    console.error("Login Error:", error);

    if (error?.name === "MongooseServerSelectionError" || error?.name === "MongoNetworkError") {
      return res.status(503).json({
        success: false,
        message: "Login service is temporarily unavailable. Please try again shortly.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to sign in right now. Please try again.",
    });
  }

}

function logoutUser(req, res) {
  res.clearCookie("accessToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
  });
  return res.status(200).json({ success: true });
}

async function getMe(req, res) {
  try {
    const user = await UserModel.findById(req.user._id).select(
      "name email role matchRole canBring buildType commitment hasProject projectDetails projectLink projectStatus lookingFor address location phoneNumber allowPhoneRequest discoverableNearby photo congratulations createdAt"
    ).lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("GetMe Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
}

async function updateMe(req, res) {
  const allowed = ["name", "address", "phoneNumber", "role", "matchRole", "canBring", "buildType", "commitment", "projectDetails", "projectLink", "projectStatus", "hasProject", "allowPhoneRequest", "discoverableNearby"];
  const updates = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)));
  if (typeof updates.name === "string") updates.name = updates.name.trim();
  if (typeof updates.address === "string") {
    updates.address = updates.address.trim();
    updates.location = coordinatesFromAddress(updates.address);
  }
  if (typeof updates.projectDetails === "string") updates.projectDetails = updates.projectDetails.trim();
  if (typeof updates.projectLink === "string") updates.projectLink = updates.projectLink.trim();
  if (updates.name !== undefined && String(updates.name).trim().length < 2) {
    return res.status(400).json({ success: false, message: "Name must be at least 2 characters." });
  }
  const user = await UserModel.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true })
    .select("name email role matchRole canBring buildType commitment hasProject projectDetails projectLink projectStatus lookingFor address location phoneNumber allowPhoneRequest discoverableNearby photo");
  if (!user) return res.status(404).json({ success: false, message: "User not found" });
  return res.json({ success: true, user });
}

export { createUser, allUsers, loginUser, logoutUser, getMe, updateMe };
