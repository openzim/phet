$( document ).ready(function() {
  $('body').on('DOMNodeInserted', '#sim', function(e) {
    $("div#sim>div>svg>g>g>g>g:nth-child(2)").remove(); // remove old logo from the right bottom corner of the first page of the simulation
       div[1]/svg/g/g/g[1]/g[2]/g[2]
    if($("div#sim>svg>g>g>g>g~g>g").length === 4) { // test if logo element is not removed. In case if function will be called more then one time
      $("div#sim>svg>g>g>g>g~g>g:nth-child(2)").remove(); // remove old logo from the right bottom corner of the next pages of the simulation
    }
  })
});