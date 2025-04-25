require('dotenv').config(); // Load environment variables

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const webpush = require('web-push');
const cron = require('node-cron');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Enable mongoose debug mode
mongoose.set('debug', true);

// Check required environment variables and provide defaults for development
const MONGODB_URL = process.env.MongoDB_URL || 'mongodb://localhost:27017/todo-app';
const JWT_SECRET = process.env.JWT_SECRET || 'default-development-secret';

// MongoDB Connection Configuration
mongoose.set('strictQuery', false);
let isConnected = false;

const connectDB = async () => {
    try {
        if (isConnected) return;

        console.log('Attempting to connect to MongoDB...');
        
        const conn = await mongoose.connect(MONGODB_URL, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10,
            retryWrites: true,
            w: 'majority'
        });

        isConnected = true;
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error('MongoDB connection error details:', {
            name: error.name,
            message: error.message,
            code: error.code
        });
        
        isConnected = false;
        // Retry connection after 5 seconds
        console.log('Retrying connection in 5 seconds...');
        setTimeout(connectDB, 5000);
    }
};

// Update connection monitoring
mongoose.connection.on('connected', () => {
    console.log('Mongoose connected to MongoDB');
    isConnected = true;
});

mongoose.connection.on('disconnected', () => {
    console.log('Mongoose disconnected from MongoDB');
    isConnected = false;
    setTimeout(connectDB, 5000);
});

mongoose.connection.on('error', (err) => {
    console.error('Mongoose connection error:', err);
    isConnected = false;
});

// Initial connection attempt
console.log('Starting initial MongoDB connection...');
connectDB();

// Connection status middleware
const checkConnection = (req, res, next) => {
    if (!isConnected) {
        return res.status(503).json({ 
            error: 'Database connection not ready. Please try again in a few moments.' 
        });
    }
    next();
};

// Apply middleware
app.use(cors());
app.use(express.json());
app.use(checkConnection);

// Define Schemas
const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String,
    created_at: { type: Date, default: Date.now }
}, { collection: 'users' });  // Explicitly set collection name

const taskSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    title: String,
    description: String,
    task_time: Date,
    completed: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false },
    deleted_from: String,
    created_at: { type: Date, default: Date.now },
    notified: { type: Boolean, default: false }
}, { collection: 'tasks' });  // Explicitly set collection name

const User = mongoose.model('User', userSchema);
const Task = mongoose.model('Task', taskSchema);

// VAPID Keys configuration
const VAPID_PUBLIC_KEY = 'BBRIvLnurZxFh1vMmVkiACQ8DKbelAp_Z2BsOmNYdFdnhHgyoNYaMK8fgOo12gjWIKUIx5kxYFBq73-A6ECQhSI';
const VAPID_PRIVATE_KEY = '5gdjvlHh7jG_eqQvljiSfYyu0A6eSvk-Xbe4Fb2mjLE';

webpush.setVapidDetails(
    'mailto:your-email@example.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
);

// Add subscription schema
const subscriptionSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    subscription: Object,
    created_at: { type: Date, default: Date.now }
});

const Subscription = mongoose.model('Subscription', subscriptionSchema);

// Authentication endpoints
app.post('/api/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        const existingUser = await User.findOne({ email }).maxTimeMS(20000);
        
        if (existingUser) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ name, email, password: hashedPassword });
        await user.save();
        
        res.status(201).json({ message: 'User created successfully' });
    } catch (err) {
        console.error('Signup error:', err);
        if (err.name === 'MongooseError') {
            return res.status(503).json({ 
                error: 'Database operation timed out. Please try again.' 
            });
        }
        res.status(500).json({ 
            error: 'Registration failed: ' + err.message
        });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const user = await User.findOne({ email }).maxTimeMS(20000); // Increase operation timeout
        
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        const token = jwt.sign({ userId: user._id }, JWT_SECRET); // Use env secret
        res.json({ token, name: user.name });
    } catch (err) {
        console.error('Login error:', err);
        if (err.name === 'MongooseError') {
            return res.status(503).json({ 
                error: 'Database operation timed out. Please try again.' 
            });
        }
        res.status(500).json({ error: 'Login failed: ' + err.message });
    }
});

// Add auth middleware
const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }
        const decoded = jwt.verify(token, JWT_SECRET); // Use env secret
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// Apply auth middleware to protected routes
app.post('/api/tasks', authMiddleware);
app.post('/api/subscribe', authMiddleware);

// Task endpoints (new)
app.post('/api/tasks', async (req, res) => {
    try {
        const task = new Task({
            ...req.body,
            user_id: req.user.userId // Requires auth middleware
        });
        await task.save();
        res.status(201).json(task);
    } catch (err) {
        res.status(500).json({ error: 'Error creating task' });
    }
});

// Save push subscription
app.post('/api/subscribe', async (req, res) => {
    try {
        const { subscription } = req.body;
        const userId = req.user.userId; // From auth middleware

        await Subscription.findOneAndUpdate(
            { user_id: userId },
            { subscription },
            { upsert: true }
        );

        res.status(201).json({ message: 'Subscription saved' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save subscription' });
    }
});

// Update task notification checking to be more precise
cron.schedule('* * * * *', async () => {
    try {
        const now = new Date();
        console.log('Checking for tasks at:', now.toLocaleString());

        const tasks = await Task.find({
            task_time: {
                $lte: now,  // Find tasks due now or in the past
                $gte: new Date(now - 60000) // Within last minute
            },
            completed: false,
            notified: false
        });

        console.log('Found tasks:', tasks);

        for (const task of tasks) {
            const subscription = await Subscription.findOne({ user_id: task.user_id });
            if (subscription) {
                console.log('Sending notification for task:', task.title);
                await sendPushNotification(subscription.subscription, task);
                task.notified = true;
                await task.save();
            }
        }
    } catch (err) {
        console.error('Task notification error:', err);
    }
});

// Add immediate notification check endpoint
app.get('/api/check-notifications', authMiddleware, async (req, res) => {
    try {
        const now = new Date();
        console.log('Manual notification check at:', now.toLocaleString());

        const tasks = await Task.find({
            user_id: req.user.userId,
            task_time: {
                $lte: now,
                $gte: new Date(now - 60000)
            },
            completed: false,
            notified: false
        });

        console.log('Found tasks for manual check:', tasks);

        let notificationsSent = 0;
        for (const task of tasks) {
            const subscription = await Subscription.findOne({ user_id: req.user.userId });
            if (subscription) {
                await sendPushNotification(subscription.subscription, task);
                task.notified = true;
                await task.save();
                notificationsSent++;
            }
        }

        res.json({ 
            message: `Checked ${tasks.length} tasks, sent ${notificationsSent} notifications`,
            tasks: tasks.map(t => ({
                title: t.title,
                time: t.task_time
            }))
        });
    } catch (err) {
        console.error('Manual notification check error:', err);
        res.status(500).json({ error: 'Failed to check notifications' });
    }
});

// Setup task notification checking
cron.schedule('*/30 * * * * *', async () => {
    try {
        const now = new Date();
        const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60000);
        
        const tasks = await Task.find({
            task_time: {
                $gte: now,
                $lte: fiveMinutesFromNow
            },
            completed: false,
            notified: { $ne: true } // Add this field to prevent duplicate notifications
        }).populate('user_id');

        console.log(`Checking notifications at ${now.toLocaleString()}, found ${tasks.length} tasks`);

        for (const task of tasks) {
            const subscription = await Subscription.findOne({ user_id: task.user_id });
            if (subscription) {
                await sendPushNotification(subscription.subscription, task);
                // Mark task as notified
                task.notified = true;
                await task.save();
            }
        }
    } catch (err) {
        console.error('Task notification error:', err);
    }
});

async function sendPushNotification(subscription, task) {
    const payload = JSON.stringify({
        title: task.title,
        body: 'Your task is starting now!',
        icon: '/icon.png',
        data: {
            taskId: task._id
        }
    });

    try {
        await webpush.sendNotification(subscription, payload);
    } catch (err) {
        console.error('Push notification error:', err);
    }
}

// Add test notification endpoint
app.post('/api/test-notification', authMiddleware, async (req, res) => {
    try {
        const subscription = await Subscription.findOne({ user_id: req.user.userId });
        if (!subscription) {
            return res.status(404).json({ error: 'No subscription found' });
        }

        const testPayload = {
            title: 'Test Notification',
            body: 'This is a test notification!',
            icon: '/icon.png'
        };

        await webpush.sendNotification(
            subscription.subscription, 
            JSON.stringify(testPayload)
        );

        res.json({ message: 'Test notification sent' });
    } catch (err) {
        console.error('Test notification error:', err);
        res.status(500).json({ error: 'Failed to send test notification' });
    }
});

// Add root route (add this before other routes)
app.get('/', (req, res) => {
    res.json({ 
        message: 'Todo API is running',
        endpoints: {
            auth: [
                '/api/signup',
                '/api/login'
            ],
            tasks: [
                '/api/tasks',
                '/api/subscribe',
                '/api/check-notifications',
                '/api/test-notification'
            ]
        }
    });
});

// Add error handling middleware (add this at the end before app.listen)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Handle 404 routes (add this at the end before app.listen)
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Monitor MongoDB connection
mongoose.connection.on('disconnected', () => {
    console.log('MongoDB disconnected');
    isConnected = false;
    setTimeout(connectDB, 5000);
});

mongoose.connection.on('error', (err) => {
    console.error('MongoDB error:', err);
    isConnected = false;
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
