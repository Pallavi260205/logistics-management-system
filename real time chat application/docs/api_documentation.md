# REST API Endpoint Documentation

All REST APIs send and receive JSON payloads. Private endpoints require authorization via a JWT passed in the header as:
`Authorization: Bearer <your_jwt_token>`

---

## 1. Authentication Router (`/api/auth`)

### 1.1 User Registration
- **Method / URL**: `POST /api/auth/register`
- **Purpose**: Registers a new user account.
- **Authentication**: None (Public)
- **Request Body**:
  ```json
  {
    "name": "John Doe",
    "email": "john@example.com",
    "password": "password123"
  }
  ```
- **Success Response (201 Created)**:
  ```json
  {
    "success": true,
    "data": {
      "_id": "60d0fe4f5311236168a109ca",
      "name": "John Doe",
      "email": "john@example.com",
      "profileInfo": { "avatar": "", "bio": "" },
      "isOnline": false,
      "lastSeen": "2026-08-12T12:00:00.000Z",
      "token": "eyJhbGciOiJIUzI1NiIsIn..."
    }
  }
  ```
- **Error Responses**:
  - `400 Bad Request` (Validation error / email already exists).

### 1.2 User Login
- **Method / URL**: `POST /api/auth/login`
- **Purpose**: Authenticates credentials and returns a JWT.
- **Authentication**: None (Public)
- **Request Body**:
  ```json
  {
    "email": "john@example.com",
    "password": "password123"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "_id": "60d0fe4f5311236168a109ca",
      "name": "John Doe",
      "email": "john@example.com",
      "profileInfo": { "avatar": "", "bio": "" },
      "isOnline": true,
      "lastSeen": "2026-08-12T12:00:00.000Z",
      "token": "eyJhbGciOiJIUzI1NiIsIn..."
    }
  }
  ```
- **Error Responses**:
  - `401 Unauthorized` (Invalid email or password).

### 1.3 User Logout
- **Method / URL**: `POST /api/auth/logout`
- **Purpose**: Marks user presence status offline.
- **Authentication**: JWT (Bearer Token)
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Logged out successfully"
  }
  ```

---

## 2. User Router (`/api/users`)

### 2.1 Get Active User Profile
- **Method / URL**: `GET /api/users/profile`
- **Authentication**: JWT
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "_id": "60d0fe4f5311236168a109ca",
      "name": "John Doe",
      "email": "john@example.com",
      "profileInfo": { "avatar": "", "bio": "" },
      "isOnline": true,
      "lastSeen": "2026-08-12T12:00:00.000Z"
    }
  }
  ```

### 2.2 Update Active User Profile
- **Method / URL**: `PUT /api/users/profile`
- **Authentication**: JWT
- **Request Body** (All fields optional):
  ```json
  {
    "name": "John Changed",
    "profileInfo": {
      "avatar": "https://example.com/avatar.jpg",
      "bio": "Developer and designer"
    },
    "password": "newpassword123"
  }
  ```
- **Success Response (200 OK)**: Returns updated user document.

### 2.3 List/Search Users
- **Method / URL**: `GET /api/users`
- **Query Parameters**:
  - `search` (Optional: searches by name or email keyword)
- **Authentication**: JWT
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "count": 1,
    "data": [
      {
        "_id": "60d0fe5a5311236168a109cb",
        "name": "Jane Smith",
        "email": "jane@example.com",
        "profileInfo": { "avatar": "", "bio": "" },
        "isOnline": false,
        "lastSeen": "2026-08-12T11:30:00.000Z"
      }
    ]
  }
  ```

### 2.4 Get User by ID
- **Method / URL**: `GET /api/users/:id`
- **Authentication**: JWT
- **Success Response (200 OK)**: Returns user metadata.

---

## 3. Conversations/Chats Router (`/api/chats`)

### 3.1 Get All Conversations
- **Method / URL**: `GET /api/chats`
- **Authentication**: JWT
- **Success Response (200 OK)**: List of conversation threads, populated with participant profile details and the last message content.

### 3.2 Create or Find 1-to-1 Conversation
- **Method / URL**: `POST /api/chats`
- **Authentication**: JWT
- **Request Body**:
  ```json
  {
    "receiverId": "60d0fe5a5311236168a109cb"
  }
  ```
- **Success Response (200 OK)**: Returns the conversation document.

### 3.3 Get Conversation Message History
- **Method / URL**: `GET /api/chats/:conversationId/messages`
- **Query Parameters**:
  - `page` (Optional: default 1)
  - `limit` (Optional: default 20)
- **Authentication**: JWT
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "count": 1,
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalPages": 1,
      "totalMessages": 1
    },
    "data": [
      {
        "_id": "60d0feaa5311236168a109cd",
        "senderId": { "_id": "60d0fe4f...", "name": "John Doe" },
        "content": "Hello there!",
        "conversationId": "60d0fe73...",
        "status": "seen",
        "createdAt": "2026-08-12T12:00:00.000Z"
      }
    ]
  }
  ```
- **Error Responses**:
  - `403 Forbidden` (User is not a participant of this conversation).

---

## 4. Groups Router (`/api/groups`)

### 4.1 Create Group
- **Method / URL**: `POST /api/groups`
- **Request Body**:
  ```json
  {
    "name": "Engineering Team",
    "members": ["60d0fe5a5311236168a109cb"]
  }
  ```
- **Success Response (201 Created)**: Returns the newly created group.

### 4.2 List Group Rooms
- **Method / URL**: `GET /api/groups`
- **Purpose**: Returns all groups the active user is a member of.

### 4.3 Add Member to Group (Admin Only)
- **Method / URL**: `POST /api/groups/:id/members`
- **Request Body**:
  ```json
  {
    "members": ["60d0feaa5311236168a109cd"]
  }
  ```

### 4.4 Remove Member / Leave Group
- **Method / URL**: `DELETE /api/groups/:id/members/:userId`
- **Purpose**: Admin removes member, or member self-leaves.

### 4.5 Send Group Message (REST Fallback)
- **Method / URL**: `POST /api/groups/:id/messages`
- **Request Body**:
  ```json
  {
    "content": "Hello Team!"
  }
  ```

### 4.6 Fetch Group Message History
- **Method / URL**: `GET /api/groups/:id/messages`
- **Query Parameters**: `page` (default 1), `limit` (default 20)
- **Success Response (200 OK)**: Returns paginated group history.
