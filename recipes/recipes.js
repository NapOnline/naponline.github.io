// Get table of contents
$(function() {
  var url = 'https://api.naponline.net/recipes'
  $.get(url, function(data) {
    $('#toc').html(data)
  }, "html");
});
