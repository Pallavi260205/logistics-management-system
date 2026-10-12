const Message = require('../models/Message');
const Conversation = require('../models/Conversation');

// @desc    Get messages for a conversation
// @route   GET /api/chats/:conversationId/messages
// @access  Private
const getMessages = async (req, res, next) => {
  const { conversationId } = req.params;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  try {
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      res.status(404);
      return next(new Error('Conversation not found'));
    }

    // Verify user authorization to access the conversation messages
    const isParticipant = conversation.participants.includes(req.user._id);
    if (!isParticipant) {
      res.status(403);
      return next(new Error('Unauthorized access to this conversation'));
    }

    const messages = await Message.find({ conversationId })
      .populate('senderId', 'name email profileInfo')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalMessages = await Message.countDocuments({ conversationId });

    res.status(200).json({
      success: true,
      count: messages.length,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalMessages / limit),
        totalMessages,
      },
      // Reverse messages to return chronological order (oldest first)
      data: messages.reverse(),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMessages,
};
