$(function() {
  var url = 'https://api.naponline.net/ip'
  $.getJSON(url, function(data) {
    $('#ip_address').html(data)
  });
});
