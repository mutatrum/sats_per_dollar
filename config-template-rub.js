module.exports = {
  screen_name: 'sats_per_ruble',
  schedule: '0 3-23/4 * * *',
  uri: 'https://api.binance.com/api/v3/ticker/bookTicker?symbol=BTCRUB',
  eval: 'result.askPrice',
  text_top_left: ' sats per ruble',
  text_bottom_left: 'We are all hodlonaut',
  text_bottom_right: 'CSW is a fraud',
  consumer_key: '',
  consumer_secret: '',
  access_token_key: '',
  access_token_secret: '',
}
