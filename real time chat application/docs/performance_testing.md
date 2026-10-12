# Performance and Load Testing Guide

This document discusses the performance optimizations built into the Real-Time Chat Application and provides guidance for running load tests.

---

## 1. Built-in Performance Optimizations

### 1.1 Indexing Strategy
To ensure fast retrieval under high volumes of chat messages, MongoDB is configured with compound indexes:
- `{ conversationId: 1, createdAt: -1 }` (1-to-1 chats)
- `{ groupId: 1, createdAt: -1 }` (group chats)
- `{ email: 1 }` (unique user check)

These indexes allow Mongoose to fetch the most recent messages for a thread (which is the most common use case) in $O(\log N)$ time, avoiding full table scans and in-memory sorting.

### 1.2 Paginated History Retrieval
To prevent servers from running out of memory when loading chats with thousands of messages, history endpoints (`GET /api/chats/:conversationId/messages` and `GET /api/groups/:id/messages`) implement strict pagination using `page` and `limit` (defaulting to 20 messages per request).

### 1.3 O(1) Connection Lookups
The [ConnectionManager](file:///d:/logistics_app/real%20time%20chat%20application/src/socket/connectionManager.js) maps users and sockets using Javascript `Map` collections.
- Mapping lookup: `userSockets.get(userId)` -> $O(1)$ complexity.
- Mapping update on connect/disconnect -> $O(1)$ complexity.
This structure ensures that locating an online user's sockets to deliver real-time messages is extremely fast and scales with the number of concurrent connections.

---

## 2. Load Testing Strategy

To evaluate the application's stability under load (e.g., thousands of simultaneous users sending messages), use the following approaches:

### 2.1 REST API Load Testing (using autocannon)
You can use `autocannon` to test the performance of the authentication and user REST APIs.

1. Install autocannon globally:
   ```bash
   npm install -g autocannon
   ```
2. Run a benchmark against the health check endpoint:
   ```bash
   autocannon -c 100 -d 10 http://localhost:5000/health
   ```
   *(runs 100 concurrent connections for 10 seconds)*

### 2.2 WebSocket Load Testing (using artillery)
To test WebSocket connection load and real-time message latency:

1. Install `artillery` and the Socket.IO engine extension:
   ```bash
   npm install -g artillery
   npm install -g artillery-engine-socketio
   ```
2. Create an Artillery script `load-test.yml`:
   ```yaml
   config:
     target: "http://localhost:5000"
     phases:
       - duration: 60
         arrivalRate: 20
         name: Warm up phase
       - duration: 120
         arrivalRate: 50
         name: Sustained load phase
     engines:
       socketio: {}
   scenarios:
     - name: User connects and chat activity
       engine: socketio
       flow:
         # Connect handshake
         - connect:
             auth:
               token: "your_jwt_token_here"
         # Wait 2 seconds
         - think: 2
         # Emit typing event
         - emit:
             channel: "typing"
             data:
               conversationId: "60d0fe735311236168a109cb"
               receiverId: "60d0fe4f5311236168a109ca"
         - think: 1
         # Emit send_message
         - emit:
             channel: "send_message"
             data:
               receiverId: "60d0fe4f5311236168a109ca"
               content: "Load test message"
         - think: 5
         - disconnect: {}
   ```
3. Execute the load test:
   ```bash
   artillery run load-test.yml
   ```
