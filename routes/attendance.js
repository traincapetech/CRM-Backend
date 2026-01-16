const express = require('express');
const {
  checkIn,
  checkOut,
  getTodayAttendance,
  getAttendanceHistory,
  getAllAttendance,
  updateAttendance,
  getMonthlyAttendanceSummary,
  createAttendance
} = require('../controllers/attendance');

const router = express.Router();
const { protect } = require('../middleware/auth');

// Protect all routes
router.use(protect);

// Employee attendance routes
router.post('/checkin', checkIn);
router.put('/checkout', checkOut);
router.get('/today', getTodayAttendance);
router.get('/history', getAttendanceHistory);
router.get('/summary/:month/:year', getMonthlyAttendanceSummary);

// Admin/HR/Manager routes
router.get('/all', getAllAttendance);
router.post('/', createAttendance);
router.put('/:id', updateAttendance);

module.exports = router; 