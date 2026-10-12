const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Group = require('../models/Group');
const connectionManager = require('./connectionManager');

const socketHandler = (io) => {
  // Use our socket authentication middleware
  const { socketAuth } = require('../middleware/authMiddleware');
  io.use(socketAuth);

  io.on('connection', async (socket) => {
    const user = socket.user;
    const userId = user._id.toString();

    console.log(`User connected: ${user.name} (${userId}), Socket ID: ${socket.id}`);

    // 1. Add connection to manager and determine if they were offline
    const wasOffline = !connectionManager.isOnline(userId);
    connectionManager.addConnection(userId, socket.id);

    // 2. Set online presence in DB and broadcast status if newly online
    if (wasOffline) {
      try {
        await User.findByIdAndUpdate(userId, { isOnline: true });
        socket.broadcast.emit('user_status', {
          userId,
          isOnline: true,
        });
      } catch (err) {
        console.error('Error updating user online presence:', err.message);
      }
    }

    // 3. Join Socket.IO rooms for all groups the user belongs to
    try {
      const groups = await Group.find({ members: userId });
      groups.forEach((group) => {
        socket.join(group._id.toString());
      });
    } catch (err) {
      console.error('Error joining group rooms:', err.message);
    }

    // 4. Join user to their personal room (convenient for targeting a specific user's multi-device sockets)
    socket.join(userId);

    // 5. Handle private 1-to-1 message sending
    socket.on('send_message', async (data, ack) => {
      const { receiverId, conversationId, content, messageType = 'text' } = data;

      if (!content || (!receiverId && !conversationId)) {
        if (ack) ack({ success: false, message: 'Invalid payload. Message content and receiver/conversation ID are required.' });
        return;
      }

      try {
        let activeConversationId = conversationId;

        // If conversationId is not provided, find or create 1-to-1 conversation
        if (!activeConversationId && receiverId) {
          let conversation = await Conversation.findOne({
            participants: { $all: [userId, receiverId] },
          });

          if (!conversation) {
            conversation = await Conversation.create({
              participants: [userId, receiverId],
            });
          }
          activeConversationId = conversation._id;
        }

        // Determine if receiver is online to set initial status
        const isReceiverOnline = connectionManager.isOnline(receiverId);
        const initialStatus = isReceiverOnline ? 'delivered' : 'sent';

        // Save message in DB
        const message = await Message.create({
          senderId: userId,
          receiverId,
          conversationId: activeConversationId,
          content,
          messageType,
          status: initialStatus,
        });

        // Update Conversation record
        await Conversation.findByIdAndUpdate(activeConversationId, {
          lastMessage: message._id,
          lastMessageAt: message.createdAt,
        });

        const populatedMessage = await message.populate('senderId', 'name email profileInfo');

        // Ack back to the sender socket
        if (ack) {
          ack({
            success: true,
            data: populatedMessage,
          });
        }

        // Send to receiver's sockets if online
        if (isReceiverOnline) {
          io.to(receiverId).emit('receive_message', populatedMessage);
          
          // Notify other sockets of sender about delivery
          io.to(userId).emit('message_status', {
            messageId: message._id,
            conversationId: activeConversationId,
            status: 'delivered',
          });
        }

        // Forward to sender's other open sockets/tabs
        socket.to(userId).emit('receive_message', populatedMessage);
      } catch (err) {
        console.error('Error in send_message:', err.message);
        if (ack) ack({ success: false, message: 'Server error processing message' });
      }
    });

    // 6. Handle Group message sending
    socket.on('send_group_message', async (data, ack) => {
      const { groupId, content, messageType = 'text' } = data;

      if (!content || !groupId) {
        if (ack) ack({ success: false, message: 'Invalid payload. Content and groupId are required.' });
        return;
      }

      try {
        // Validate user group membership
        const group = await Group.findById(groupId);
        if (!group || !group.members.includes(userId)) {
          if (ack) ack({ success: false, message: 'Unauthorized group access' });
          return;
        }

        const message = await Message.create({
          senderId: userId,
          groupId,
          content,
          messageType,
          status: 'sent',
        });

        group.lastMessage = message._id;
        group.lastMessageAt = message.createdAt;
        await group.save();

        const populatedMessage = await message.populate('senderId', 'name email profileInfo');

        if (ack) {
          ack({
            success: true,
            data: populatedMessage,
          });
        }

        // Broadcast message to group room (except current socket)
        socket.to(groupId.toString()).emit('receive_message', populatedMessage);
        
        // Also sync sender's other connections
        socket.to(userId).emit('receive_message', populatedMessage);
      } catch (err) {
        console.error('Error in send_group_message:', err.message);
        if (ack) ack({ success: false, message: 'Server error processing group message' });
      }
    });

    // 7. Handle Typing Indicators
    socket.on('typing', (data) => {
      const { conversationId, groupId, receiverId } = data;
      if (conversationId && receiverId) {
        io.to(receiverId).emit('user_typing', {
          userId,
          conversationId,
        });
      } else if (groupId) {
        socket.to(groupId.toString()).emit('user_typing', {
          userId,
          groupId,
        });
      }
    });

    socket.on('stop_typing', (data) => {
      const { conversationId, groupId, receiverId } = data;
      if (conversationId && receiverId) {
        io.to(receiverId).emit('stop_typing', {
          userId,
          conversationId,
        });
      } else if (groupId) {
        socket.to(groupId.toString()).emit('stop_typing', {
          userId,
          groupId,
        });
      }
    });

    // 8. Handle Message Read Receipts (seen status)
    socket.on('mark_seen', async (data) => {
      const { conversationId } = data;

      if (!conversationId) return;

      try {
        const result = await Message.updateMany(
          {
            conversationId,
            senderId: { $ne: userId },
            status: { $ne: 'seen' },
          },
          {
            $set: { status: 'seen' },
          }
        );

        if (result.modifiedCount > 0) {
          const conversation = await Conversation.findById(conversationId);
          if (conversation) {
            const otherParticipantId = conversation.participants
              .find((p) => p.toString() !== userId)
              ?.toString();

            if (otherParticipantId) {
              io.to(otherParticipantId).emit('messages_seen', {
                conversationId,
                seenBy: userId,
                seenAt: new Date(),
              });
            }
          }
        }
      } catch (err) {
        console.error('Error marking messages as seen:', err.message);
      }
    });

    // 9. Handle socket disconnect
    socket.on('disconnect', async () => {
      console.log(`Socket disconnected: ${socket.id}`);
      
      const id = connectionManager.removeConnection(socket.id);
      
      // Check if user is fully offline (no other socket tabs/devices online)
      if (id && !connectionManager.isOnline(id)) {
        try {
          const lastSeen = new Date();
          await User.findByIdAndUpdate(id, {
            isOnline: false,
            lastSeen,
          });

          // Broadcast offline presence status update
          socket.broadcast.emit('user_status', {
            userId: id,
            isOnline: false,
            lastSeen,
          });
        } catch (err) {
          console.error('Error updating user offline presence:', err.message);
        }
      }
    });
  });
};

module.exports = socketHandler;
