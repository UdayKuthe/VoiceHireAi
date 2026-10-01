import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. No authentication token provided.'
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. Malformed authorization header.'
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Session expired. Please log in again.'
        });
      }
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication token.'
      });
    }

    const user = await User.findById(decoded.id).select('+activeSessionToken');
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User account not found or has been removed.'
      });
    }

    // Invalidate sessions terminated by server restart or previous sign out
    if (!user.isLoggedIn || user.activeSessionToken !== token) {
      return res.status(401).json({
        success: false,
        error: 'Session expired or invalidated by server restart. Please log in again.'
      });
    }

    // Refresh lastActiveAt periodically (at most once every 15s to keep overhead minimal)
    const now = Date.now();
    const lastActive = user.lastActiveAt ? new Date(user.lastActiveAt).getTime() : 0;
    if (now - lastActive > 15000) {
      User.updateOne(
        { _id: user._id },
        { lastActiveAt: new Date(now) }
      ).catch(() => {});
      user.lastActiveAt = new Date(now);
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Authentication failed: ${error.message}`
    });
  }
};

export const requireRole = (allowedRoles) => {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required prior to role verification.'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: Access restricted to ${roles.join(' or ')} accounts only. Current role: ${req.user.role}`
      });
    }

    next();
  };
};
