/**
 * Connection Manager tracks the mapping of User ID to their active socket connections.
 * Supports multiple socket connections per user to handle multiple tabs/devices.
 */
class ConnectionManager {
  constructor() {
    // Maps userId (string) -> Set of socketIds (string)
    this.userSockets = new Map();
    // Maps socketId (string) -> userId (string)
    this.socketToUser = new Map();
  }

  /**
   * Add a socket connection for a user
   * @param {string} userId 
   * @param {string} socketId 
   */
  addConnection(userId, socketId) {
    const userStr = userId.toString();
    if (!this.userSockets.has(userStr)) {
      this.userSockets.set(userStr, new Set());
    }
    this.userSockets.get(userStr).add(socketId);
    this.socketToUser.set(socketId, userStr);
  }

  /**
   * Remove a socket connection
   * @param {string} socketId 
   * @returns {string|null} userId associated with the socket if it existed, otherwise null
   */
  removeConnection(socketId) {
    const userId = this.socketToUser.get(socketId);
    if (userId) {
      const sockets = this.userSockets.get(userId);
      if (sockets) {
        sockets.delete(socketId);
        if (sockets.size === 0) {
          this.userSockets.delete(userId);
        }
      }
      this.socketToUser.delete(socketId);
      return userId;
    }
    return null;
  }

  /**
   * Get all active sockets for a user
   * @param {string} userId 
   * @returns {string[]} array of socket IDs
   */
  getSockets(userId) {
    if (!userId) return [];
    const userStr = userId.toString();
    const sockets = this.userSockets.get(userStr);
    return sockets ? Array.from(sockets) : [];
  }

  /**
   * Get user ID associated with a socket ID
   * @param {string} socketId 
   * @returns {string|null}
   */
  getUserBySocket(socketId) {
    return this.socketToUser.get(socketId) || null;
  }

  /**
   * Check if a user is online (has at least one active socket connection)
   * @param {string} userId 
   * @returns {boolean}
   */
  isOnline(userId) {
    if (!userId) return false;
    const userStr = userId.toString();
    const sockets = this.userSockets.get(userStr);
    return sockets ? sockets.size > 0 : false;
  }

  /**
   * Get all online user IDs
   * @returns {string[]}
   */
  getOnlineUsers() {
    return Array.from(this.userSockets.keys());
  }
}

// Export a singleton instance
module.exports = new ConnectionManager();
