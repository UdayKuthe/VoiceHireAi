import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/\S+@\S+\.\S+/, 'Please provide a valid email address']
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false // Excluded by default from queries
    },
    role: {
      type: String,
      enum: {
        values: ['RECRUITER', 'CANDIDATE'],
        message: 'Role must be either RECRUITER or CANDIDATE'
      },
      required: [true, 'Role is required']
    },
    resetToken: {
      type: String,
      select: false
    },
    resetTokenExpiry: {
      type: Date,
      select: false
    },
    activeSessionToken: {
      type: String,
      select: false
    },
    isLoggedIn: {
      type: Boolean,
      default: false
    },
    lastActiveAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
);

// Method to verify password
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.passwordHash);
};

// Ensure passwordHash and reset tokens are never exposed in toJSON / toObject
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.resetToken;
    delete ret.resetTokenExpiry;
    delete ret.activeSessionToken;
    delete ret.__v;
    return ret;
  }
});

userSchema.set('toObject', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.resetToken;
    delete ret.resetTokenExpiry;
    delete ret.activeSessionToken;
    delete ret.__v;
    return ret;
  }
});

export const User = mongoose.model('User', userSchema);
export default User;
