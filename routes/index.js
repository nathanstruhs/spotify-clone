var express = require('express');
var router = express.Router();
var AWS = require('aws-sdk');

AWS.config.loadFromPath('./aws-credentials.json');
let s3 = new AWS.S3({apiVersion: '2006-03-01'});
let bucket = 'struhs-spotify-clone';
let docClient = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10', region: 'us-east-1'});
var sqs = new AWS.SQS({apiVersion: '2012-11-05', region: 'us-east-1'});

router.post('/play', function (req, res) {
  console.log('play');

  const artist = req.body.artist,
    album = req.body.album,
    song = req.body.song;

  var params = {
    DelaySeconds: 10,
    MessageAttributes: {
      "artist": {
        DataType: "String",
        StringValue: artist
      },
      "album": {
        DataType: "String",
        StringValue: album
      },
      "song": {
        DataType: "String",
        StringValue: song
      }
    },
    MessageBody: "Spotify clone played song",
    QueueUrl: "https://sqs.us-east-1.amazonaws.com/739260242084/reporting"
  };

  sqs.sendMessage(params, function(err, data) {
    if (err) {
      console.log("Error", err);
    } else {
      console.log("Success", data.MessageId);
    }
  });
})

router.post('/save-user', function (req, res) {
  console.log('save user')
  console.log(req.body)

  let id = req.body.id,
      name = req.body.name,
      email = req.body.email;

  let params = {
    TableName : 'users',
    Item: {
        "id": id,
        "name": name,
        "email": email
    }
  };

  docClient.put(params, function(err, data) {
    if (err) {
        console.error("Unable to add item. Error JSON:", JSON.stringify(err, null, 2));
    }
  });
})


router.get('/all', function(req, res, next) {
  const params = { TableName : 'music' }
  docClient.scan(params, function(err, data) {
    if (err) {
      console.log(err);
    } else {
      res.send(data.Items);
    }
  });
});


router.get('/genres', function(req, res, next) {
  const params = { TableName : 'music' }
  docClient.scan(params, function(err, data) {
    if (err) {
      console.log(err);
    } else {
      let genres = new Set();
      data.Items.forEach(item => genres.add(item.genre));
      res.send([...genres]);
    }
  });
});

router.get('/artist/for/genre', function(req, res, next) {
  const genre = req.query.genre;
  const params = {
    TableName: 'music',
    KeyConditionExpression: "#genre = :genre",
    ExpressionAttributeNames:{
      "#genre": "genre"
    },
    ExpressionAttributeValues: {
      ":genre":genre
    }
  };

  docClient.query(params, function(err, data) {
    if (err) {
      console.log(err)
    } else {
      let artists = new Set();
      data.Items.forEach(item => artists.add(item.artist_album_song.substr(0, item.artist_album_song.indexOf('_'))));
      res.send([...artists]);
    }
  });
});

router.get('/albums/for/artist', function(req, res, next) {
  const artist = req.query.artist;
  const params = { TableName : 'music' }
  docClient.scan(params, function(err, data) {
    if (err) {
      console.log(err);
    } else {
      let albums = new Set();
      data.Items.forEach(item => {
        if (item.artist == artist) {
          console.log(item.artist)
          console.log(artist)
          console.log(item.artist_album_song)
          albums.add(item.artist_album_song.split('_')[1])
        }
      });
      res.send([...albums]);
    }
  });
})



router.get('/songs/for/album', function(req, res, next) {
  const album = req.query.album;
  const params = { TableName : 'music' }
  docClient.scan(params, function(err, data) {
    if (err) {
      console.log(err);
    } else {
      let songs = [];
      data.Items.forEach(item => {
        if (item.artist_album_song.split('_')[1] == album) {
          songs.push(item.artist_album_song.split('_')[2])
        }
      });
      res.send(songs);
    }
  });
})

router.get('/song', function(req, res, next) {
  const song = req.query.song;
  const params = { TableName : 'music' }
  docClient.scan(params, function(err, data) {
    if (err) {
      console.log(err);
    } else {
      let songs = [];
      data.Items.forEach(item => {
        if (item.artist_album_song.split('_')[2] == song) {
          const path = item.artist_album_song.replace(/_/g,'/');
          res.send(s3.getSignedUrl('getObject', { Bucket: bucket, Key: path }));
        }
      });
    }
  });
})


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
