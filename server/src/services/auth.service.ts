import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User, IUser } from '../models/user.model';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export class AuthService {
  static async register(userData: { email: string; password: string; name: string }) {
    try {
      const existingUser = await User.findOne({ email: userData.email });
      if (existingUser) {
        throw new Error('Email already registered');
      }

      // Hash password before saving
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      const user = new User({
        ...userData,
        password: hashedPassword
      });
      await user.save();

      const token = this.generateToken(user);
      
      // Remove password from response
      const userResponse = user.toObject();
      delete userResponse.password;
      
      return { user: userResponse, token };
    } catch (error) {
      throw error;
    }
  }

  static async login(email: string, password: string) {
    try {
      const user = await User.findOne({ email });
      if (!user) {
        throw new Error('Invalid credentials');
      }

      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        throw new Error('Invalid credentials');
      }

      const token = this.generateToken(user);
      
      // Remove password from response
      const userResponse = user.toObject();
      delete userResponse.password;
      
      return { user: userResponse, token };
    } catch (error) {
      throw error;
    }
  }

  private static generateToken(user: IUser) {
    return jwt.sign(
      { 
        id: user._id,
        email: user.email
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN as any }
    );
  }
} 
