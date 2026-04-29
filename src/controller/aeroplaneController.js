const db = require('../../db');

// ==================== AIRPORT CRUD ====================

// Get all airports
exports.getAllAirports = async (req, res) => {
  try {
    const [airports] = await db.query('SELECT * FROM airports ORDER BY id DESC');
    res.json(airports);
  } catch (error) {
    console.error('Error fetching airports:', error);
    res.status(500).json({ error: 'Failed to fetch airports' });
  }
};

// Get single airport
exports.getAirportById = async (req, res) => {
  try {
    const [airport] = await db.query('SELECT * FROM airports WHERE id = ?', [req.params.id]);
    if (airport.length === 0) {
      return res.status(404).json({ error: 'Airport not found' });
    }
    res.json(airport[0]);
  } catch (error) {
    console.error('Error fetching airport:', error);
    res.status(500).json({ error: 'Failed to fetch airport' });
  }
};

// Create airport
exports.createAirport = async (req, res) => {
  try {
    const { airport_name, city, airport_code, state, country } = req.body;
    
    if (!airport_name || !city || !airport_code) {
      return res.status(400).json({ error: 'Airport name, city, and code are required' });
    }

    const [result] = await db.query(
      'INSERT INTO airports (airport_name, city, airport_code, state, country) VALUES (?, ?, ?, ?, ?)',
      [airport_name, city, airport_code, state || null, country || 'India']
    );

    res.status(201).json({ 
      message: 'Airport created successfully', 
      id: result.insertId 
    });
  } catch (error) {
    console.error('Error creating airport:', error);
    res.status(500).json({ error: 'Failed to create airport' });
  }
};

// Update airport
exports.updateAirport = async (req, res) => {
  try {
    const { airport_name, city, airport_code, state, country } = req.body;
    
    const [result] = await db.query(
      'UPDATE airports SET airport_name = ?, city = ?, airport_code = ?, state = ?, country = ? WHERE id = ?',
      [airport_name, city, airport_code, state, country, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Airport not found' });
    }

    res.json({ message: 'Airport updated successfully' });
  } catch (error) {
    console.error('Error updating airport:', error);
    res.status(500).json({ error: 'Failed to update airport' });
  }
};

// Delete airport
exports.deleteAirport = async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM airports WHERE id = ?', [req.params.id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Airport not found' });
    }

    res.json({ message: 'Airport deleted successfully' });
  } catch (error) {
    console.error('Error deleting airport:', error);
    res.status(500).json({ error: 'Failed to delete airport' });
  }
};

// ==================== FLIGHT CRUD ====================

// Get all flights
exports.getAllFlights = async (req, res) => {
  try {
    const [flights] = await db.query('SELECT * FROM flights ORDER BY id DESC');
    res.json(flights);
  } catch (error) {
    console.error('Error fetching flights:', error);
    res.status(500).json({ error: 'Failed to fetch flights' });
  }
};

// Get single flight
exports.getFlightById = async (req, res) => {
  try {
    const [flight] = await db.query('SELECT * FROM flights WHERE id = ?', [req.params.id]);
    if (flight.length === 0) {
      return res.status(404).json({ error: 'Flight not found' });
    }
    res.json(flight[0]);
  } catch (error) {
    console.error('Error fetching flight:', error);
    res.status(500).json({ error: 'Failed to fetch flight' });
  }
};

// Create flight
exports.createFlight = async (req, res) => {
  try {
    const { flight_name, flight_number, total_seats, aircraft_type } = req.body;
    
    if (!flight_name || !flight_number) {
      return res.status(400).json({ error: 'Flight name and number are required' });
    }

    const [result] = await db.query(
      'INSERT INTO flights (flight_name, flight_number, total_seats, aircraft_type) VALUES (?, ?, ?, ?)',
      [flight_name, flight_number, total_seats || 0, aircraft_type || null]
    );

    res.status(201).json({ 
      message: 'Flight created successfully', 
      id: result.insertId 
    });
  } catch (error) {
    console.error('Error creating flight:', error);
    res.status(500).json({ error: 'Failed to create flight' });
  }
};

// Update flight
exports.updateFlight = async (req, res) => {
  try {
    const { flight_name, flight_number, total_seats, aircraft_type } = req.body;
    
    const [result] = await db.query(
      'UPDATE flights SET flight_name = ?, flight_number = ?, total_seats = ?, aircraft_type = ? WHERE id = ?',
      [flight_name, flight_number, total_seats, aircraft_type, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Flight not found' });
    }

    res.json({ message: 'Flight updated successfully' });
  } catch (error) {
    console.error('Error updating flight:', error);
    res.status(500).json({ error: 'Failed to update flight' });
  }
};

// Delete flight
exports.deleteFlight = async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM flights WHERE id = ?', [req.params.id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Flight not found' });
    }

    res.json({ message: 'Flight deleted successfully' });
  } catch (error) {
    console.error('Error deleting flight:', error);
    res.status(500).json({ error: 'Failed to delete flight' });
  }
};

// ==================== HELICOPTER CRUD ====================

// Get all helicopters
exports.getAllHelicopters = async (req, res) => {
  try {
    const [helicopters] = await db.query('SELECT * FROM helicopters ORDER BY id DESC');
    res.json(helicopters);
  } catch (error) {
    console.error('Error fetching helicopters:', error);
    res.status(500).json({ error: 'Failed to fetch helicopters' });
  }
};

// Get single helicopter
exports.getHelicopterById = async (req, res) => {
  try {
    const [helicopter] = await db.query('SELECT * FROM helicopters WHERE id = ?', [req.params.id]);
    if (helicopter.length === 0) {
      return res.status(404).json({ error: 'Helicopter not found' });
    }
    res.json(helicopter[0]);
  } catch (error) {
    console.error('Error fetching helicopter:', error);
    res.status(500).json({ error: 'Failed to fetch helicopter' });
  }
};

// Create helicopter
exports.createHelicopter = async (req, res) => {
  try {
    const { helicopter_name, helicopter_number, total_seats, model } = req.body;
    
    if (!helicopter_name || !helicopter_number) {
      return res.status(400).json({ error: 'Helicopter name and number are required' });
    }

    const [result] = await db.query(
      'INSERT INTO helicopters (helicopter_name, helicopter_number, total_seats, model) VALUES (?, ?, ?, ?)',
      [helicopter_name, helicopter_number, total_seats || 0, model || null]
    );

    res.status(201).json({ 
      message: 'Helicopter created successfully', 
      id: result.insertId 
    });
  } catch (error) {
    console.error('Error creating helicopter:', error);
    res.status(500).json({ error: 'Failed to create helicopter' });
  }
};

// Update helicopter
exports.updateHelicopter = async (req, res) => {
  try {
    const { helicopter_name, helicopter_number, total_seats, model } = req.body;
    
    const [result] = await db.query(
      'UPDATE helicopters SET helicopter_name = ?, helicopter_number = ?, total_seats = ?, model = ? WHERE id = ?',
      [helicopter_name, helicopter_number, total_seats, model, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Helicopter not found' });
    }

    res.json({ message: 'Helicopter updated successfully' });
  } catch (error) {
    console.error('Error updating helicopter:', error);
    res.status(500).json({ error: 'Failed to update helicopter' });
  }
};

// Delete helicopter
exports.deleteHelicopter = async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM helicopters WHERE id = ?', [req.params.id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Helicopter not found' });
    }

    res.json({ message: 'Helicopter deleted successfully' });
  } catch (error) {
    console.error('Error deleting helicopter:', error);
    res.status(500).json({ error: 'Failed to delete helicopter' });
  }
};

// ==================== HELIPAD CRUD ====================

// Get all helipads
exports.getAllHelipads = async (req, res) => {
  try {
    const [helipads] = await db.query('SELECT * FROM helipads ORDER BY id DESC');
    res.json(helipads);
  } catch (error) {
    console.error('Error fetching helipads:', error);
    res.status(500).json({ error: 'Failed to fetch helipads' });
  }
};

// Get single helipad
exports.getHelipadById = async (req, res) => {
  try {
    const [helipad] = await db.query('SELECT * FROM helipads WHERE id = ?', [req.params.id]);
    if (helipad.length === 0) {
      return res.status(404).json({ error: 'Helipad not found' });
    }
    res.json(helipad[0]);
  } catch (error) {
    console.error('Error fetching helipad:', error);
    res.status(500).json({ error: 'Failed to fetch helipad' });
  }
};

// Create helipad
exports.createHelipad = async (req, res) => {
  try {
    const { helipad_name, city, helipad_code, state, country } = req.body;
    
    if (!helipad_name || !city || !helipad_code) {
      return res.status(400).json({ error: 'Helipad name, city, and code are required' });
    }

    const [result] = await db.query(
      'INSERT INTO helipads (helipad_name, city, helipad_code, state, country) VALUES (?, ?, ?, ?, ?)',
      [helipad_name, city, helipad_code, state || null, country || 'India']
    );

    res.status(201).json({ 
      message: 'Helipad created successfully', 
      id: result.insertId 
    });
  } catch (error) {
    console.error('Error creating helipad:', error);
    res.status(500).json({ error: 'Failed to create helipad' });
  }
};

// Update helipad
exports.updateHelipad = async (req, res) => {
  try {
    const { helipad_name, city, helipad_code, state, country } = req.body;
    
    const [result] = await db.query(
      'UPDATE helipads SET helipad_name = ?, city = ?, helipad_code = ?, state = ?, country = ? WHERE id = ?',
      [helipad_name, city, helipad_code, state, country, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Helipad not found' });
    }

    res.json({ message: 'Helipad updated successfully' });
  } catch (error) {
    console.error('Error updating helipad:', error);
    res.status(500).json({ error: 'Failed to update helipad' });
  }
};

// Delete helipad
exports.deleteHelipad = async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM helipads WHERE id = ?', [req.params.id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Helipad not found' });
    }

    res.json({ message: 'Helipad deleted successfully' });
  } catch (error) {
    console.error('Error deleting helipad:', error);
    res.status(500).json({ error: 'Failed to delete helipad' });
  }
};

// ==================== FLIGHT SCHEDULE CRUD ====================

// Get all flight schedules
exports.getAllFlightSchedules = async (req, res) => {
  try {
    const [schedules] = await db.query(`
      SELECT fs.*, 
             f.flight_name, f.flight_number,
             a1.city as departure_city, a1.airport_code as departure_code,
             a2.city as arrival_city, a2.airport_code as arrival_code
      FROM flight_schedules fs
      LEFT JOIN flights f ON fs.flight_id = f.id
      LEFT JOIN airports a1 ON fs.departure_airport_id = a1.id
      LEFT JOIN airports a2 ON fs.arrival_airport_id = a2.id
      ORDER BY fs.id DESC
    `);
    res.json(schedules);
  } catch (error) {
    console.error('Error fetching flight schedules:', error);
    res.status(500).json({ error: 'Failed to fetch flight schedules' });
  }
};

// Get single flight schedule
exports.getFlightScheduleById = async (req, res) => {
  try {
    const [schedule] = await db.query(`
      SELECT fs.*, 
             f.flight_name, f.flight_number,
             a1.city as departure_city, a1.airport_code as departure_code,
             a2.city as arrival_city, a2.airport_code as arrival_code
      FROM flight_schedules fs
      LEFT JOIN flights f ON fs.flight_id = f.id
      LEFT JOIN airports a1 ON fs.departure_airport_id = a1.id
      LEFT JOIN airports a2 ON fs.arrival_airport_id = a2.id
      WHERE fs.id = ?
    `, [req.params.id]);
    
    if (schedule.length === 0) {
      return res.status(404).json({ error: 'Flight schedule not found' });
    }
    res.json(schedule[0]);
  } catch (error) {
    console.error('Error fetching flight schedule:', error);
    res.status(500).json({ error: 'Failed to fetch flight schedule' });
  }
};

// Create flight schedule
exports.createFlightSchedule = async (req, res) => {
  try {
    const { 
      flight_id, 
      departure_airport_id, 
      arrival_airport_id, 
      departure_time, 
      arrival_time,
      price,
      available_seats,
      days_of_week
    } = req.body;
    
    if (!flight_id || !departure_airport_id || !arrival_airport_id || !departure_time || !arrival_time) {
      return res.status(400).json({ error: 'Flight, airports, and times are required' });
    }

    const [result] = await db.query(
      `INSERT INTO flight_schedules 
       (flight_id, departure_airport_id, arrival_airport_id, departure_time, arrival_time, price, available_seats, days_of_week) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [flight_id, departure_airport_id, arrival_airport_id, departure_time, arrival_time, price || 0, available_seats || 0, days_of_week || null]
    );

    res.status(201).json({ 
      message: 'Flight schedule created successfully', 
      id: result.insertId 
    });
  } catch (error) {
    console.error('Error creating flight schedule:', error);
    res.status(500).json({ error: 'Failed to create flight schedule' });
  }
};

// Update flight schedule
exports.updateFlightSchedule = async (req, res) => {
  try {
    const { 
      flight_id, 
      departure_airport_id, 
      arrival_airport_id, 
      departure_time, 
      arrival_time,
      price,
      available_seats,
      days_of_week
    } = req.body;
    
    const [result] = await db.query(
      `UPDATE flight_schedules 
       SET flight_id = ?, departure_airport_id = ?, arrival_airport_id = ?, 
           departure_time = ?, arrival_time = ?, price = ?, available_seats = ?, days_of_week = ?
       WHERE id = ?`,
      [flight_id, departure_airport_id, arrival_airport_id, departure_time, arrival_time, price, available_seats, days_of_week, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Flight schedule not found' });
    }

    res.json({ message: 'Flight schedule updated successfully' });
  } catch (error) {
    console.error('Error updating flight schedule:', error);
    res.status(500).json({ error: 'Failed to update flight schedule' });
  }
};

// Delete flight schedule
exports.deleteFlightSchedule = async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM flight_schedules WHERE id = ?', [req.params.id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Flight schedule not found' });
    }

    res.json({ message: 'Flight schedule deleted successfully' });
  } catch (error) {
    console.error('Error deleting flight schedule:', error);
    res.status(500).json({ error: 'Failed to delete flight schedule' });
  }
};

// ==================== HELICOPTER SCHEDULE CRUD ====================

// Get all helicopter schedules
exports.getAllHelicopterSchedules = async (req, res) => {
  try {
    const [schedules] = await db.query(`
      SELECT hs.*, 
             h.helicopter_name, h.helicopter_number,
             hp1.city as departure_city, hp1.helipad_code as departure_code,
             hp2.city as arrival_city, hp2.helipad_code as arrival_code
      FROM helicopter_schedules hs
      LEFT JOIN helicopters h ON hs.helicopter_id = h.id
      LEFT JOIN helipads hp1 ON hs.departure_helipad_id = hp1.id
      LEFT JOIN helipads hp2 ON hs.arrival_helipad_id = hp2.id
      ORDER BY hs.id DESC
    `);
    res.json(schedules);
  } catch (error) {
    console.error('Error fetching helicopter schedules:', error);
    res.status(500).json({ error: 'Failed to fetch helicopter schedules' });
  }
};

// Get single helicopter schedule
exports.getHelicopterScheduleById = async (req, res) => {
  try {
    const [schedule] = await db.query(`
      SELECT hs.*, 
             h.helicopter_name, h.helicopter_number,
             hp1.city as departure_city, hp1.helipad_code as departure_code,
             hp2.city as arrival_city, hp2.helipad_code as arrival_code
      FROM helicopter_schedules hs
      LEFT JOIN helicopters h ON hs.helicopter_id = h.id
      LEFT JOIN helipads hp1 ON hs.departure_helipad_id = hp1.id
      LEFT JOIN helipads hp2 ON hs.arrival_helipad_id = hp2.id
      WHERE hs.id = ?
    `, [req.params.id]);
    
    if (schedule.length === 0) {
      return res.status(404).json({ error: 'Helicopter schedule not found' });
    }
    res.json(schedule[0]);
  } catch (error) {
    console.error('Error fetching helicopter schedule:', error);
    res.status(500).json({ error: 'Failed to fetch helicopter schedule' });
  }
};

// Create helicopter schedule
exports.createHelicopterSchedule = async (req, res) => {
  try {
    const { 
      helicopter_id, 
      departure_helipad_id, 
      arrival_helipad_id, 
      departure_time, 
      arrival_time,
      price,
      available_seats,
      days_of_week
    } = req.body;
    
    if (!helicopter_id || !departure_helipad_id || !arrival_helipad_id || !departure_time || !arrival_time) {
      return res.status(400).json({ error: 'Helicopter, helipads, and times are required' });
    }

    const [result] = await db.query(
      `INSERT INTO helicopter_schedules 
       (helicopter_id, departure_helipad_id, arrival_helipad_id, departure_time, arrival_time, price, available_seats, days_of_week) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [helicopter_id, departure_helipad_id, arrival_helipad_id, departure_time, arrival_time, price || 0, available_seats || 0, days_of_week || null]
    );

    res.status(201).json({ 
      message: 'Helicopter schedule created successfully', 
      id: result.insertId 
    });
  } catch (error) {
    console.error('Error creating helicopter schedule:', error);
    res.status(500).json({ error: 'Failed to create helicopter schedule' });
  }
};

// Update helicopter schedule
exports.updateHelicopterSchedule = async (req, res) => {
  try {
    const { 
      helicopter_id, 
      departure_helipad_id, 
      arrival_helipad_id, 
      departure_time, 
      arrival_time,
      price,
      available_seats,
      days_of_week
    } = req.body;
    
    const [result] = await db.query(
      `UPDATE helicopter_schedules 
       SET helicopter_id = ?, departure_helipad_id = ?, arrival_helipad_id = ?, 
           departure_time = ?, arrival_time = ?, price = ?, available_seats = ?, days_of_week = ?
       WHERE id = ?`,
      [helicopter_id, departure_helipad_id, arrival_helipad_id, departure_time, arrival_time, price, available_seats, days_of_week, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Helicopter schedule not found' });
    }

    res.json({ message: 'Helicopter schedule updated successfully' });
  } catch (error) {
    console.error('Error updating helicopter schedule:', error);
    res.status(500).json({ error: 'Failed to update helicopter schedule' });
  }
};

// Delete helicopter schedule
exports.deleteHelicopterSchedule = async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM helicopter_schedules WHERE id = ?', [req.params.id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Helicopter schedule not found' });
    }

    res.json({ message: 'Helicopter schedule deleted successfully' });
  } catch (error) {
    console.error('Error deleting helicopter schedule:', error);
    res.status(500).json({ error: 'Failed to delete helicopter schedule' });
  }
};
