import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const BCRYPT_ROUNDS = 12;

export async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

export function signToken(user, { secret, expiresIn = '7d' }) {
  return jwt.sign({ sub: String(user.id), email: user.email }, secret, { expiresIn });
}

export function verifyToken(token, { secret }) {
  try {
    const payload = jwt.verify(token, secret);
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId <= 0) return null;
    return { userId, email: payload.email };
  } catch {
    return null;
  }
}

/**
 * Express middleware: requires a valid bearer token and sets req.userId.
 * User identity always comes from the signed token, never from the request body.
 */
export function requireAuth({ secret }) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    const payload = verifyToken(token, { secret });
    if (!payload) return res.status(401).json({ error: 'invalid_token' });
    req.userId = payload.userId;
    return next();
  };
}
