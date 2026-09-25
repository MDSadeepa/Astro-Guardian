import express, { type Request, type Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Basic route
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Astro-Guardian API is running' });
});

// Login route
app.post('/api/login', (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ success: false, message: 'Email and password are required.' });
    return;
  }

  // Demo credential check — replace with real DB lookup + hashing
  if (email === 'admin@astro-guardian.com' && password === 'password123') {
    res.json({ success: true, message: 'Login successful', token: 'demo-jwt-token' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
