import jwt from 'jsonwebtoken';

export function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  // Authorization header must exist and start with "Bearer "
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No token provided. Please log in.',
    });
  }

  const token = authHeader.split(' ')[1]; // Extract the token after "Bearer "

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(403).json({
        success: false,
        message: 'Session expired. Please log in again.',
      });
    }
    // JsonWebTokenError, NotBeforeError, or any other verification failure
    return res.status(401).json({
      success: false,
      message: 'Invalid token. Please log in again.',
    });
  }
}

export function requireVerified(req, res, next) {
  if (!req.user?.isVerified) {
    return res.status(403).json({
      success: false,
      code: 'EMAIL_NOT_VERIFIED',
      message: 'Please verify your email address before accessing the dashboard.',
    });
  }
  next();
}