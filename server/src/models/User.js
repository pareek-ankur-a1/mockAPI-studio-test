import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
    },

    //select: false, so it's never sent to clients by accident.
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },


    otpHash: {
      type: String,
      select: false,
    },

    // Default TTL is 10 minutes (set in otpHelper.js).
    otpExpiresAt: {
      type: Date,
      select: false,
    },

    // Count of incorrect OTP submissions for the current OTP.
    // After 5 failed attempts, the OTP is invalidated (requires resend).
    otpAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

//the mongoDB collection becomes users
const User = mongoose.model('User', userSchema);
export default User;
