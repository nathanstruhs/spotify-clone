var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
  var musicLibrary = req.app.get('musicLibrary');
  res.send({ musicLibrary });
});

module.exports = router;
