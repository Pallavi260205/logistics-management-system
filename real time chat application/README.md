# Real-Time Chat Application Backend

A robust, secure, and scalable backend system for a real-time messaging application. Built with Node.js, Express.js, Socket.IO, and MongoDB/Mongoose.

---

## 1. Project Objective

To deliver a high-quality backend for a chat application that supports instant 1-to-1 messaging, group channel discussions, user presence tracking (online/offline/last seen), message persistence, read receipts, and typing indicators.

---

## 2. Features

- **User Authentication**: Register, login, and logout endpoints with JWT authentication and bcrypt.js password hashing.
- **Real-Time Direct Chat**: One-to-one message sending, receiving, and syncing across multiple tabs.
- **Group Channels**: Create groups, add/remove members (admin controlled), and broadcast messages to members using Socket.IO rooms.
- **Presence Tracking**: Real-time user status (online/offline) and `lastSeen` timestamps, managing concurrent connections (tabs/devices) gracefully.
- **Read & Delivery Receipts**: Messages are marked as `sent`, `delivered` (if receiver is online), and `seen` (when conversation is opened).
- **Typing Indicators**: Live typing notifications (`user_typing`, `stop_typing`).
- **Paginated History**: Chat history retrieval REST APIs with pagination and sorting, protected by membership authorization.
- **Centralized Error Handling**: Standardized JSON responses for all server, database, validation, or socket exceptions.

---

## 3. Technology Stack

- **Backend Framework**: Node.js & Express.js
- **Real-Time Communication**: Socket.IO
- **Database Layer**: MongoDB & Mongoose
- **Authentication**: JSON Web Token (JWT) & bcryptjs
- **Validation**: express-validator
- **Testing**: Built-in `node:test` runner, Supertest, and Socket.IO Client

---

## 4. Architecture & Folder Structure

We follow a clean, modular Model-Controller-Route design.

```
chat-backend/
├── docs/                      # Detailed Architecture Guides
│   ├── database_design.md
│   ├── authentication_flow.md
│   ├── websocket_architecture.md
│   ├── api_documentation.md
│   ├── group_chat_design.md
│   ├── security_testing.md
│   ├── performance_testing.md
│   └── deployment_guide.md
│
├── src/                       # Application Source Code
│   ├── config/
│   │   └── db.js              # Mongoose DB Connection
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── userController.js
│   │   ├── chatController.js
│   │   ├── groupController.js
│   │   └── messageController.js
│   ├── middleware/
│   │   ├── authMiddleware.js  # JWT Auth & Socket Handshake Auth
│   │   ├── errorMiddleware.js # Standardized Exception Catcher
│   │   └── validationMiddleware.js # Input sanitizers
│   ├── models/
│   │   ├── User.js
│   │   ├── Conversation.js
│   │   ├── Message.js
│   │   └── Group.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── userRoutes.js
│   │   ├── chatRoutes.js
│   │   ├── groupRoutes.js
│   │   └── messageRoutes.js
│   ├── socket/
│   │   ├── connectionManager.js # Tracks Multi-Socket IDs per User
│   │   └── socketHandler.js     # Real-Time Event Controller
│   ├── app.js                 # Express Application configurations
│   └── server.js               # Entry Point (starts server, binds WS)
│
├── tests/                     # Integration Test Suites
│   ├── api.test.js            # REST API Endpoint tests
│   └── socket.test.js         # Socket.IO Real-Time tests
│
├── .env                       # Local Environment configuration (Git ignored)
├── .env.example               # Configuration template
├── .gitignore
├── package.json
└── README.md                  # Master Guide
```

---

## 5. Detailed Documentation Modules

For detailed breakdowns of the architecture and configuration guides, refer to the files in the `/docs` directory:

1. [Database Design & Schema](file:///d:/logistics_app/real%20time%20chat%20application/docs/database_design.md) - Describes MongoDB collections, fields, and index designs.
2. [Authentication Flow](file:///d:/logistics_app/real%20time%20chat%20application/docs/authentication_flow.md) - Details registration, login, logout, and token authorization processes.
3. [WebSocket Architecture](file:///d:/logistics_app/real%20time%20chat%20application/docs/websocket_architecture.md) - Details socket handler events, payloads, and connection managers.
4. [API Endpoint Documentation](file:///d:/logistics_app/real%20time%20chat%20application/docs/api_documentation.md) - Full list of REST API routes, request bodies, and success/error schemas.
5. [Group Chat Design](file:///d:/logistics_app/real%20time%20chat%20application/docs/group_chat_design.md) - Analyzes Socket.IO rooms, member joining/leaving, and group security checks.
6. [Security Testing Guide](file:///d:/logistics_app/real%20time%20chat%20application/docs/security_testing.md) - Outlines credential hashing, request validations, and access controls.
7. [Performance & Load Testing](file:///d:/logistics_app/real%20time%20chat%20application/docs/performance_testing.md) - Explains index optimizations, lookups, and load testing guidelines.
8. [Deployment & Production Guide](file:///d:/logistics_app/real%20time%20chat%20application/docs/deployment_guide.md) - Covers PM2 setup, Docker containers, and Nginx reverse proxy configurations.

---

## 6. Setup & Running Instructions

### 6.1 Prerequisites
Make sure you have Node.js and MongoDB installed locally.

### 6.2 Installation
1. Clone or navigate to the project directory.
2. Install the node packages:
   ```bash
   npm install
   ```

### 6.3 Setup Environment Variables
Create a `.env` file from the example template:
```bash
cp .env.example .env
```
Ensure the connection parameters inside `.env` match your MongoDB local database server:
```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/chat-app
JWT_SECRET=supersecretjwtkey12345
NODE_ENV=development
```

### 6.4 Run the Backend

- **Development Mode** (with hot-reload via nodemon):
  ```bash
  npm run dev
  ```
- **Production Mode**:
  ```bash
  npm start
  ```

---

## 7. Running Tests

The application uses Node's native test runner (available in Node.js v20+), meaning you can run all tests without installing external test runners:

```bash
npm test
```

This runs:
- **API Tests (`tests/api.test.js`)**: Tests health endpoints, login, register, duplicate registers, and path protection.
- **WebSocket Tests (`tests/socket.test.js`)**: Tests valid/invalid token handshakes, message delivery, seen updates, and typing indicator events.
