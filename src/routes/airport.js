const express = require('express');
const router = express.Router();
const airportController = require('./../controller/airportController');

router.get('/', airportController.getAirports);
router.post('/', airportController.addAirport);


router.put('/:id', airportController.updateAirport);
router.delete('/:id', airportController.deleteAirport);
router.put('/activate', airportController.activateAllAirports);
router.put('/edit', airportController.editAllAirports);
router.delete('/', airportController.deleteAllAirports);

module.exports = router;