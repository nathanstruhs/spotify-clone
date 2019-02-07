var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var AWS = require('aws-sdk');

var indexRouter = require('./routes/index');

var app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use(function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
})

app.use('/', indexRouter);

AWS.config.loadFromPath('./aws-credentials.json');

var s3 = new AWS.S3({apiVersion: '2006-03-01'});
var bucket = 'struhs-spotify-clone';
s3.listObjectsV2({ Bucket: bucket }, function(err, data) {
  if (err) {
    console.log(err, err.stack);
  } else {
    let m = collectMusic(data.Contents);
    const musicLibrary = buildMusicJSON(m);
    app.set('musicLibrary', musicLibrary);
  }
});

app.use(function(req, res, next) {
  next(createError(404));
});

app.use(function(err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
  res.status(err.status || 500);
  res.render('error');
});

let collectMusic = (data) => {
  return data.map(obj => {
    return obj.Key.split('/')
  });
}

let buildMusicJSON = (data) => {
  let music = [];

  let artists = new Set(data.map(path => (path[0])));

  artists.forEach(artist => {
    music.push({ artist })
  });

  data.forEach(path => {
    music.forEach(item => {
      if (path[0] == item.artist) {
        if (item.hasOwnProperty('albums')) {
          item.albums.forEach(album => {
            if (album.name !== path[1]) { item.albums.push({ name: path[1] }) }
          });
        } else {
          item['albums'] = [{ name: path[1] }]
        }
      }
    });
  });

  data.forEach(path => {
    console.log(path);
    if (path[2].includes('.mp3')) {
      music.forEach(item => {
        item.albums.forEach(album => {
          if (album.name === path[1]) {
            if (album.hasOwnProperty('songs')) {
              album.songs.push({
                name: path[2],
                url: s3.getSignedUrl('getObject', { Bucket: bucket, Key: path.join('/') })
              })
            } else {
              album['songs'] = [{
                name: path[2],
                url: s3.getSignedUrl('getObject', { Bucket: bucket, Key: path.join('/') })
              }]
            }
          }
        })
      });
    }
  });

  return music;
}

module.exports = app;
