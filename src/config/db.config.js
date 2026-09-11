import mongoose from "mongoose";
import bcrypt from "bcrypt";
import UserModel from "../models/user.model.js";
import AdminModel from "../models/admin.model.js";
async function connectionDb() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing from .env");
    }
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 60000,
      family: 4,
    });
    if (process.env.SUPERADMIN_EMAIL && process.env.SUPERADMIN_PASSWORD) {
      const email = process.env.SUPERADMIN_EMAIL.trim().toLowerCase();
      const password = process.env.SUPERADMIN_PASSWORD;
      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ||
        password.length < 8
      ) {
        throw new Error("SUPERADMIN_EMAIL or SUPERADMIN_PASSWORD is invalid");
      }
      const existing = await AdminModel.findOne({ email }).select("+password");
      if (!existing) {
        await AdminModel.create({
          email,
          name: process.env.SUPERADMIN_NAME || "FoundMet Superadmin",
          password: await bcrypt.hash(password, 12),
          isBlocked: false,
          role: "SUPER_ADMIN",
        });
        console.log(
          "Superadmin account created from environment configuration.",
        );
      } else {
        const passwordMatches = existing.password ? await bcrypt.compare(password, existing.password) : false;
        const updates = {
          name: process.env.SUPERADMIN_NAME || existing.name || "FoundMet Superadmin",
          isBlocked: false,
          role: existing.role || "SUPER_ADMIN",
        };
        if (!passwordMatches) updates.password = await bcrypt.hash(password, 12);
        await AdminModel.updateOne({ _id: existing._id }, { $set: updates });
        console.log("Superadmin account synchronized from environment configuration.");
      }
    }
    console.log("MongoDb Connected");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    throw error;
  }
}
export default connectionDb;
