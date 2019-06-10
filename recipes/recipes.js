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

$(function() {
  var recipe = $.uriGet('r');
  var url = 'https://api.naponline.net/recipes/' + recipe;
  $.get(url, function(data) {
    $('#recipe').html(data);
  }, "html");
});

// Get table of contents
$(function() {
  var url = 'https://api.naponline.net/recipes'
  $.get(url, function(data) {
    $('#toc').html(data);
  }, "html");
});
