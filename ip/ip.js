$(function() {
  var url = 'https://api.naponline.net/ip'
  $.get(url, function(data) {
    $('#ip_address_text').html(data)
  }, "text");
});

$(function() {
  var url = 'https://api.naponline.net/ip/details'
  $.getJSON(url, '', function(data) {
    $('#ip_address_json').html(JSON.stringify(data, null, 2))
  });
});
