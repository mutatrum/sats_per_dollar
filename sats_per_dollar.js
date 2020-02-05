const { createCanvas } = require('canvas');
const fs = require('fs');
const https = require("https");
var Twitter = require('twitter');
var config = require('./config.js');

const URL = "https://api-pub.bitfinex.com/v2/ticker/tBTCUSD";
const WIDTH = 506;
const GRID = 10;
const COLUMNS = 16;

var in_reply_to;

(async function () {
  
  console.log(`started ${new Date().toISOString()}`);
 
  if (process.argv.length > 2) {
    in_reply_to = process.argv[2];
  }
  
  var result = await getPrice();
  
  var price = result[0];
  console.log(`price: ${price}`);
  
  var sats = Math.floor(1 / price * 1e8);
  console.log(`sats per dollar: ${sats}`)
  
  var r = Math.floor(Math.random() * 256);
  var g = Math.floor(Math.random() * 256);
  var b = Math.floor(Math.random() * 256);
  
  var background = (255 << 24) + (b << 16) + (g << 8) + r;
  var color = (r * 0.299 + g * 0.587 + b * 0.114) > 149 ? 0xFF000000 : 0xFFFFFFFF;
  
  var height = getHeight(sats);

  const canvas = createCanvas(WIDTH, height);
  const ctx = canvas.getContext('2d');
  
  const imageData = ctx.getImageData(0, 0, WIDTH, height);
  
  var buffer = new ArrayBuffer(imageData.data.length);
  var pixels = new Uint32Array(buffer);
  pixels.fill(background);
  
  var ax = 0, ay = 0, bx = 0, by = 0;
  
  for (var i = 0; i < sats; i++) {

    var x = 6 + (ax * 3) + (bx * 31);
    var y = 6 + (ay * 3) + (by * 31);
    
    dot(pixels, x, y, color);
    
    ax++;
    if (ax == GRID) {
      ax = 0;
      ay++;
    }
    
    if (ay == GRID) {
      bx++;
      ay = 0;
    }
    
    if (bx == COLUMNS) {
      by++;
      bx = 0;
    }
  }

  imageData.data.set(new Uint8ClampedArray(buffer));
  ctx.putImageData(imageData, 0, 0);

  const out = fs.createWriteStream('image.png');
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  out.on('finish', () =>  postStatus(sats));
})();

function dot(pixels, x, y, color) {
  var p = (y * WIDTH) + x;
  
  pixels[p            ] = color;
  pixels[p         + 1] = color;
  pixels[p + WIDTH    ] = color;
  pixels[p + WIDTH + 1] = color;
}

function getHeight(sats) {
  var rows = Math.floor(sats / (COLUMNS * GRID * GRID)) + 1;
  return (rows * 31) + 10;
}

async function postStatus(sats) {
  var twitter = new Twitter(config);
  
  if (in_reply_to) {
    var reply = await getStatusesShow(twitter, in_reply_to);
    screen_name = reply.user.screen_name;
    for (var name of reply.text.split(' ')) {
      if (name.startsWith('@') && screen_name.indexOf(name) == -1) {
        screen_name = screen_name + ' ' + name;
      }
    }
    console.log(`in reply to @${screen_name}`);
  }
  
  const imageData = fs.readFileSync("image.png");
  
  var media = await postMediaUpload(twitter, imageData);
  
  var status = {
    status: sats,
    media_ids: media.media_id_string
  }
  
  if (in_reply_to) {
    status.status = `@${screen_name} ${sats}`;
    status.in_reply_to_status_id = in_reply_to;
  }
  
  var tweet = postStatusesUpdate(twitter, status)
 
  console.log(`tweet id ${tweet.id}`);

  fs.unlinkSync('image.png');
  console.log(`finished ${new Date().toISOString()}`);
}

function getStatusesShow(twitter, id) {
  return new Promise(function(resolve, reject) {
    twitter.get("statuses/show/" + id, {}, function(error, media, response) {
      if (error) {
        reject(error);
      } else {
        console.log(`GET statuses/show: ${response.statusCode} ${response.statusMessage}`);
        resolve(media);
      }
    });    
  });
}

function postMediaUpload(twitter, imageData) {
  return new Promise(function(resolve, reject) {
    twitter.post("media/upload", {media: imageData}, function(error, media, response) {
      if (error) {
        reject(error);
      } else {
        console.log(`POST media/upload: ${response.statusCode} ${response.statusMessage}`);
        resolve(media);
      }
    });    
  });
}

function postStatusesUpdate(twitter, status) {
  return new Promise(function(resolve, reject) {
    twitter.post("statuses/update", status, function(error, tweet, response) {
      if (error) {
        reject(error);
      } else {
        console.log(`POST statuses/update: ${response.statusCode} ${response.statusMessage}`);
        resolve(tweet);
      }
    });
  });
}

function getPrice() {
  return new Promise(function(resolve, reject) {
    https.get(URL, { headers : { "accept" : "application/json" }}, res => {
      let body = "";
      res.on("data", data => {
        body += data;
      });
      res.on("end", () => {
        resolve(JSON.parse(body));
      });
    });
  });
}
