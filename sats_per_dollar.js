const { createCanvas } = require('canvas');
const fs = require('fs');
const https = require("https");
var Twitter = require('twitter');
var config = require('./config.js');

const URL = "https://api-pub.bitfinex.com/v2/ticker/tBTCUSD";
const WIDTH = 506;
const GRID = 10;
const COLUMNS = 16;

(async function () {
  
  console.log(`started ${new Date().toISOString()}`);

  var result = await getPrice();
  
  var price = result[0];
  console.log(`price: ${price}`);
  
  var sats = Math.floor(1 / price * 1e8);
  console.log(`sats per dollar: ${sats}`)
  
  var r = Math.floor(Math.random() * 256);
  var g = Math.floor(Math.random() * 256);
  var b = Math.floor(Math.random() * 256);
  
  var background = (255 << 24) + (b << 16) + (g << 8) + r;
  var color = (r * 0.299 + g * 0.587 + b * 0.114) > 186 ? 0xFF000000 : 0xFFFFFFFF;
  
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
    
    var p = (y * WIDTH) + x;
    
    pixels[p            ] = color;
    pixels[p         + 1] = color;
    pixels[p + WIDTH    ] = color;
    pixels[p + WIDTH + 1] = color;
    
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
  out.on('finish', () =>  post(sats));
})();

function getHeight(sats) {
  var rows = Math.floor(sats / (COLUMNS * GRID * GRID)) + 1;
  return (rows * 31) + 10;
}

function post(sats) {
  var twitter = new Twitter(config);
  
  const imageData = fs.readFileSync("image.png");
  
  twitter.post("media/upload", {media: imageData}, function(error, media, response) {
    if (error) {
      console.log(error);
    } else {
      console.log(`media/upload: ${response.statusCode} ${response.statusMessage}`);
      const status = {
        status: sats,
        media_ids: media.media_id_string
      }
   
      twitter.post("statuses/update", status, function(error, tweet, response) {
        if (error) {
          console.log(error);
        } else {
          
          console.log(`statuses/update: ${response.statusCode} ${response.statusMessage}`);
          console.log(`tweet id ${tweet.id}`);
          
          fs.unlinkSync('image.png');
          console.log(`finished ${new Date().toISOString()}`);
        }
      });
    }
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
