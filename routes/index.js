var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
  res.send({ some: 'json' });
});

module.exports = router;
