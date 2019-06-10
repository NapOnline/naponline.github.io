(function ($) {
    $.extend({
        uriGet: function () {
          var url_string = location.href;
          var url = new URL(url_string);
          var val = url.searchParams.get(arguments[0]);
          return val;
        }
    });
})(jQuery);

// Get recipe
$(function() {
  var recipe = $.uriGet('r');
  var url = 'https://api.naponline.net/recipes/' + recipe;
  $.get(url, function(data) {
    $('#recipe_header').html(data.recipe.name);
    $('#recipe').html(data);
  }, "html");
});
