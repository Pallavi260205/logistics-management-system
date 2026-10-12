# Deployment Guide

This guide describes how to deploy the Real-Time Chat Application Backend to staging or production environments.

---

## 1. System Requirements
- **Node.js**: v18.x or higher (v22.x recommended)
- **MongoDB**: v6.x or higher (or MongoDB Atlas cloud database instance)
- **Memory**: Minimum 512MB RAM, 1GB+ recommended

---

## 2. Environment Configurations

Create a `.env` file in the production server root directory:

```env
PORT=5000
MONGO_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/chat-prod?retryWrites=true&w=majority
JWT_SECRET=use_a_long_random_hex_string_here
NODE_ENV=production
```

---

## 3. Production Process Management (PM2)

In production, run the server using a process manager like **PM2** to handle automatic restarts, clustering, and monitoring.

1. Install PM2 globally:
   ```bash
   npm install -g pm2
   ```
2. Start the application:
   ```bash
   pm2 start src/server.js --name "chat-backend"
   ```
3. Use PM2 commands to monitor and control processes:
   ```bash
   pm2 status
   pm2 logs chat-backend
   pm2 restart chat-backend
   ```

---

## 4. Docker Deployment

### 4.1 Dockerfile
Create a `Dockerfile` in the root of the workspace:
```dockerfile
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY . .

EXPOSE 5000

CMD ["node", "src/server.js"]
```

### 4.2 Docker Compose
Create a `docker-compose.yml` to launch the Node application and MongoDB together:
```yaml
version: '3.8'

services:
  mongo:
    image: mongo:latest
    container_name: chat-mongodb
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db

  app:
    build: .
    container_name: chat-app
    ports:
      - "5000:5000"
    environment:
      - MONGO_URI=mongodb://mongo:27017/chat-app
      - JWT_SECRET=supersecretdockerkey12345
      - PORT=5000
      - NODE_ENV=production
    depends_on:
      - mongo

volumes:
  mongo-data:
```

Launch the stack using:
```bash
docker-compose up -d
```

---

## 5. Nginx Load Balancing with Sticky Sessions

When scaling Socket.IO horizontally across multiple nodes behind Nginx, **sticky sessions** must be configured. This is because Socket.IO begins with an HTTP long-polling handshake before upgrading to WebSockets, and subsequent HTTP requests must hit the same server node.

Example `nginx.conf` segment:
```nginx
upstream chat_servers {
    ip_hash; # Enables sticky sessions by hashing client IP
    server 127.0.0.1:5000;
    server 127.0.0.1:5001;
}

server {
    listen 80;
    server_name chat.yourdomain.com;

    location / {
        proxy_pass http://chat_servers;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
If using a Cloud Load Balancer (like AWS ALB), enable **Cookie-based Stickiness** on the target group.
