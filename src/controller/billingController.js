const getModels = () => require('../model');

// Get all billings
const getBillings = async (req, res) => {
  const models = getModels();
  try {
    const billings = await models.Billing.findAll();
    res.json(billings);
  } catch (err) {
    console.error('Error fetching billings:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get a billing by ID
const getBillingById = async (req, res) => {
  const models = getModels();
  const { id } = req.params;
  try {
    const billing = await models.Billing.findByPk(id);
    if (!billing) {
      return res.status(404).json({ error: 'Billing not found' });
    }
    res.json(billing);
  } catch (err) {
    console.error('Error fetching billing:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Create a billing
const createBilling = async (req, res) => {
  const models = getModels();
  const {
    billing_name,
    billing_email,
    billing_number,
    billing_address,
    billing_country,
    billing_state,
    billing_pin_code,
    GST_Number,
    user_id,
  } = req.body;

  try {
    const newBilling = await models.Billing.create({
      billing_name,
      billing_email,
      billing_number,
      billing_address,
      billing_country,
      billing_state,
      billing_pin_code,
      GST_Number,
      user_id,
    });
    res.status(201).json(newBilling);
  } catch (err) {
    console.error('Error creating billing:', err);
    res.status(500).json({ error: 'Failed to create billing' });
  }
};

// Update a billing
const updateBilling = async (req, res) => {
  const models = getModels();
  const { id } = req.params;
  const {
    billing_name,
    billing_email,
    billing_number,
    billing_address,
    billing_country,
    billing_state,
    billing_pin_code,
    GST_Number,
    user_id,
  } = req.body;

  try {
    const billing = await models.Billing.findByPk(id);
    if (!billing) {
      return res.status(404).json({ error: 'Billing not found' });
    }
    await billing.update({
      billing_name,
      billing_email,
      billing_number,
      billing_address,
      billing_country,
      billing_state,
      billing_pin_code,
      GST_Number,
      user_id,
    });
    res.json({ message: 'Billing updated successfully' });
  } catch (err) {
    console.error('Error updating billing:', err);
    res.status(500).json({ error: 'Failed to update billing' });
  }
};

// Delete a billing
const deleteBilling = async (req, res) => {
  const models = getModels();
  const { id } = req.params;
  try {
    const billing = await models.Billing.findByPk(id);
    if (!billing) {
      return res.status(404).json({ error: 'Billing not found' });
    }
    await billing.destroy();
    res.json({ message: 'Billing deleted successfully' });
  } catch (err) {
    console.error('Error deleting billing:', err);
    res.status(500).json({ error: 'Failed to delete billing' });
  }
};

module.exports = {
  getBillings,
  getBillingById,
  createBilling,
  updateBilling,
  deleteBilling,
};