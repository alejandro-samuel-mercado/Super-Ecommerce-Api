const chatService = require('../services/chat.service');

const getOpenConversations = async (req, res, next) => {
  try {
    const conversations = await chatService.getOpenConversations();
    res.status(200).json({
      status: 'success',
      data: { conversations }
    });
  } catch (error) {
    next(error);
  }
};

const getConversationById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const conversation = await chatService.getConversationById(parseInt(id));
    res.status(200).json({
      status: 'success',
      data: { conversation }
    });
  } catch (error) {
    next(error);
  }
};

const markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    await chatService.markAsRead(id);
    res.status(200).json({
      status: 'success'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOpenConversations,
  getConversationById,
  markAsRead
};
