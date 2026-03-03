const prisma = require('../config/prisma');

const createAutoResponse = async (req, res) => {
  try {
    const { trigger, response } = req.body;
    const result = await prisma.chatAutoResponse.create({
      data: {
        trigger,
        response,
        isActive: true
      }
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAutoResponses = async (req, res) => {
  try {
    const responses = await prisma.chatAutoResponse.findMany({
      orderBy: { id: 'desc' }
    });
    res.json(responses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateAutoResponse = async (req, res) => {
  try {
    const { id } = req.params;
    const { trigger, response, isActive } = req.body;
    const result = await prisma.chatAutoResponse.update({
      where: { id: parseInt(id) },
      data: {
        trigger,
        response,
        isActive
      }
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteAutoResponse = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.chatAutoResponse.delete({ where: { id: parseInt(id) } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createAutoResponse,
  getAutoResponses,
  updateAutoResponse,
  deleteAutoResponse
};
