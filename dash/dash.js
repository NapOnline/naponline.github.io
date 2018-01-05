$(function() {
  var url = 'http://www.chart.state.md.us/video/video.php?feed=7a00a1dc01250075004d823633235daa'
  $.get(url, function(data) {
    $('#camfeed0').html(data)
  }, "html");
});
