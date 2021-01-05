require('log-timestamp');
const config = require('./config.js');
const cron = require('node-cron');
const { createCanvas } = require('canvas');
const https = require("https");
const Twitter = require('twitter');
const twitter = new Twitter(config);

const URL = "https://api-pub.bitfinex.com/v2/ticker/tBTCUSD";
const WIDTH = 506;
const GRID = 10;
const COLUMNS = 16;

(function () {
  console.log('init')
  if (process.argv.length > 2) {
    onSchedule(process.argv[2]);
  } else {
    cron.schedule('0 */4 * * *', () => onSchedule());
    
    var stream = twitter.stream('statuses/filter', {track: `@${config.screen_name}`});
    stream.on('data', onTweet);
    stream.on('error', error => console.log(error));
    stream.on('end', response => console.log(response));
  }
})();

async function onTweet(tweet) {
  console.log(JSON.stringify(tweet));
  if (shouldReply(tweet)) {
    await onSchedule(tweet.id_str);
  }
}

function shouldReply(tweet) {
  if (tweet.user.screen_name == config.screen_name) {
    return false;
  }
  if (tweet.retweeted_status) {
    console.log(`retweet by ${tweet.user.screen_name}`);
    return false;
  }
  if (tweet.in_reply_to_status_id_str) {
    console.log(`reply by ${tweet.user.screen_name}: ${tweet.text}`);
    return hasUserMention(tweet);
  }
  if (tweet.quoted_status_id_str) {
    console.log(`quote by ${tweet.user.screen_name}: ${tweet.text}`);
    return hasUserMention(tweet);
  }
  console.log(`mention by ${tweet.user.screen_name}: ${tweet.text}`);
  return true;
}

function hasUserMention(tweet) {
  var display_text_range = 0;
  if (tweet.extended_tweet) {
    if (tweet.extended_tweet.display_text_range) {
      display_text_range = tweet.extended_tweet.display_text_range[0];
    }
    for (var user_mention of tweet.extended_tweet.entities.user_mentions) {
      if (user_mention.screen_name == config.screen_name && user_mention.indices[0] >= display_text_range) {
        return true;
      }
    }
  }
  if (tweet.display_text_range) {
    display_text_range = tweet.display_text_range[0];
  }
  for (var user_mention of tweet.entities.user_mentions) {
    if (user_mention.screen_name == config.screen_name && user_mention.indices[0] >= display_text_range) {
      return true;
    }
  }
  return false;
}

async function onSchedule(in_reply_to) {
  console.log('start');
 
  var result = await getPrice();
  
  if (result.code) {
    console.log(`code ${result.code} ${result.error}: ${result.error_description}`);
    console.log('done');
    return;
  }
  
  var price = result[6];
  console.log(`price: ${price}`);
  
  var sats = Math.floor(1e8 / price);
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

  postStatus(sats, canvas.toBuffer(), in_reply_to);
}

function dot(pixels, x, y, color) {
  var p = (y * WIDTH) + x;
  
  pixels[p            ] = color;
  pixels[p         + 1] = color;
  pixels[p + WIDTH    ] = color;
  pixels[p + WIDTH + 1] = color;
}

function getHeight(sats) {
  var rows = Math.floor(sats / (COLUMNS * GRID * GRID)) + 1;
  var height = (rows * 31) + 10;
  return Math.max(height, 285);
}

async function postStatus(sats, imageData, in_reply_to) {
  if (in_reply_to) {
    var reply = await getStatusesShow(twitter, in_reply_to);
    screen_name = reply.user.screen_name;
    var mentions = reply.text.match(/@[a-zA-Z0-9_]*/g);
    if (mentions != null) {
      for (var name of mentions) {
        if (screen_name.indexOf(name) == -1 && name != config.screen_name) {
          screen_name = screen_name + ' ' + name;
        }
      }
    }
    console.log(`in reply to @${screen_name}`);
  }
  
  var media = await postMediaUpload(twitter, imageData);
  
  var status = {
    status: sats,
    media_ids: media.media_id_string
  }
  
  if (in_reply_to) {
    status.status = `@${screen_name} ${sats}`;
    status.in_reply_to_status_id = in_reply_to;
  }
  
  var tweet = await postStatusesUpdate(twitter, status)
 
  console.log(`tweet id ${tweet.id}`);

  console.log('done');
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
