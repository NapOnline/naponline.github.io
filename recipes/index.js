// Get table of contents
$(function() {
  var url = 'https://api.naponline.net/recipes/';
  $.getJSON(url, function(data) {
    $('#i_toc').html(data.index.recipes);
  }, "html");
});
