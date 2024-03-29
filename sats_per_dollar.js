require('log-timestamp');
const config = require('./config.js');
const lab = require('./lab.js');
const cron = require('node-cron');
const { createCanvas } = require('canvas');
const https = require("https");
const Twitter = require('twitter');
const twitter = new Twitter(config);

const PADDING = 10;
const BORDER = 24;
const RADIUS = 22;

const LARGE_GRID = {
  columns: 10,
  grid: 10,
  dot: 6,
  dot_gap: 2,
  grid_gap: 4,
  getHeight: function (sats) {
    var rows = Math.ceil(sats / (this.columns * 100));
    return (rows * 10 * this.dot) + (rows * 9 * this.dot_gap) + ((rows - 1) * this.grid_gap)
  }
}

const MEDIUM_GRID = {
  columns: 1,
  grid: 10,
  dot: 76,
  dot_gap: 6,
  grid_gap: 4,
  getHeight: function (sats) {
    var rows = Math.ceil(sats / this.grid);
    return (rows * this.dot) + ((rows - 1) * this.dot_gap)
  }
}

var settings = LARGE_GRID;
// var settings = MEDIUM_GRID;

const FONT_SIZE = 14;

(function () {
  console.log('init')
  if (process.argv.length > 2) {
    onSchedule(process.argv[2]);
  } else {
    cron.schedule(config.schedule, () => onSchedule());
    
    openStream();
  }
})()

var timeout = 0;

function openStream() {
  var stream = twitter.stream('statuses/filter', {track: `@${config.screen_name}`});
  stream.on('data', onTweet);
  stream.on('response', response => console.log(`stream response: ${response.statusCode}`));
  stream.on('error', error => {
    console.log('error: ' + JSON.stringify(error));
    if (timeout < 320000) {
      if (timeout < 5000) {
        timeout = 5000;
      } else {
        timeout *= 2;
      }
    }
  });
  stream.on('end', response => {
    if (timeout < 16000) {
      timeout += 250;
    }
    console.log(`stream end: ${response.statusCode}, reconnect in ${timeout / 1000}`);
    setTimeout(openStream, timeout);
  });
}

async function onTweet(tweet) {
  timeout = 0;
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
  
  var price = Function('result', "return " + config.eval)(result);
  console.log(`price: ${price}`);
  
  var sats = getSats(price);
  console.log(`sats: ${sats}`)

  var buffer = createImage(sats);

  if (in_reply_to == 'test') {
    const fs = require('fs');
    fs.writeFileSync('image.png', buffer);
  } else {
    postStatus(sats, buffer, in_reply_to).catch(exception => console.log(`ERROR ${JSON.stringify(exception)}`));
  }
}

function getSats(price) {
  var sats = 1e8 / price;
  if (sats < 1) {
    return sats.toFixed(3)
  }
  if (sats < 10) {
    return sats.toFixed(2)
  }
  if (sats < 100) {
    return sats.toFixed(1)
  }
  return Math.floor(sats)
}

function createImage(sats) {
  var [r, g, b] = lab.getRandomColor();
  
  var background = 0xFF000000 + (b << 16) + (g << 8) + r;
  var color = (r * 0.299 + g * 0.587 + b * 0.114) > 149 ? 0xFF000000 : 0xFFFFFFFF;
  
  var width = getWidth();
  var height = settings.getHeight(Math.floor(sats));

  var WIDTH = width + PADDING + PADDING + BORDER + BORDER;
  var HEIGHT = Math.max(height + (WIDTH - width), Math.ceil(WIDTH * 0.5625));
  if (HEIGHT % 2 == 1) {
    HEIGHT++;
  }

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  
  const imageData = ctx.getImageData(0, 0, WIDTH, HEIGHT);
  
  var buffer = new ArrayBuffer(imageData.data.length);
  var pixels = new Uint32Array(buffer);

  pixels.fill(0);

  var ox = (WIDTH - width) >> 1;
  var oy = (HEIGHT - height) >> 1;

  drawBackground(pixels, background, WIDTH, width, height, ox, oy);

  drawDots(pixels, color, WIDTH, ox, oy, sats);

  imageData.data.set(new Uint8ClampedArray(buffer));
  ctx.putImageData(imageData, 0, 0);
  ctx.fillStyle = `#${(color & 0xFFFFFF).toString(16)}`;
  ctx.font = `${FONT_SIZE}px DejaVu Sans Mono`;
  ctx.imageSmoothingEnabled = false;
  if (config.text_top_left) {
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    var text = sats + config.text_top_left
    ctx.fillText(text, ox, oy - (BORDER >> 1));
  }
  if (config.text_top_right) {
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(config.text_top_right, ox + width, oy - (BORDER >> 1));
  }
  if (config.text_bottom_left) {
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(config.text_bottom_left, ox, oy + height + (BORDER >> 1));
  }
  if (config.text_bottom_right) {
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(config.text_bottom_right, ox + width, oy + height + (BORDER >> 1));
  }
  return canvas.toBuffer();
}

function getWidth() {
  return (settings.columns * 10 * settings.dot) + (settings.columns * 9 * settings.dot_gap) + ((settings.columns - 1) * settings.grid_gap);
}

function drawBackground(pixels, color, WIDTH, width, height, ox, oy) {
  ox -= BORDER;
  oy -= BORDER;
  width += BORDER << 1;
  height += BORDER << 1;
  
  var circle = getCircle()

  var x = ox + ((oy + RADIUS) * WIDTH);
  for (var i = 0; i <= height - RADIUS - RADIUS; i++) {
    pixels.fill(color, x, x + width);
    x += WIDTH;
  }
  var x = ox + RADIUS + (oy * WIDTH);
  var x2 = (height - RADIUS - 1) * WIDTH;
  for (var i = 0; i <= RADIUS; i++) {
    var c1 = circle[RADIUS - i];
    pixels.fill(color, x - c1, x + width + c1 - RADIUS - RADIUS);
    var c2 = circle[i];
    pixels.fill(color, x + x2 - c2, x + x2 + width + c2 - RADIUS - RADIUS);
    x += WIDTH;
  }
}

function drawDots(pixels, color, WIDTH, ox ,oy, sats) {
  var block = (settings.dot * settings.columns) + (settings.dot_gap * (settings.columns - 1)) + settings.grid_gap

  var ax = 0, ay = 0, bx = 0, by = 0;
  
  for (var i = 0; i < Math.floor(sats); i++) {

    var x = ox + (ax * (settings.dot + settings.dot_gap)) + (bx * block);
    var y = oy + (ay * (settings.dot + settings.dot_gap)) + (by * block);
    
    dot(pixels, WIDTH, x, y, color);
    
    ax++;
    if (ax == settings.grid) {
      ax = 0;
      ay++;
    }
    
    if (ay == settings.grid) {
      bx++;
      ay = 0;
    }
    
    if (bx == settings.columns) {
      by++;
      bx = 0;
    }
  }
}

function getCircle() {
  var circle = new Array(RADIUS);
  circle[0] = RADIUS;

  var x = 0;
  var y = RADIUS;
  var d = 3 - (2 * RADIUS);
 
  while(x <= y) {
    if(d <= 0) {
      d = d + (4 * x) + 6;
    } else {
      d = d + (4 * x) - (4 * y) + 10;
      y--;
    }
    x++;

    circle[x] = y;
    circle[y] = x;
  }

  return circle;
}

function dot(pixels, WIDTH, x, y, color) {
  var p = (y * WIDTH) + x;
  for (var i = 0; i < settings.dot; i++) {
    pixels.fill(color, p, p + settings.dot);
    p += WIDTH;
  }
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
    https.get(config.uri, { headers : { "accept" : "application/json" }}, res => {
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
