import express, { Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import githubRoutes from './routes/github';
import scanRoutes from './routes/scans';
import authRoutes from './routes/auth';
import dashboardRoutes from './routes/dashboard';
const app = express();

app.use(cors({
    origin: 'http://51.79.165.228:5173',
    credentials: true // Important for cookies to be sent back and forth
}));
app.use(express.json());
app.use(cookieParser()); // Enable reading HttpOnly cookies

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/github', githubRoutes);
app.use('/api/v1', scanRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.get('/api/v1/health', (req: Request, res: Response) => {
    res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API listening on port ${PORT}`));