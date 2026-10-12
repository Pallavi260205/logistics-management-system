const Group = require('../models/Group');
const Message = require('../models/Message');

// @desc    Create a new group
// @route   POST /api/groups
// @access  Private
const createGroup = async (req, res, next) => {
  const { name, members = [] } = req.body;

  if (!name) {
    res.status(400);
    return next(new Error('Group name is required'));
  }

  try {
    const uniqueMembers = Array.from(new Set([req.user._id.toString(), ...members]));

    const group = await Group.create({
      name,
      creator: req.user._id,
      members: uniqueMembers,
      admins: [req.user._id],
    });

    const populatedGroup = await Group.findById(group._id)
      .populate('members', 'name email profileInfo isOnline lastSeen')
      .populate('admins', 'name email profileInfo');

    // Make the online members' socket connections join this group room
    const io = req.app.get('io');
    const connectionManager = require('../socket/connectionManager');
    if (io) {
      uniqueMembers.forEach((memberId) => {
        const sockets = connectionManager.getSockets(memberId);
        sockets.forEach((socketId) => {
          const socket = io.sockets.sockets.get(socketId);
          if (socket) {
            socket.join(group._id.toString());
          }
        });
      });
    }

    res.status(201).json({
      success: true,
      data: populatedGroup,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all groups current user is a member of
// @route   GET /api/groups
// @access  Private
const getGroups = async (req, res, next) => {
  try {
    const groups = await Group.find({ members: req.user._id })
      .populate('members', 'name email profileInfo isOnline lastSeen')
      .populate('admins', 'name email profileInfo')
      .populate('lastMessage')
      .sort({ lastMessageAt: -1, updatedAt: -1 });

    res.status(200).json({
      success: true,
      count: groups.length,
      data: groups,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get group details by ID
// @route   GET /api/groups/:id
// @access  Private
const getGroupById = async (req, res, next) => {
  try {
    const group = await Group.findById(req.params.id)
      .populate('members', 'name email profileInfo isOnline lastSeen')
      .populate('admins', 'name email profileInfo');

    if (!group) {
      res.status(404);
      return next(new Error('Group not found'));
    }

    // Verify membership
    if (!group.members.some((m) => m._id.toString() === req.user._id.toString())) {
      res.status(403);
      return next(new Error('Unauthorized to view this group'));
    }

    res.status(200).json({
      success: true,
      data: group,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add member to group
// @route   POST /api/groups/:id/members
// @access  Private (Admin only)
const addMembers = async (req, res, next) => {
  const { members = [] } = req.body;

  if (members.length === 0) {
    res.status(400);
    return next(new Error('Members list cannot be empty'));
  }

  try {
    const group = await Group.findById(req.params.id);

    if (!group) {
      res.status(404);
      return next(new Error('Group not found'));
    }

    // Verify admin privileges
    if (!group.admins.includes(req.user._id.toString())) {
      res.status(403);
      return next(new Error('Only admins can add members to this group'));
    }

    const membersToAdd = members.filter((m) => !group.members.includes(m));
    if (membersToAdd.length > 0) {
      group.members.push(...membersToAdd);
      await group.save();

      // Dynamically join added users' sockets to the Socket.IO room
      const io = req.app.get('io');
      const connectionManager = require('../socket/connectionManager');
      if (io) {
        membersToAdd.forEach((memberId) => {
          const sockets = connectionManager.getSockets(memberId);
          sockets.forEach((socketId) => {
            const socket = io.sockets.sockets.get(socketId);
            if (socket) {
              socket.join(group._id.toString());
            }
          });
        });

        // Notify current members of the changes
        io.to(group._id.toString()).emit('group_updated', {
          type: 'members_added',
          groupId: group._id,
          addedMembers: membersToAdd,
        });
      }
    }

    const updatedGroup = await Group.findById(group._id)
      .populate('members', 'name email profileInfo isOnline lastSeen')
      .populate('admins', 'name email profileInfo');

    res.status(200).json({
      success: true,
      data: updatedGroup,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Remove member from group
// @route   DELETE /api/groups/:id/members/:userId
// @access  Private (Admin or Self leaving)
const removeMember = async (req, res, next) => {
  const { id, userId } = req.params;

  try {
    const group = await Group.findById(id);

    if (!group) {
      res.status(404);
      return next(new Error('Group not found'));
    }

    const isSelfLeaving = req.user._id.toString() === userId;
    const isAdmin = group.admins.includes(req.user._id.toString());

    if (!isSelfLeaving && !isAdmin) {
      res.status(403);
      return next(new Error('Unauthorized to remove this member'));
    }

    if (group.creator.toString() === userId && !isSelfLeaving) {
      res.status(400);
      return next(new Error('Cannot remove the group creator'));
    }

    group.members = group.members.filter((m) => m.toString() !== userId);
    group.admins = group.admins.filter((a) => a.toString() !== userId);

    await group.save();

    // Dynamically remove user's sockets from the Socket.IO room
    const io = req.app.get('io');
    const connectionManager = require('../socket/connectionManager');
    if (io) {
      const sockets = connectionManager.getSockets(userId);
      sockets.forEach((socketId) => {
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
          socket.leave(group._id.toString());
        }
      });

      io.to(group._id.toString()).emit('group_updated', {
        type: 'member_removed',
        groupId: group._id,
        removedUser: userId,
      });

      io.to(userId).emit('group_removed', { groupId: group._id });
    }

    const updatedGroup = await Group.findById(group._id)
      .populate('members', 'name email profileInfo isOnline lastSeen')
      .populate('admins', 'name email profileInfo');

    res.status(200).json({
      success: true,
      data: updatedGroup,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Send a group message via REST
// @route   POST /api/groups/:id/messages
// @access  Private
const sendGroupMessageREST = async (req, res, next) => {
  const { content, messageType = 'text' } = req.body;
  const { id: groupId } = req.params;

  if (!content) {
    res.status(400);
    return next(new Error('Content is required'));
  }

  try {
    const group = await Group.findById(groupId);
    if (!group) {
      res.status(404);
      return next(new Error('Group not found'));
    }

    if (!group.members.includes(req.user._id.toString())) {
      res.status(403);
      return next(new Error('Not a member of this group'));
    }

    const message = await Message.create({
      senderId: req.user._id,
      groupId,
      content,
      messageType,
      status: 'sent',
    });

    group.lastMessage = message._id;
    group.lastMessageAt = message.createdAt;
    await group.save();

    const populatedMessage = await message.populate('senderId', 'name email profileInfo');

    const io = req.app.get('io');
    if (io) {
      io.to(groupId).emit('receive_message', populatedMessage);
    }

    res.status(201).json({
      success: true,
      data: populatedMessage,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get group messaging history
// @route   GET /api/groups/:id/messages
// @access  Private
const getGroupMessages = async (req, res, next) => {
  const { id: groupId } = req.params;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  try {
    const group = await Group.findById(groupId);
    if (!group) {
      res.status(404);
      return next(new Error('Group not found'));
    }

    if (!group.members.includes(req.user._id.toString())) {
      res.status(403);
      return next(new Error('Unauthorized access to group messages'));
    }

    const messages = await Message.find({ groupId })
      .populate('senderId', 'name email profileInfo')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalMessages = await Message.countDocuments({ groupId });

    res.status(200).json({
      success: true,
      count: messages.length,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalMessages / limit),
        totalMessages,
      },
      data: messages.reverse(),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createGroup,
  getGroups,
  getGroupById,
  addMembers,
  removeMember,
  sendGroupMessageREST,
  getGroupMessages,
};
