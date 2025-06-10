const getModels = () => require('../model');

const createJoyrideBilling = async (req, res) => {
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

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  try {
    const newBilling = await getModels().Billing.create({
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
    res.status(500).json({ error: 'Failed to create billing: ' + err.message });
  }
};

const getJoyrideBillings = async (req, res) => {
  try {
    const billings = await getModels().Billing.findAll({
      include: [{ model: getModels().User, as: 'user' }],
    });
    res.json(billings);
  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
};

const getJoyrideBillingById = async (req, res) => {
  const { id } = req.params;
  try {
    const billing = await getModels().Billing.findByPk(id, {
      include: [{ model: getModels().User, as: 'user' }],
    });
    if (!billing) {
      return res.status(404).json({ error: 'Billing not found' });
    }
    res.json(billing);
  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
};

module.exports = {
  createJoyrideBilling,
  getJoyrideBillings,
  getJoyrideBillingById,
};