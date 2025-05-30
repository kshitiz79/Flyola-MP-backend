const Passenger = require('../model/passanger'); 

exports.getAllPassengers = async (req, res) => {
  try {
    const passengers = await Passenger.findAll();
    res.status(200).json(passengers);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving passengers', error });
  }
};

exports.createPassenger = async (req, res) => {
  try {
    const { name, age, dob, title, type, bookingId } = req.body;

    
    if (!name || !dob || !title || !type || !bookingId) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    
    if (!['Adult', 'Child', 'Infant'].includes(type)) {
      return res.status(400).json({ message: 'Invalid passenger type' });
    }

    
    const passenger = await Passenger.create({
      name,
      age: age || null,
      dob,
      title,
      type,
      bookingId,
    });

    res.status(201).json({ message: 'Passenger created successfully', passenger });
  } catch (error) {
    res.status(500).json({ message: 'Error creating passenger', error: error.message });
  }
};