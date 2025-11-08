const Passenger = require('../model/passanger'); 




async function createPassenger(req, res) {
    try {
        const { name, age, dob, title, type, bookingId } = req.body;

        // Validate required fields
        if (!name || !dob || !title || !type || !bookingId) {
            return res.status(400).json({ success: false, message: 'Missing required fields: name, dob, title, type, bookingId' });
        }

        // Validate passenger type
        if (!['Adult', 'Child', 'Infant'].includes(type)) {
            return res.status(400).json({ success: false, message: 'Invalid passenger type: must be Adult, Child, or Infant' });
        }

        // Validate age if provided
        if (typeof age === 'number') {
            if (type === 'Infant' && (age < 0 || age > 2)) {
                return res.status(400).json({ success: false, message: 'Infant age must be between 0 and 2 years' });
            }
            if (type === 'Child' && (age <= 2 || age > 12)) {
                return res.status(400).json({ success: false, message: 'Child age must be between 2 and 12 years' });
            }
            if (type === 'Adult' && age <= 12) {
                return res.status(400).json({ success: false, message: 'Adult age must be greater than 12 years' });
            }
        }

        const passenger = await Passenger.create({
            name,
            age: age || null,
            dob,
            title,
            type,
            bookingId,
        });

        res.status(201).json({ success: true, message: 'Passenger created successfully', data: passenger });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error creating passenger', error: error.message });
    }
}




async function getAllPassengers(req, res) {
    try {
        const passengers = await Passenger.findAll();
        res.status(200).json({ success: true, data: passengers });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error retrieving passengers', error: error.message });
    }
}



module.exports = { createPassenger , getAllPassengers };  // Export the functions as a module






