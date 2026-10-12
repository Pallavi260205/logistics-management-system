const Conversation = require('../models/Conversation');

// @desc    Get all conversations of the logged-in user
// @route   GET /api/chats
// @access  Private
const getConversations = async (req, res, next) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user._id,
    })
      .populate('participants', 'name email profileInfo isOnline lastSeen')
      .populate({
        path: 'lastMessage',
        populate: {
          path: 'senderId',
          select: 'name email profileInfo',
        },
      })
      .sort({ lastMessageAt: -1, updatedAt: -1 });

    res.status(200).json({
      success: true,
      count: conversations.length,
      data: conversations,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create or find a conversation
// @route   POST /api/chats
// @access  Private
const createOrFindConversation = async (req, res, next) => {
  const { receiverId } = req.body;

  if (!receiverId) {
    res.status(400);
    return next(new Error('Receiver ID is required'));
  }

  try {
    if (receiverId === req.user._id.toString()) {
      res.status(400);
      return next(new Error('Cannot create conversation with yourself'));
    }

    let conversation = await Conversation.findOne({
      participants: { $all: [req.user._id, receiverId] },
    });

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [req.user._id, receiverId],
      });
    }

    const populatedConversation = await Conversation.findById(conversation._id)
      .populate('participants', 'name email profileInfo isOnline lastSeen');

    res.status(200).json({
      success: true,
      data: populatedConversation,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getConversations,
  createOrFindConversation,
};
