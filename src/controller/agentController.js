
const models = require('../model');

async function addWalletAmount(req, res) {
  const { agentId, amount } = req.body;

  // if (!req.user || req.user.role !== 1) {
  //   return res.status(403).json({ error: 'Forbidden: Only admins can add wallet amount' });
  // }

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

async function deductWalletAmount(req, res) {
  const { agentId, amount } = req.body;

  if (!agentId || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Invalid agentId or amount (must be positive number)' });
  }

  try {
    const agent = await models.Agent.findByPk(agentId);
    if (!agent) {
      return res.status(404).json({ error: `Agent with ID ${agentId} not found` });
    }

    if (Number(agent.wallet_amount) < amount) {
      return res.status(400).json({ error: 'Insufficient wallet balance' });
    }

    await agent.decrement('wallet_amount', { by: amount });

    return res.json({
      message: 'Wallet amount deducted successfully',
      agent: { id: agent.id, agentId: agent.agentId, wallet_amount: Number(agent.wallet_amount) - amount },
    });
  } catch (err) {
    console.error('deductWalletAmount error:', err);
    return res.status(500).json({ error: 'Failed to deduct wallet amount' });
  }
}

async function getAgentBookings(req, res) {
  const { agentId } = req.params;
  const { page = 1, limit = 10, status, startDate, endDate } = req.query;

  try {
    const agent = await models.Agent.findByPk(agentId);
    if (!agent) {
      return res.status(404).json({ error: `Agent with ID ${agentId} not found` });
    }

    const offset = (page - 1) * limit;
    const where = { agentId: agentId };
    
    if (status && status !== 'All') {
      where.bookingStatus = status.toUpperCase();
    }
    
    if (startDate && endDate) {
      where.bookDate = {
        [models.Sequelize.Op.between]: [startDate, endDate]
      };
    }

    const bookings = await models.Booking.findAndCountAll({
      where,
      include: [
        { model: models.Passenger, required: false },
        { 
          model: models.FlightSchedule, 
          required: false,
          include: [
            { model: models.Flight, required: false },
            { model: models.Airport, as: 'DepartureAirport', required: false },
            { model: models.Airport, as: 'ArrivalAirport', required: false }
          ]
        },
        { model: models.BookedSeat, attributes: ['seat_label'], required: false },
        { model: models.Payment, as: 'Payments', required: false },
        { model: models.Agent, required: false },
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']],
    });

    const bookingsWithBilling = await Promise.all(
      bookings.rows.map(async (booking) => {
        const billing = await models.Billing.findOne({ where: { user_id: booking.bookedUserId } });
        return {
          ...booking.toJSON(),
          seatLabels: booking.BookedSeats.map((s) => s.seat_label),
          billing: billing?.toJSON() || null,
        };
      })
    );

    return res.json({
      success: true,
      data: bookingsWithBilling,
      pagination: {
        total: bookings.count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(bookings.count / limit),
      },
      agent: {
        id: agent.id,
        agentId: agent.agentId,
        username: agent.username,
        wallet_amount: Number(agent.wallet_amount),
        no_of_ticket_booked: agent.no_of_ticket_booked,
      },
    });
  } catch (err) {
    console.error('getAgentBookings error:', err);
    return res.status(500).json({ error: 'Failed to fetch agent bookings' });
  }
}

async function getAgentDashboardData(req, res) {
  try {
    // Get all agents with their stats
    const agents = await models.Agent.findAll({
      attributes: ['id', 'agentId', 'username', 'wallet_amount', 'no_of_ticket_booked'],
    });

    // Get booking statistics for each agent
    const agentStats = await Promise.all(
      agents.map(async (agent) => {
        const totalBookings = await models.Booking.count({
          where: { agentId: agent.id }
        });

        const totalRevenue = await models.Booking.sum('totalFare', {
          where: { agentId: agent.id, bookingStatus: 'SUCCESS' }
        });

        const recentBookings = await models.Booking.findAll({
          where: { agentId: agent.id },
          include: [
            { model: models.FlightSchedule, required: false },
            { model: models.BookedSeat, attributes: ['seat_label'], required: false },
          ],
          limit: 5,
          order: [['created_at', 'DESC']],
        });

        return {
          ...agent.toJSON(),
          wallet_amount: Number(agent.wallet_amount),
          totalBookings,
          totalRevenue: Number(totalRevenue) || 0,
          recentBookings: recentBookings.map(booking => ({
            ...booking.toJSON(),
            seatLabels: booking.BookedSeats.map((s) => s.seat_label),
          })),
        };
      })
    );

    // Overall statistics
    const totalAgents = agents.length;
    const totalWalletAmount = agents.reduce((sum, agent) => sum + Number(agent.wallet_amount), 0);
    const totalTicketsBooked = agents.reduce((sum, agent) => sum + agent.no_of_ticket_booked, 0);

    return res.json({
      success: true,
      data: {
        agents: agentStats,
        summary: {
          totalAgents,
          totalWalletAmount,
          totalTicketsBooked,
        },
      },
    });
  } catch (err) {
    console.error('getAgentDashboardData error:', err);
    return res.status(500).json({ error: 'Failed to fetch agent dashboard data' });
  }
}

async function recalculateAgentStats(req, res) {
  try {
    const { agentId } = req.params;
    
    let agents;
    if (agentId) {
      // Recalculate for specific agent
      const agent = await models.Agent.findByPk(agentId);
      if (!agent) {
        return res.status(404).json({ error: `Agent with ID ${agentId} not found` });
      }
      agents = [agent];
    } else {
      // Recalculate for all agents
      agents = await models.Agent.findAll();
    }
    
    const results = [];
    
    for (const agent of agents) {
      // Count actual bookings and passengers for this agent
      const bookings = await models.Booking.findAll({
        where: { agentId: agent.id },
        attributes: ['id', 'noOfPassengers', 'bookingStatus']
      });
      
      const totalPassengers = bookings.reduce((sum, booking) => {
        // Only count confirmed/successful bookings
        if (booking.bookingStatus === 'CONFIRMED' || booking.bookingStatus === 'SUCCESS') {
          return sum + booking.noOfPassengers;
        }
        return sum;
      }, 0);
      
      const oldCount = agent.no_of_ticket_booked;
      
      if (oldCount !== totalPassengers) {
        await agent.update({ 
          no_of_ticket_booked: totalPassengers 
        });
      }
      
      results.push({
        agentId: agent.id,
        agentCode: agent.agentId,
        username: agent.username,
        oldCount,
        newCount: totalPassengers,
        updated: oldCount !== totalPassengers
      });
    }
    
    return res.json({
      success: true,
      message: 'Agent statistics recalculated successfully',
      results
    });
    
  } catch (err) {
    console.error('recalculateAgentStats error:', err);
    return res.status(500).json({ error: 'Failed to recalculate agent statistics' });
  }
}

module.exports = {
  addWalletAmount,
  deductWalletAmount,
  getAgentWallet,
  getAllAgents,
  getAgentById,
  getAgentBookings,
  getAgentDashboardData,
  recalculateAgentStats,
};
