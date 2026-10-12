# Authentication Flow Design

This document details the authentication and security mechanics implemented in the Real-Time Chat Application.

---

## 1. Overview

The backend uses token-based stateless authentication using **JSON Web Tokens (JWT)**.
- **REST APIs**: Secured using an Authorization middleware that validates JWTs sent in the `Authorization: Bearer <token>` header.
- **Socket.IO connections**: Authenticated during the handshake phase using JWTs sent in the connection `auth` payload or headers.
- **Passwords**: Hashed securely using `bcryptjs` before database persistence. They are never stored in plain text and never exposed in API responses.

---

## 2. API Endpoints

### 2.1 Registration Flow (`POST /api/auth/register`)

Registers a new user account, performs input validation, hashes the password, and returns a signed JWT.

```mermaid
sequenceDiagram
    actor Client
    participant Server as Express Server
    participant DB as MongoDB
    
    Client->>Server: POST /api/auth/register {name, email, password}
    Server->>Server: Validate fields (Express Validator)
    alt Invalid Fields
        Server-->>Client: 400 Bad Request {success: false, message: ...}
    end
    Server->>DB: Find user by email
    alt Email Exists
        Server-->>Client: 400 Bad Request {success: false, message: "User already exists"}
    end
    Server->>Server: Hash password using bcryptjs (salt rounds = 10)
    Server->>DB: Save User document
    DB-->>Server: User saved successfully
    Server->>Server: Generate JWT (expires in 7 days)
    Server-->>Client: 21 Created {success: true, data: {..., token}}
```

---

### 2.2 Login Flow (`POST /api/auth/login`)

Authenticates user credentials, generates a JWT, and marks the user's presence as online.

```mermaid
sequenceDiagram
    actor Client
    participant Server as Express Server
    participant DB as MongoDB
    
    Client->>Server: POST /api/auth/login {email, password}
    Server->>Server: Validate fields
    Server->>DB: Find User by email (select password hash)
    alt User Not Found
        Server-->>Client: 401 Unauthorized {success: false, message: "Invalid credentials"}
    end
    Server->>Server: bcrypt.compare(password, passwordHash)
    alt Passwords Do Not Match
        Server-->>Client: 401 Unauthorized {success: false, message: "Invalid credentials"}
    end
    Server->>DB: Update user online status (isOnline = true)
    Server->>Server: Generate JWT (expires in 7 days)
    Server-->>Client: 200 OK {success: true, data: {..., token}}
```

---

### 2.3 Logout Flow (`POST /api/auth/logout`)

Marks the user offline in the database, updates their last seen timestamp, and notifies other users via WebSockets.

```mermaid
sequenceDiagram
    actor Client
    participant Server as Express Server
    participant DB as MongoDB
    participant WS as Socket.IO Server
    
    Client->>Server: POST /api/auth/logout (Authorization: Bearer <token>)
    Server->>Server: Extract token & protect middleware validates JWT
    Server->>DB: Update user status (isOnline = false, lastSeen = Date.now)
    Server->>WS: Broadcast presence event (user_status: offline, lastSeen) to all clients
    Server-->>Client: 200 OK {success: true, message: "Logged out successfully"}
```

---

## 3. Route Protection Middleware

The application defines a `protect` middleware inside [authMiddleware.js](file:///d:/logistics_app/real%20time%20chat%20application/src/middleware/authMiddleware.js) that intercepts incoming REST API requests to private routes:

1. **Extraction**: Checks if the `Authorization` header is present and starts with `Bearer `.
2. **Verification**: Verifies the signature of the token against `process.env.JWT_SECRET`.
3. **Retrieval**: Extends the `req` object by querying MongoDB for the user corresponding to the payload's `id` claim (and attaches it as `req.user`).
4. **Failure Handling**:
   - Missing header: returns `401 Unauthorized` with `"Not authorized, no token provided"`.
   - Expired token: returns `401 Unauthorized` with `"Not authorized, token expired"`.
   - Invalid signature/tampered token: returns `401 Unauthorized` with `"Not authorized, token invalid"`.

---

## 4. WebSocket Handshake Authentication

Socket.IO connections are protected by a custom `socketAuth` middleware.
- When connecting, the client must pass the JWT in the `auth` payload:
  ```javascript
  const socket = io("http://localhost:5000", {
    auth: {
      token: "your_jwt_token_here"
    }
  });
  ```
- The `socketAuth` handler interceptor extracts the token, verifies it, retrieves the user from MongoDB (excluding the password), and attaches the User object to the `socket` instance:
  ```javascript
  socket.user = user;
  ```
- If validation fails, the server rejects the connection. The client receives a `connect_error` event containing the validation issue (e.g. `Authentication error: Token expired`).
