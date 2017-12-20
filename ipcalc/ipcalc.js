$(function() {
  var url = 'https://api.naponline.net/ipcalc'
  $.get(url, function(data) {
    $('#ipcalc').load(data)
  }, "text");
});
