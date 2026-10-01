export const errorHandler = (err, req, res, next) => {
  console.error(`[Error] ${req.method} ${req.originalUrl}:`, err);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((val) => val.message);
    return res.status(400).json({
      success: false,
      error: messages.join('. ')
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const duplicateField = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({
      success: false,
      error: `An account with this ${duplicateField} already exists.`
    });
  }

  // Mongoose invalid ObjectId error
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: `Invalid identifier format: ${err.value}`
    });
  }

  // Default server error with specific message
  res.status(err.statusCode || 500).json({
    success: false,
    error: err.message || 'An unexpected internal server error occurred.'
  });
};
