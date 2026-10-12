# Security and Testing Guide

This document details the security model, vulnerability preventions, and testing checklist for the Real-Time Chat Application.

---

## 1. Core Security Features

### 1.1 Password Hashing (bcrypt.js)
- Passwords are never stored in plain text.
- They are hashed using `bcryptjs` with a salting factor of `10` rounds before database insertion.
- The `password` field in the User model is configured with `select: false` so that query responses exclude it by default.

### 1.2 JWT Authentication
- JSON Web Tokens (JWT) are signed using a robust HS256 secret (`process.env.JWT_SECRET`).
- Tokens are set to expire in 7 days by default.
- REST paths are secured via the `protect` middleware.
- Socket.IO connection handshakes are secured using `socketAuth` middleware.

### 1.3 Request Validation & Sanitization
- Express request bodies are validated and cleaned using `express-validator` rules.
- Invalid requests (e.g., malformed email formats, short passwords) are blocked at the router layer.

### 1.4 Access Control (Authorization)
- User privacy is enforced: users cannot query messages of conversations they do not belong to.
- Group privacy is enforced: users cannot join, view, or post messages to group rooms unless they are authorized members.
- Group administrative controls: only group admins can add members.

### 1.5 CORS (Cross-Origin Resource Sharing)
- CORS middleware is configured to define allowed origins and headers, preventing unauthorized cross-origin requests.

---

## 2. Security Test Scenarios

Run these tests via Postman or script-based requests to verify security boundaries:

### 2.1 Authentication Vulnerability Testing

| Test Case | Scenario / Payload | Expected Result | Verified Status |
| :--- | :--- | :--- | :--- |
| **No JWT REST Check** | Query `GET /api/users/profile` without Authorization header | `401 Unauthorized` | Pass |
| **Expired JWT REST Check** | Query `GET /api/users/profile` with an expired token | `401 Unauthorized` | Pass |
| **Invalid JWT REST Check** | Query `GET /api/users/profile` with a malformed token | `401 Unauthorized` | Pass |
| **No JWT Socket Check** | Connect Socket.IO client without token in `auth` payload | Connection Rejected (`connect_error`) | Pass |
| **Invalid JWT Socket Check**| Connect Socket.IO client with a malformed token | Connection Rejected (`connect_error`) | Pass |

### 2.2 Privacy & Access Control Testing

| Test Case | Scenario / Payload | Expected Result | Verified Status |
| :--- | :--- | :--- | :--- |
| **Cross-Chat Read Access** | User A tries to query `GET /api/chats/:id/messages` for a conversation between User B and User C | `403 Forbidden` (Unauthorized access) | Pass |
| **Cross-Group Read Access**| User A tries to query `GET /api/groups/:id/messages` for a group they are not a member of | `403 Forbidden` (Unauthorized access) | Pass |
| **Cross-Group Write Access**| User A sends a POST to `/api/groups/:id/messages` for a group they are not a member of | `403 Forbidden` (Not a member of this group) | Pass |
| **Unauthorized Group Add** | User B (non-admin) tries to add a user to a group via `POST /api/groups/:id/members` | `403 Forbidden` (Only admins can add members) | Pass |
| **Unauthorized Group Remove**| User B (non-admin) tries to remove User C from group via `DELETE /api/groups/:id/members/:userId` | `403 Forbidden` (Unauthorized to remove this member) | Pass |
| **Password Leak Check** | View user list (`GET /api/users`) or profile details | Password hash is NOT present in fields | Pass |

---

## 3. How to Run Security Tests

1. Start the MongoDB database.
2. Launch the backend server: `npm run dev`.
3. Run the automated integration tests: `npm test`. The test suite automatically runs verification for profile blockings, bad passwords, duplicate users, and bad JWT handshakes.
