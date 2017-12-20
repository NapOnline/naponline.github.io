$(function() {
  var url = 'https://api.naponline.net/ip'
  $.get(url, function(data) {
    $('#ip_address').html(data)
  }, "text");
});
