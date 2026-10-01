import { AuthService } from '../services/authService.js';

export const register = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    const result = await AuthService.register({ name, email, password, role });
    res.status(201).json({
      success: true,
      token: result.token,
      user: result.user
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await AuthService.login({ email, password });
    res.status(200).json({
      success: true,
      token: result.token,
      user: result.user
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res) => {
  // Stateless JWT: client removes token from storage
  res.status(200).json({
    success: true,
    message: 'Logged out successfully.'
  });
};

export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const result = await AuthService.forgotPassword(email);
    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    const result = await AuthService.resetPassword({ token, newPassword });
    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req, res, next) => {
  try {
    const user = await AuthService.getMe(req.user._id);
    res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    next(error);
  }
};
