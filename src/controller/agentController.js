
const models = require('../model');

async function addWalletAmount(req, res) {
  const { agentId, amount } = req.body;

  if (!req.user || req.user.role !== 1) {
    return res.status(403).json({ error: 'Forbidden: Only admins can add wallet amount' });
  }

  if (!agentId || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Invalid agentId or amount (must be positive number)' });
  }

  try {
    const agent = await models.Agent.findByPk(agentId);
    if (!agent) {
      return res.status(404).json({ error: `Agent with ID ${agentId} not found` });
    }

    await agent.increment('wallet_amount', { by: amount });

    return res.json({
      message: 'Wallet amount added successfully',
      agent: { id: agent.id, agentId: agent.agentId, wallet_amount: Number(agent.wallet_amount) },
    });
  } catch (err) {
    console.error('addWalletAmount error:', err);
    return res.status(500).json({ error: 'Failed to add wallet amount' });
  }
}

async function getAgentWallet(req, res) {
  const { agentId } = req.params;

  if (!req.user || req.user.role !== 1) {
    return res.status(403).json({ error: 'Forbidden: Only admins can view wallet' });
  }

  try {
    const agent = await models.Agent.findByPk(agentId, {
      attributes: ['id', 'agentId', 'username', 'wallet_amount', 'no_of_ticket_booked'],
    });
    if (!agent) {
      return res.status(404).json({ error: `Agent with ID ${agentId} not found` });
    }

    return res.json({
      id: agent.id,
      agentId: agent.agentId,
      username: agent.username,
      wallet_amount: Number(agent.wallet_amount),
      no_of_ticket_booked: agent.no_of_ticket_booked,
    });
  } catch (err) {
    console.error('getAgentWallet error:', err);
    return res.status(500).json({ error: 'Failed to fetch agent wallet' });
  }
}

async function getAllAgents(req, res) {
  if (!req.user || req.user.role !== 1) {
    return res.status(403).json({ error: 'Forbidden: Only admins can view agents' });
  }

  try {
    const agents = await models.Agent.findAll({
      attributes: ['id', 'agentId', 'username', 'wallet_amount', 'no_of_ticket_booked'],
    });

    return res.json(
      agents.map((agent) => ({
        id: agent.id,
        agentId: agent.agentId,
        username: agent.username,
        wallet_amount: Number(agent.wallet_amount),
        no_of_ticket_booked: agent.no_of_ticket_booked,
      }))
    );
  } catch (err) {
    console.error('getAllAgents error:', err);
    return res.status(500).json({ error: 'Failed to fetch agents' });
  }
}
async function getAgentById(req, res) {
  const { id } = req.params;
  if (!req.user || req.user.role !== 1) {
    return res.status(403).json({ error: 'Forbidden: Only admins can view agent' });
  }
  try {
    const agent = await models.Agent.findByPk(id, {
      attributes: ['id', 'agentId', 'username', 'wallet_amount', 'no_of_ticket_booked'],
    });
    if (!agent) {
      return res.status(404).json({ error: `Agent with ID ${id} not found` });
    }
    return res.json({
      id: agent.id,
      agentId: agent.agentId,
      username: agent.username,
      wallet_amount: Number(agent.wallet_amount),
      no_of_ticket_booked: agent.no_of_ticket_booked,
    });
  } catch (err) {
    console.error('getAgentById error:', err);
    return res.status(500).json({ error: 'Failed to fetch agent' });
  }
}

module.exports = {
  addWalletAmount,
  getAgentWallet,
  getAllAgents,
  getAgentById,
};
