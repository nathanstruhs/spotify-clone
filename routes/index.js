var express = require('express');
var router = express.Router();
var AWS = require('aws-sdk');

AWS.config.loadFromPath('./aws-credentials.json');
let s3 = new AWS.S3({apiVersion: '2006-03-01'});
let bucket = 'struhs-spotify-clone';

router.get('/', function(req, res, next) {
  s3.listObjectsV2({ Bucket: bucket }, function(err, data) {
    if (err) {
      console.log(err, err.stack);
    } else {
      let m = collectMusic(data.Contents);
      const musicLibrary = buildMusicJSON(m);
      res.send({ musicLibrary });
    }
  });
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

module.exports = router;
