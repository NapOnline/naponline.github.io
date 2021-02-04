$(function() {
  var url = 'https://api.naponline.net/ipcalc'
  $.get(url, function(data) {
    $('#ipcalc-form').html(data)
  }, "html");
});
