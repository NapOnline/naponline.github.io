$('#container').append('START > ');
var url = 'https://api.naponline.net/commute?address_hash=07d72756aed4a5eeb114ba34b9926777&format=gecko';
$.getJSON(url, function (data) {
  $('#container').append(data);
})
  .done(function() {
    $('#status').append('done');
  })
  .always(function() {
    $('#status').append('always');
  })
  .fail(function() {
    $('#status').append('fail');
  });
$('#container').append(' < END');
