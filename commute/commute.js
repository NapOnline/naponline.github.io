$(function () {
    var url = 'https://api.naponline.net/commute?address_hash=07d72756aed4a5eeb114ba34b9926777&format=gecko'
    $.getJSON(url, function (data) {
        $('#container').innerHTML(data)
    };
};
