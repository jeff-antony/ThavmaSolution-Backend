const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://antonyjefin7:Xmg6EaDguUzrurl1@cluster0.sgjenob.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;

// Import models
const Project = require('./models/Project');
const ContactMessage = require('./models/ContactMessage');
const Admin = require('./models/Admin');

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    // Create default admin user if it doesn't exist
    createDefaultAdmin();
    // Create sample projects if none exist
    createSampleProjects();
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
  });

// Create default admin user
async function createDefaultAdmin() {
  try {
    const adminExists = await Admin.findOne({ username: 'admin' });
    if (!adminExists) {
      const admin = new Admin({
        username: 'admin',
        password: 'password',
        email: 'admin@thavmasolutions.com'
      });
      await admin.save();
      console.log('Default admin user created');
    }
  } catch (error) {
    console.error('Error creating default admin:', error);
  }
}

// Create sample projects
async function createSampleProjects() {
  try {
    const projectCount = await Project.countDocuments();
    if (projectCount === 0) {
      const sampleProjects = [
        {
          title: "Modern MRI Suite",
          description: "Complete MRI room design with RF shielding and patient comfort features",
          images: [
            "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&h=600&fit=crop",
            "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=800&h=600&fit=crop"
          ],
          category: "Medical"
        },
        {
          title: "Luxury Residential Interior",
          description: "Warm and elegant living space with custom furnishings",
          images: [
            "https://images.unsplash.com/photo-1721322800607-8c38375eef04?w=800&h=600&fit=crop",
            "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&h=600&fit=crop"
          ],
          category: "Residential"
        }
      ];
      
      await Project.insertMany(sampleProjects);
      console.log('Sample projects created');
    }
  } catch (error) {
    console.error('Error creating sample projects:', error);
  }
}

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Routes

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await admin.comparePassword(password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ username: admin.username, id: admin._id }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, username: admin.username });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all projects
app.get('/api/projects', async (req, res) => {
  try {
    const projects = await Project.find().sort({ createdAt: -1 });
    
    // Add full URL to image paths and handle backward compatibility
    const projectsWithFullUrls = projects.map(project => {
      const projectObj = project.toObject();
      
      // Handle new images array field
      if (projectObj.images && projectObj.images.length > 0) {
        projectObj.images = projectObj.images.map(img => 
          img.startsWith('/uploads/') ? `${SERVER_URL}${img}` : img
        );
      }
      
      // Handle backward compatibility with old image field
      if (projectObj.image && projectObj.image.startsWith('/uploads/')) {
        projectObj.image = `${SERVER_URL}${projectObj.image}`;
        // Convert single image to images array for consistency
        if (!projectObj.images) {
          projectObj.images = [projectObj.image];
        }
      }
      
      return projectObj;
    });
    
    res.json(projectsWithFullUrls);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Create new project
app.post('/api/projects', authenticateToken, upload.array('images', 10), async (req, res) => {
  try {
    const { title, description, category } = req.body;
    
    // Handle multiple images
    let images = [];
    if (req.files && req.files.length > 0) {
      images = req.files.map(file => `/uploads/${file.filename}`);
    } else if (req.body.images) {
      // Handle existing images (for updates)
      images = Array.isArray(req.body.images) ? req.body.images : [req.body.images];
    }

    const newProject = new Project({
      title,
      description,
      images,
      category
    });

    const savedProject = await newProject.save();
    
    // Add full URL to image paths
    const projectObj = savedProject.toObject();
    if (projectObj.images && projectObj.images.length > 0) {
      projectObj.images = projectObj.images.map(img => 
        img.startsWith('/uploads/') ? `${SERVER_URL}${img}` : img
      );
    }
    
    res.status(201).json(projectObj);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Update project
app.put('/api/projects/:id', authenticateToken, upload.array('images', 10), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, category } = req.body;
    
    // Handle multiple images
    let images = [];
    if (req.files && req.files.length > 0) {
      images = req.files.map(file => `/uploads/${file.filename}`);
    } else if (req.body.images) {
      // Handle existing images (for updates)
      images = Array.isArray(req.body.images) ? req.body.images : [req.body.images];
    }

    const project = await Project.findByIdAndUpdate(
      id,
      {
        title,
        description,
        images,
        category
      },
      { new: true, runValidators: true }
    );

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Add full URL to image paths
    const projectObj = project.toObject();
    if (projectObj.images && projectObj.images.length > 0) {
      projectObj.images = projectObj.images.map(img => 
        img.startsWith('/uploads/') ? `${SERVER_URL}${img}` : img
      );
    }

    res.json(projectObj);
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// Delete project
app.delete('/api/projects/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const project = await Project.findByIdAndDelete(id);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// Contact form submission
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;
    
    const newMessage = new ContactMessage({
      name,
      email,
      phone,
      message
    });

    await newMessage.save();
    res.status(201).json({ message: 'Message sent successfully' });
  } catch (error) {
    console.error('Error saving contact message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Get all contact messages (admin only)
app.get('/api/contact', authenticateToken, async (req, res) => {
  try {
    const messages = await ContactMessage.find().sort({ createdAt: -1 });
    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Update message status
app.put('/api/contact/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const message = await ContactMessage.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    );

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json(message);
  } catch (error) {
    console.error('Error updating message status:', error);
    res.status(500).json({ error: 'Failed to update message status' });
  }
});

// Send email response
app.post('/api/contact/:id/respond', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { response } = req.body;

    const message = await ContactMessage.findById(id);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Email configuration (configure with your email service)
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: message.email,
      subject: 'Response from Thavma Solutions',
      text: response,
      html: `<p>${response}</p>`
    });

    // Update message in database
    message.status = 'responded';
    message.response = response;
    message.respondedAt = new Date();
    await message.save();

    res.json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error sending email response:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// Health check / root route
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'thavma-admin-server', timestamp: new Date().toISOString() });
});

// Export the Express app as a serverless handler for Vercel
module.exports = (req, res) => app(req, res);