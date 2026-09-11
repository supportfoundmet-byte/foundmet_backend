import mongoose from "mongoose";

const adminSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    password: { type: String, required: true, select: false },
    isBlocked: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

const adminDatabase = mongoose.connection.useDb(
  process.env.SUPERADMIN_DB_NAME || "foundmet_superadmin",
  { useCache: true },
);

const AdminModel = adminDatabase.models.Admin || adminDatabase.model("Admin", adminSchema);

export default AdminModel;
