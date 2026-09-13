import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    // Authentication
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },

    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 8,
      select: false,
    },

    // Founder role
    role: {
      type: String,
      enum: ["founder", "co-founder"],
      default: "founder",
    },
    matchRole: {
      type: String,
      enum: ["co-founder", "builder"],
      default: "co-founder",
    },
    canBring: [
      {
        type: String,
        enum: [
          "technology",
          "business",
          "design",
          "marketing",
          "product",
          "other",
        ],
      },
    ],
    buildType: {
      type: String,
      enum: ["startup", "product", "business", "not-sure"],
      default: "not-sure",
    },
    commitment: {
      type: String,
      enum: ["full-time", "part-time", "exploring"],
      default: "exploring",
    },

    // Project information
    hasProject: {
      type: String,
      enum: ["yes", "no"],
      default: "no",
    },

    projectDetails: {
      type: String,
      trim: true,
      maxlength: 2000,
    },

    projectLink: {
      type: String,
      trim: true,
    },

    projectStatus: {
      type: String,
      enum: ["idea", "development", "execution"],
    },

    // Looking for team members
    lookingFor: [
      {
        type: String,
        enum: ["cto", "ceo", "cfo"],
      },
    ],

    // Location
    address: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    phoneNumber: { type: String, trim: true, maxlength: 30 },
    allowPhoneRequest: { type: Boolean, default: true },
    discoverableNearby: { type: Boolean, default: true },
    hiddenFromFeed: { type: Boolean, default: false, index: true },
    isBlocked: { type: Boolean, default: false, index: true },
    accountStatus: {
      type: String,
      enum: ["active", "suspended", "banned"],
      default: "active",
      index: true,
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    deletionReason: { type: String, trim: true, maxlength: 500, default: "" },
    isSuspicious: { type: Boolean, default: false, index: true },
    isSpam: { type: Boolean, default: false, index: true },
    reportCount: { type: Number, default: 0, min: 0 },
    adminRole: { type: String, enum: ["none", "admin", "superadmin"], default: "none", index: true },
    blockedAt: { type: Date, default: null },
    blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    warnings: [
      {
        message: { type: String, maxlength: 500 },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    lastLogin: { type: Date, default: null },
    lastSeen: { type: Date, default: null },
    isSuperAdmin: { type: Boolean, default: false, select: false },
    congratulations: [
      {
        message: { type: String, maxlength: 500 },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    // Profile photo
    photo: {
      type: String,
      default: null,
    },
    location: {
      lat: { type: Number },
      lng: { type: Number },
      city: { type: String, trim: true, maxlength: 120 },
      state: { type: String, trim: true, maxlength: 120 },
      country: { type: String, trim: true, maxlength: 80, default: "India" },
    },
  },
  {
    timestamps: true,
  },
);

userSchema.index({ discoverableNearby: 1, hiddenFromFeed: 1, isDeleted: 1, isBlocked: 1, createdAt: -1 });
userSchema.index({ "location.city": 1, createdAt: -1 });
userSchema.index({ "location.state": 1, createdAt: -1 });
userSchema.index({ name: 1 });
userSchema.index({ accountStatus: 1, createdAt: -1 });

const UserModel = mongoose.model("User", userSchema);

export default UserModel;
