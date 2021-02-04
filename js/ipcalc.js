$(function() {
  var url = 'https://api.naponline.net/ipcalc'
  $.get(url, function(data) {
    $('#ipcalc_form').html(data)
  }, "html");
});
