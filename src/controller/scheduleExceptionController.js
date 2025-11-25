const getModels = () => require('../model');
const { format } = require('date-fns-tz');

// Create or update exception for a specific date
async function createScheduleException(req, res) {
  const models = getModels();
  const {
    schedule_id,
    exception_date,
    exception_type,
    override_price,
    override_departure_time,
    override_arrival_time,
    override_status,
    reason,
  } = req.body;

  // Validation
  if (!schedule_id || !exception_date || !exception_type) {
    return res.status(400).json({
      error: 'schedule_id, exception_date, and exception_type are required',
    });
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exception_date)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
  }

  try {
    // Check if schedule exists
    const schedule = await models.FlightSchedule.findByPk(schedule_id);
    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    // Check if schedule is one-time (exceptions only for recurring schedules)
    if (schedule.is_one_time === 1) {
      return res.status(400).json({ 
        error: 'Cannot create exceptions for one-time flights. Edit the schedule directly.' 
      });
    }

    // Get user ID from token (assuming you have auth middleware)
    const created_by = req.user?.id || null;

    // Create or update exception
    const [exception, created] = await models.FlightScheduleException.upsert({
      schedule_id,
      exception_date,
      exception_type,
      override_price,
      override_departure_time,
      override_arrival_time,
      override_status,
      reason,
      created_by,
      updated_at: new Date(),
    });

    res.status(created ? 201 : 200).json({
      message: created ? 'Exception created' : 'Exception updated',
      exception,
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to create exception',
      details: err.message,
    });
  }
}

// Get all exceptions for a schedule
async function getScheduleExceptions(req, res) {
  const models = getModels();
  const { schedule_id } = req.params;

  try {
    const exceptions = await models.FlightScheduleException.findAll({
      where: { schedule_id },
      order: [['exception_date', 'ASC']],
    });

    res.json(exceptions);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch exceptions', details: err.message });
  }
}

// Get exception for a specific date
async function getExceptionByDate(req, res) {
  const models = getModels();
  const { schedule_id, date } = req.query;

  if (!schedule_id || !date) {
    return res.status(400).json({ error: 'schedule_id and date are required' });
  }

  try {
    const exception = await models.FlightScheduleException.findOne({
      where: { 
        schedule_id,
        exception_date: date 
      },
    });

    if (!exception) {
      return res.status(404).json({ error: 'No exception found for this date' });
    }

    res.json(exception);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch exception', details: err.message });
  }
}

// Delete exception (restore to normal schedule)
async function deleteScheduleException(req, res) {
  const models = getModels();
  const { id } = req.params;

  try {
    const exception = await models.FlightScheduleException.findByPk(id);
    if (!exception) {
      return res.status(404).json({ error: 'Exception not found' });
    }

    await exception.destroy();
    res.json({ message: 'Exception deleted, schedule restored to normal' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete exception', details: err.message });
  }
}

// Quick cancel a specific date
async function cancelScheduleDate(req, res) {
  const models = getModels();
  const { schedule_id, exception_date, reason } = req.body;

  if (!schedule_id || !exception_date) {
    return res.status(400).json({ error: 'schedule_id and exception_date are required' });
  }

  try {
    const created_by = req.user?.id || null;

    await models.FlightScheduleException.upsert({
      schedule_id,
      exception_date,
      exception_type: 'CANCEL',
      override_status: 0,
      reason: reason || 'Cancelled by admin',
      created_by,
      updated_at: new Date(),
    });

    res.json({ message: `Schedule cancelled for ${exception_date}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel schedule', details: err.message });
  }
}

module.exports = {
  createScheduleException,
  getScheduleExceptions,
  getExceptionByDate,
  deleteScheduleException,
  cancelScheduleDate,
};
