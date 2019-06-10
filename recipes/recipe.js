// Get recipe
$(function() {
  var recipe = $.uriGet('r');
  var url = 'https://api.naponline.net/recipes/' + recipe;
  $.get(url, function(data) {
    $('#recipe_header').html(data.recipe.name);
    $('#recipe').html(data);
  }, "html");
});
