class Lab {
  getRandomColor = () => {
    do {
      var l = Math.floor(Math.random() * 101); 
      var a = Math.floor(Math.random() * 256) - 128; 
      var b = Math.floor(Math.random() * 256) - 128
      var r = lab2rgb([l, a, b]);
    } while (r == -1)
    return r
  }
}

module.exports = function() {
  return new Lab()
}()

function lab2rgb(lab){
  var y = (lab[0] + 16) / 116,
      x = lab[1] / 500 + y,
      z = y - lab[2] / 200,
      r, g, b;

  x = 0.95047 * ((x * x * x > 0.008856) ? x * x * x : (x - 16/116) / 7.787);
  y = 1.00000 * ((y * y * y > 0.008856) ? y * y * y : (y - 16/116) / 7.787);
  z = 1.08883 * ((z * z * z > 0.008856) ? z * z * z : (z - 16/116) / 7.787);

  r = x *  3.2406 + y * -1.5372 + z * -0.4986;
  g = x * -0.9689 + y *  1.8758 + z *  0.0415;
  b = x *  0.0557 + y * -0.2040 + z *  1.0570;

  r = (r > 0.0031308) ? (1.055 * Math.pow(r, 1/2.4) - 0.055) : 12.92 * r;
  g = (g > 0.0031308) ? (1.055 * Math.pow(g, 1/2.4) - 0.055) : 12.92 * g;
  b = (b > 0.0031308) ? (1.055 * Math.pow(b, 1/2.4) - 0.055) : 12.92 * b;

  if (r < 0 || r > 1 || g < 0 || g > 1 || b < 0 || b > 1) {
    return -1
  }

  return [Math.round(r * 255),
          Math.round(g * 255), 
          Math.round(b * 255)]
}
