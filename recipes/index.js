// Get table of contents
$(function() {
  var url = 'https://api.naponline.net/recipes';
  $.getJSON(url, function(data) {
    $('#toc').html(data.index.recipes);
  }, "html");
});
