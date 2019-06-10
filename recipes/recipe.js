// Get recipe
$(function() {
  var recipe = $.uriGet('r');
  if (recipe != '') {
    var url = 'https://api.naponline.net/recipes/' + recipe;
    $.getJSON(url, function(data) {
      $('#r_name').html(data.recipe.name);
      $('#r_description').html(data.recipe.description);
      $('#r_created').html(data.recipe.created);
      $('#r_modified').html(data.recipe.modified);
    }, "html");
  } else {
    $('#r_name').html('No recipe id provided.');
  }
});
