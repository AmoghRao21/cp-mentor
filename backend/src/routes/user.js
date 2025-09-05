const express = require('express');
const router = express.Router();

// User routes placeholder
router.get('/profile', (req, res) => {
  res.json({ message: 'User profile endpoint' });
});

module.exports = router;