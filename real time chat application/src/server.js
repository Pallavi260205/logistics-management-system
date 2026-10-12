const http = require('http');
const socketio = require('socket.io');
const app = require('./app');
const connectDB = require('./config/db');

// Connect to Database
connectDB();

const server = http.createServer(app);

// Initialize Socket.IO
const io = socketio(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Make Socket.IO instance accessible via express app
app.set('io', io);

// Import and bind central Socket.IO event handler
const socketHandler = require('./socket/socketHandler');
socketHandler(io);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
