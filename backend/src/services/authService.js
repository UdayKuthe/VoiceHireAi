import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';

export class AuthService {
  static generateToken(user) {
    return jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: user.role
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );
  }

  static async register({ name, email, password, role }) {
    if (!name || !email || !password || !role) {
      const error = new Error('Name, email, password, and role are required fields.');
      error.statusCode = 400;
      throw error;
    }

    if (!['RECRUITER', 'CANDIDATE'].includes(role)) {
      const error = new Error('Role must be either RECRUITER or CANDIDATE.');
      error.statusCode = 400;
      throw error;
    }

    if (password.length < 6) {
      const error = new Error('Password must be at least 6 characters long.');
      error.statusCode = 400;
      throw error;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      const error = new Error(`An account with email "${normalizedEmail}" already exists.`);
      error.statusCode = 409;
      throw error;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role
    });

    const token = this.generateToken(user);
    return { token, user: user.toJSON() };
  }

  static async login({ email, password }) {
    if (!email || !password) {
      const error = new Error('Both email and password are required.');
      error.statusCode = 400;
      throw error;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
    if (!user) {
      const error = new Error('Invalid email or password.');
      error.statusCode = 401;
      throw error;
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      const error = new Error('Invalid email or password.');
      error.statusCode = 401;
      throw error;
    }

    const token = this.generateToken(user);
    return { token, user: user.toJSON() };
  }

  static async forgotPassword(email) {
    if (!email) {
      const error = new Error('Email is required to request a password reset.');
      error.statusCode = 400;
      throw error;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      const error = new Error(`No account found with email address: ${normalizedEmail}`);
      error.statusCode = 404;
      throw error;
    }

    // Generate secure random token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetToken = resetToken;
    user.resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour validity
    await user.save();

    // Log to console as required by PRD
    console.log('\n======================================================');
    console.log(`[PASSWORD RESET REQUEST] User: ${normalizedEmail}`);
    console.log(`[RESET TOKEN]: ${resetToken}`);
    console.log(`[RESET URL EXAMPLE]: /reset-password?token=${resetToken}`);
    console.log('======================================================\n');

    return {
      message: 'Password reset token generated successfully. Please check the server console.'
    };
  }

  static async resetPassword({ token, newPassword }) {
    if (!token || !newPassword) {
      const error = new Error('Reset token and new password are required.');
      error.statusCode = 400;
      throw error;
    }

    if (newPassword.length < 6) {
      const error = new Error('New password must be at least 6 characters long.');
      error.statusCode = 400;
      throw error;
    }

    const user = await User.findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: new Date() }
    }).select('+resetToken +resetTokenExpiry');

    if (!user) {
      const error = new Error('Password reset token is invalid or has expired.');
      error.statusCode = 400;
      throw error;
    }

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();

    return {
      message: 'Password has been reset successfully. You may now log in with your new credentials.'
    };
  }

  static async getMe(userId) {
    const user = await User.findById(userId);
    if (!user) {
      const error = new Error('User not found.');
      error.statusCode = 404;
      throw error;
    }
    return user.toJSON();
  }
}
