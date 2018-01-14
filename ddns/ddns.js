function update() {
  var url = 'https://api.naponline.net/ddns'
  $.ajax({
    url: url,
    type: 'post',
    data: {
      name: $('#name').val()
    },
    headers: {
      "x-api-key": $('#key').val()
    },
    dataType: 'json',
    success: function(data) {
      $('#status').html(data.stringify());
    }
  });
}

$(function(){
  $('#key').keypress(function(event){
    var keycode = (event.keyCode ? event.keyCode : event.which);
    if(keycode == '13'){
      update()
    }
    event.stopPropagation();
  });
  $('#name').keypress(function(event){
    var keycode = (event.keyCode ? event.keyCode : event.which);
    if(keycode == '13'){
      update()
    }
    event.stopPropagation();
  });
  $("button").click(function(){
    update()
  });
});
